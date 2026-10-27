import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { InsightPost } from "../types/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Formats noisy social media date strings into clean, readable uppercase dates (e.g., "OCT 24, 2026").
 */
function formatPostDate(rawDate?: string): string {
    if (!rawDate) return "RECENT";
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
        return d
            .toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            })
            .toUpperCase();
    }
    return rawDate.toUpperCase();
}

/**
 * Clean post text by removing promo tags, raw media links, and extra whitespace.
 */
function cleanPostSummary(text: string): string {
    return text
        .replace(/https?:\/\/(t\.co|pic\.twitter\.com)\/[a-zA-Z0-9_-]+/gi, "")
        .replace(/RT @\w+:\s*/gi, "")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Transforms a raw Twitter/X post from posts.json into an executive InsightPost object.
 */
function transformRawPostToInsight(post: any, index: number): InsightPost {
    const text: string = post.text || "";
    const lower = text.toLowerCase();
    const sourceUrl =
        post.url ||
        post.twitterUrl ||
        (post.id ? `https://x.com/Halosznn_/status/${post.id}` : "https://x.com/Halosznn_");

    let category = "CAREER POSITIONING";
    let title = "Career & Talent Strategy Intelligence";
    let keyCalibrations: string[] = [];
    let tags: string[] = ["Career Strategy", "Talent Operations"];
    let suggestedQuestions: string[] = [];

    if (
        lower.includes("laid off") ||
        lower.includes("actively applying") ||
        lower.includes("depend on one job") ||
        lower.includes("job hunting")
    ) {
        category = "CAREER POSITIONING";
        title = "The Continuous Job Search Thesis: Never Depend on a Single Remote Role";
        keyCalibrations = [
            "Company restructuring and sudden 90-day layoffs make single-job reliance an unhedged operational risk.",
            "Active pitching and interview pipelines should remain warm continuously, even while gainfully employed.",
            "Treating job hunting as ongoing career insurance prevents panic when macroeconomic headwinds hit.",
        ];
        tags = ["Career Positioning", "Remote Work", "Resilience", "Talent Hedging"];
        suggestedQuestions = [
            "How do I maintain continuous job search pipelines without compromising focus on my current role?",
            "What signals indicate that a company restructuring or layoff might affect my department?",
            "What are the best frameworks for pitching businesses directly for remote advisory or contract work?",
        ];
    } else if (lower.includes("a bit sick") || lower.includes("onboard a few people")) {
        category = "JOB OPPORTUNITIES";
        title = "Remote Talent Surge: Virtual Assistant, Recruitment Intern & Community Lead";
        keyCalibrations = [
            "Immediate remote intake for high-agency Virtual Assistant handling executive communications, DMs, and scheduling.",
            "Recruitment Intern position designed for hands-on sourcing and candidate calibration.",
            "Community Manager role to steward audience engagement and operational workflows.",
        ];
        tags = ["Job Opportunities", "Remote Hiring", "Executive Operations", "Recruitment"];
        suggestedQuestions = [
            "What portfolio signals make an applicant stand out for a remote Virtual Assistant position?",
            "How should a recruitment intern showcase sourcing capabilities with zero formal agency experience?",
            "What core KPIs should a remote community manager track in their first 30 days?",
        ];
    } else if (lower.includes("rovedana is hiring")) {
        category = "JOB OPPORTUNITIES";
        title = "Rovedana Remote Intake: Client Relationship Intern (NGN 100k)";
        keyCalibrations = [
            "Entry-level remote opening (0-1 year experience) in corporate sales and client management.",
            "Key requirements: fluency with modern CRM platforms, Google Workspace, and Microsoft Office tools.",
            "Evaluates rapid adaptability to asynchronous remote environments with minimal supervision.",
        ];
        tags = ["Job Opportunities", "Client Success", "Sales Operations", "Remote Work"];
        suggestedQuestions = [
            "What interview answers demonstrate autonomous remote readiness for entry-level talent?",
            "How can junior candidates demonstrate CRM competence without prior enterprise experience?",
            "What are the highest-converting follow-up rituals after submitting a CV for this role?",
        ];
    } else if (lower.includes("10alytics is hiring")) {
        category = "JOB OPPORTUNITIES";
        title = "10Alytics Multi-Role Remote Expansion: HR, DevOps, Data & PM";
        keyCalibrations = [
            "Massive remote expansion across 13 distinct roles spanning Human Resources, Data, Project Management, and DevOps.",
            "Prioritizes candidates with high autonomy and documented domain expertise in tech operations.",
            "Competitive compensation tiers across associate and senior engineering brackets.",
        ];
        tags = ["Job Opportunities", "Tech Recruiting", "DevOps", "HR Management"];
        suggestedQuestions = [
            "How should a Human Resources Associate tailor their resume for a remote analytics firm?",
            "What technical portfolio assets are most valued for Junior and Senior Data Associates?",
            "What makes a project manager resume stand out in a high-volume remote application pool?",
        ];
    } else if (lower.includes("krystn enem") || lower.includes("seo specialist")) {
        category = "JOB OPPORTUNITIES";
        title = "Krystn Enem TV Network: Remote SEO & Channel Growth Specialist";
        keyCalibrations = [
            "Full-time remote role leading organic search discovery across blog editorial and YouTube channels.",
            "Core focus: keyword research, content architecture, and conversion tracking via Google Analytics & Search Console.",
            "Requires proven portfolio pieces in media, entertainment, or digital publication SEO.",
        ];
        tags = ["Job Opportunities", "SEO", "Growth Marketing", "Content Strategy"];
        suggestedQuestions = [
            "What metrics should an SEO specialist highlight when applying to a media network?",
            "How does YouTube video SEO optimization differ from standard technical blog SEO?",
            "What are the best practices for structuring an SEO audit case study in a portfolio?",
        ];
    } else if (lower.includes("zynestech") || lower.includes("graphic designer")) {
        category = "JOB OPPORTUNITIES";
        title = "Zynestech Market: Senior Graphic Designer (Branding & Visuals)";
        keyCalibrations = [
            "Full-time senior remote role focusing on visual identity, branding systems, and typography.",
            "Mastery required in Adobe Creative Suite (Photoshop, Illustrator) alongside strong delivery velocity.",
            "High emphasis on clear stakeholder communication and polished commercial aesthetics.",
        ];
        tags = ["Job Opportunities", "Design", "Visual Identity", "Remote Work"];
        suggestedQuestions = [
            "What should be included in a Senior Graphic Designer's portfolio presentation?",
            "How do top visual designers demonstrate business ROI in their application case studies?",
            "What questions should a senior designer ask during the portfolio review stage?",
        ];
    } else if (lower.includes("marlan assist") || lower.includes("virtual assistant")) {
        category = "JOB OPPORTUNITIES";
        title = "Marlan Assist: Remote Virtual Assistant & Operational Support";
        keyCalibrations = [
            "Executive operations: calendar scheduling, inbox zero protocols, and customer enquiry follow-ups.",
            "Data stewardship: online research, digital file organization, and social media scheduling.",
            "Evaluates rapid turnaround time, deadline compliance, and dependable daily communication.",
        ];
        tags = ["Job Opportunities", "Virtual Assistant", "Executive Support", "Operations"];
        suggestedQuestions = [
            "What systems and tools should a modern virtual assistant use for calendar and email management?",
            "How do you demonstrate reliability and confidentiality in a virtual assistant interview?",
            "What is an ideal daily operating rhythm for an asynchronous remote executive assistant?",
        ];
    } else if (lower.includes("bikini team") || lower.includes("account manager")) {
        category = "JOB OPPORTUNITIES";
        title = "Bikini Team: Account Manager & Social Media Intern (Part-Time)";
        keyCalibrations = [
            "Part-time remote openings tailored for sales account managers and emerging social media creators.",
            "Client relationship building paired with fashion, modeling, and influencer engagement.",
            "Emphasis on authentic brand voice, rapid direct messaging, and community connection.",
        ];
        tags = ["Job Opportunities", "Account Management", "Social Media", "Sales"];
        suggestedQuestions = [
            "How do part-time account managers balance client responsiveness with flexible schedules?",
            "What content samples best demonstrate social media management skills for fashion brands?",
            "What metrics prove effectiveness for early-stage social media intern roles?",
        ];
    } else if (lower.includes("free libraries") || lower.includes("designer who also builds")) {
        category = "FUTURE OF WORK";
        title = "High-Leverage AI & Design Libraries for Next-Gen Builders";
        keyCalibrations = [
            "Utilizing curated open-source UI libraries accelerates product prototyping from weeks to hours.",
            "Hybrid designer-engineers leveraging AI tools achieve 5x output compared to traditional siloed teams.",
            "Bookmark and standardize component libraries to maintain visual consistency across micro-apps.",
        ];
        tags = ["Future of Work", "AI Tools", "Design Systems", "Developer Velocity"];
        suggestedQuestions = [
            "What are the highest-leverage AI-assisted design workflows for solo founders?",
            "How should modern engineering teams integrate pre-built component libraries into custom design tokens?",
            "What tools enable designers to export production-ready code without handoff friction?",
        ];
    } else if (lower.includes("ourpalaver") || lower.includes("nigeria we want")) {
        category = "COMMUNITY & CULTURE";
        title = "Incentivized Digital Commons: Driving Community Discourse via Challenges";
        keyCalibrations = [
            "Incentivized topic challenges (e.g. cash prize pools) multiply organic conversation participation.",
            "Modern engagement platforms succeed by democratizing debate on civic and industry questions.",
            "Fostering transparent debate loops builds deeply loyal, daily active community anchors.",
        ];
        tags = ["Community & Culture", "Platform Growth", "Incentives", "Social Dynamics"];
        suggestedQuestions = [
            "How do challenge-based incentives impact long-term community retention vs short-term spikes?",
            "What moderation strategies preserve high-signal debate on controversial public topics?",
            "How can early-stage platforms convert casual challenge participants into active daily contributors?",
        ];
    } else {
        category = lower.includes("hiring") ? "JOB OPPORTUNITIES" : "CAREER POSITIONING";
        const firstSentence = text.split(/[.?!]\n|\n/)[0] || "Executive Talent Strategy Note";
        title = firstSentence.length > 70 ? `${firstSentence.slice(0, 70)}...` : firstSentence;
        keyCalibrations = [
            cleanPostSummary(text).slice(0, 110) + "...",
            "High-conviction talent operational practices grounded in active market feedback.",
            "Asynchronous communication and structured proof-of-work override credentials.",
        ];
        tags = ["Career Positioning", "Talent Strategy", "Market Insights"];
        suggestedQuestions = [
            "How should founders adjust hiring rubrics to match current market compensation realities?",
            "What is the most effective approach to evaluating candidates based on this commentary?",
        ];
    }

    const likeCount = post.likeCount || 0;
    const retweetCount = post.retweetCount || 0;
    const bookmarkCount = post.bookmarkCount || 0;

    return {
        id: `post-${post.id || index + 1}`,
        title,
        slug: `strategy-${post.id || index + 1}`,
        category,
        date: formatPostDate(post.createdAt || post.created_at || post.date),
        readTime: "3 MIN READ",
        summary: cleanPostSummary(text),
        fullContent: text.split("\n\n").filter(Boolean),
        keyTakeaways: keyCalibrations,
        keyCalibrations,
        sourceUrl,
        metrics: [
            {
                label: "Likes",
                value: likeCount.toLocaleString(),
                trend: likeCount > 100 ? "High Signal" : undefined,
            },
            {
                label: "Retweets",
                value: retweetCount.toLocaleString(),
                trend: retweetCount > 15 ? "Viral" : undefined,
            },
            {
                label: "Bookmarks",
                value: bookmarkCount.toLocaleString(),
                trend: bookmarkCount > 50 ? "Saved" : undefined,
            },
        ],
        tags,
        suggestedQuestions,
    };
}

/**
 * Loads posts from posts.json and transforms them into live InsightPost items.
 */
function loadDynamicInsights(): InsightPost[] {
    const candidatePaths = [
        path.resolve(process.cwd(), "server/data/posts.json"),
        path.resolve(process.cwd(), "data/posts.json"),
        path.resolve(__dirname, "../../data/posts.json"),
        path.resolve(__dirname, "../../../data/posts.json"),
    ];

    let targetFile: string | null = null;
    for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
            targetFile = p;
            break;
        }
    }

    if (!targetFile) {
        console.warn("[InsightController] posts.json not found in candidate paths. Returning empty list.");
        return [];
    }

    try {
        const rawContent = fs.readFileSync(targetFile, "utf-8");
        const rawPosts = JSON.parse(rawContent);
        if (!Array.isArray(rawPosts)) return [];

        return rawPosts.map((p, idx) => transformRawPostToInsight(p, idx));
    } catch (err) {
        console.error("[InsightController] Failed to read or parse posts.json:", err);
        return [];
    }
}

