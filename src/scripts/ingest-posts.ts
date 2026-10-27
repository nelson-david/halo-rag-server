import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { openaiService } from "../services/openai.service.js";
import { vectorDBService } from "../services/vectordb.service.js";
import { env } from "../config/env.js";
import { RawPost, PostPayload } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Noise filter rules
 */
const PROMO_REGEX =
    /#(sponsored|ad|promo|partner|affiliate)\b|discounts?|coupon\s*code|sign\s*up\s*at\s*https?:\/\/\S+/gi;
const MEDIA_LINK_REGEX =
    /https?:\/\/(t\.co|pic\.twitter\.com|pbs\.twimg\.com)\/[a-zA-Z0-9_-]+/gi;
const GENERIC_SHORT_REPLIES =
    /^(thanks!?|thank you!?|great thread!?|agreed!?|\+1|following|dm sent|sent dm|interested|congrats!?|wow!?|nice!?|check dm!?|💯|🔥|👏)+$/i;

/**
 * Generates a deterministic RFC 4122 compliant UUID v4 format from a string
 * to comply with Qdrant's requirement for point IDs (unsigned int or UUID).
 */
function toDeterministicUUID(value: string): string {
    const hash = crypto.createHash("md5").update(value).digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/**
 * Cleans individual tweet/post text of promo spam and media URLs.
 */
function cleanPostText(text: string): string {
    let cleaned = text
        .replace(MEDIA_LINK_REGEX, "")
        .replace(PROMO_REGEX, "")
        .replace(/\s+/g, " ")
        .trim();

    // Remove thread markers like "1/5", "1/ ", "2/n"
    cleaned = cleaned.replace(/^(\d+[\/|)]\s*(\d+|n)?)/i, "").trim();

    return cleaned;
}

/**
 * Evaluates whether a post is a low-value reply or noise.
 */
function isLowValueNoise(post: RawPost): boolean {
    const clean = cleanPostText(post.text);

    // Filter out ultra-short posts or pure conversational replies
    if (clean.length < 35) {
        return true;
    }

    if (GENERIC_SHORT_REPLIES.test(clean.trim())) {
        return true;
    }

    return false;
}

/**
 * Derives engagement score if not already present.
 */
function computeEngagementScore(post: RawPost): number {
    if (typeof post.engagementScore === "number") {
        return post.engagementScore;
    }

    const likes = post.likes || post.likeCount || 0;
    const retweets = post.retweets || post.retweetCount || 0;
    const replies = post.replies || post.replyCount || 0;
    const bookmarks = post.bookmarks || post.bookmarkCount || 0;

    return likes * 1 + retweets * 2 + replies * 1.5 + bookmarks * 3;
}

/**
 * Reconstructs multi-part threads into cohesive, single context blocks.
 */
function reconstructThreads(posts: RawPost[]): PostPayload[] {
    const filtered = posts.filter((p) => !isLowValueNoise(p));

    // Map to cluster threads by conversation_id or threadId
    const threadMap = new Map<string, RawPost[]>();
    const standalonePosts: RawPost[] = [];

    for (const post of filtered) {
        const threadKey = post.conversation_id || post.threadId;
        if (threadKey) {
            if (!threadMap.has(threadKey)) {
                threadMap.set(threadKey, []);
            }
            threadMap.get(threadKey)!.push(post);
        } else {
            standalonePosts.push(post);
        }
    }

    const chunks: PostPayload[] = [];

    // Process grouped threads
    for (const [threadId, threadPosts] of threadMap.entries()) {
        // Sort posts chronologically
        threadPosts.sort((a, b) => {
            const dateA = new Date(a.created_at || a.date || 0).getTime();
            const dateB = new Date(b.created_at || b.date || 0).getTime();
            return dateA - dateB;
        });

        const rootPost = threadPosts[0];
        const combinedText = threadPosts
            .map((p) => cleanPostText(p.text))
            .filter((t) => t.length > 0)
            .join("\n\n");

        if (combinedText.length < 40) continue;

        const totalEngagement = threadPosts.reduce(
            (sum, p) => sum + computeEngagementScore(p),
            0,
        );
        const primaryDate =
            rootPost.created_at ||
            rootPost.createdAt ||
            rootPost.date ||
            new Date().toISOString();
        const primaryUrl =
            rootPost.url ||
            rootPost.twitterUrl ||
            rootPost.link ||
            `https://x.com/i/status/${rootPost.id}`;

        // Extract first sentence as a descriptive title if title isn't provided
        const firstSentence =
            combinedText.split(/[.?!]\s/)[0] || "Executive HR Strategy";
        const title =
            rootPost.title ||
            (firstSentence.length > 80
                ? `${firstSentence.slice(0, 80)}...`
                : firstSentence);

        chunks.push({
            id: `thread-${threadId}`,
            text: combinedText,
            date: primaryDate,
            url: primaryUrl,
            engagementScore: totalEngagement,
            title,
            category: rootPost.category || "Org Design",
            tags: rootPost.tags || ["Talent Strategy", "Leadership"],
            author: rootPost.author || "Elena Vance",
            threadId,
        });
    }

    // Process standalone posts
    for (const post of standalonePosts) {
        const cleaned = cleanPostText(post.text);
        if (cleaned.length < 40) continue;

        const firstSentence = cleaned.split(/[.?!]\s/)[0] || "HR Strategy Note";
        const title =
            post.title ||
            (firstSentence.length > 80
                ? `${firstSentence.slice(0, 80)}...`
                : firstSentence);

        chunks.push({
            id: `post-${post.id}`,
            text: cleaned,
            date:
                post.created_at ||
                post.createdAt ||
                post.date ||
                new Date().toISOString(),
            url:
                post.url ||
                post.twitterUrl ||
                post.link ||
                `https://x.com/i/status/${post.id}`,
            engagementScore: computeEngagementScore(post),
            title,
            category: post.category || "Culture & Retention",
            tags: post.tags || ["People Operations", "Hiring"],
            author: post.author || "Elena Vance",
        });
    }

    return chunks;
}

/**
 * Main ingestion script execution.
 */
export async function runIngestion(filePathArg?: string) {
    const customFilePath = filePathArg || process.argv[2];
    const candidatePaths = [
        customFilePath,
        path.resolve(process.cwd(), "data/posts.json"),
        path.resolve(process.cwd(), "server/data/posts.json"),
        path.resolve(process.cwd(), "../data/posts.json"),
        path.resolve(__dirname, "../../data/posts.json"),
        path.resolve(__dirname, "../../../data/posts.json"),
    ].filter(Boolean) as string[];

    let targetFile: string | null = null;
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            targetFile = p;
            break;
        }
    }

    if (!targetFile) {
        console.error(
            `❌ Ingestion failed: Target data file not found in candidates:\n${candidatePaths.join("\n")}`,
        );
        process.exit(1);
    }

    console.log(`\n==============================================`);
    console.log(`🚀 Starting Halo Ingestion Pipeline`);
    console.log(`📁 Target Source File: ${targetFile}`);
    console.log(`🧠 Embedding Model: ${env.OPENAI_EMBEDDING_MODEL} (1536-dim)`);
    console.log(`📦 Vector Collection: ${env.QDRANT_COLLECTION_NAME}`);
    console.log(`==============================================`);

    const fileRaw = fs.readFileSync(targetFile, "utf-8");
    let rawPosts: RawPost[] = [];

    try {
        rawPosts = JSON.parse(fileRaw);
        if (!Array.isArray(rawPosts)) {
            throw new Error("Data file must contain a JSON array of posts.");
        }
    } catch (err) {
        console.error(`❌ Error parsing JSON file: ${(err as Error).message}`);
        process.exit(1);
    }

    console.log(`📥 Loaded ${rawPosts.length} raw posts from disk.`);

    // 1. Thread reconstruction and noise cleaning
    const payloadChunks = reconstructThreads(rawPosts);
    console.log(
        `✨ Filtered noise & reconstructed into ${payloadChunks.length} cohesive knowledge chunks.`,
    );

    if (payloadChunks.length === 0) {
        console.warn(`⚠️ No valid chunks to embed after noise filtering.`);
        return;
    }

    // 2. Ensure Vector DB collection
    console.log(
        `📦 Verifying collection "${env.QDRANT_COLLECTION_NAME}" in Qdrant...`,
    );
    await vectorDBService.ensureCollection(env.QDRANT_COLLECTION_NAME, 1536);

    // 3. Generate embeddings
    console.log(
        `🧠 Generating embeddings with OpenAI "${env.OPENAI_EMBEDDING_MODEL}"...`,
    );
    const textsToEmbed = payloadChunks.map(
        (c) => `${c.title || ""}\n${c.text}`,
    );
    const embeddings = await openaiService.generateEmbeddings(textsToEmbed);
    console.log(`✅ Generated ${embeddings.length} vector embeddings.`);

    // 4. Upsert into Vector DB using deterministic UUID point IDs
    console.log(
        `💾 Upserting points into Qdrant collection "${env.QDRANT_COLLECTION_NAME}"...`,
    );
    const points = payloadChunks.map((chunk, idx) => ({
        id: toDeterministicUUID(chunk.id),
        vector: embeddings[idx],
        payload: chunk,
    }));

    await vectorDBService.upsertPoints(env.QDRANT_COLLECTION_NAME, points);

    console.log(
        `\n🎉 Ingestion completed successfully! Total indexed: ${points.length} chunks.`,
    );
    console.log(`==============================================\n`);
}

// Execute when called directly
const isDirectExecution =
    process.argv[1]?.endsWith("ingest-posts.ts") ||
    process.argv[1]?.endsWith("ingest-posts.js");

if (isDirectExecution) {
    runIngestion().catch((error) => {
        console.error("Fatal ingestion error:", error);
        process.exit(1);
    });
}