/**
 * GET /api/insights
 * Returns structured insights derived from the actual ingested posts in posts.json.
 */
export async function getInsights(req: Request, res: Response): Promise<void> {
    try {
        const { category, q, limit } = req.query;

        let results = loadDynamicInsights();

        // 1. Filter by Category
        if (category && typeof category === "string" && category.toLowerCase() !== "all") {
            const catLower = category.toLowerCase().trim();
            results = results.filter((item) => item.category.toLowerCase() === catLower);
        }

        // 2. Filter by Search Query
        if (q && typeof q === "string" && q.trim()) {
            const searchLower = q.toLowerCase().trim();
            results = results.filter((item) => {
                const titleMatch = item.title.toLowerCase().includes(searchLower);
                const summaryMatch = item.summary.toLowerCase().includes(searchLower);
                const tagMatch = item.tags.some((tag) => tag.toLowerCase().includes(searchLower));
                const calibrationsMatch = item.keyTakeaways.some((t) =>
                    t.toLowerCase().includes(searchLower),
                );
                return titleMatch || summaryMatch || tagMatch || calibrationsMatch;
            });
        }

        // 3. Apply Limit
        if (limit && typeof limit === "string") {
            const parsedLimit = parseInt(limit, 10);
            if (!isNaN(parsedLimit) && parsedLimit > 0) {
                results = results.slice(0, parsedLimit);
            }
        }

        res.status(200).json({
            success: true,
            total: results.length,
            insights: results,
        });
    } catch (error) {
        console.error("Error fetching insights:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error while fetching insights.",
        });
    }
}

/**
 * GET /api/insights/:id
 * Returns single insight by ID or slug.
 */
export async function getInsightById(req: Request, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const insights = loadDynamicInsights();
        const insight = insights.find(
            (p) => p.id === id || p.slug === id || p.id === `post-${id}`,
        );

        if (!insight) {
            res.status(404).json({
                success: false,
                error: `Insight with identifier "${id}" not found.`,
            });
            return;
        }

        res.status(200).json({
            success: true,
            insight,
        });
    } catch (error) {
        console.error("Error fetching insight by ID:", error);
        res.status(500).json({
            success: false,
            error: "Internal server error while fetching insight.",
        });
    }
}
