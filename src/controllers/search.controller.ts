import { Request, Response } from "express";
import { z } from "zod";
import { openaiService } from "../services/openai.service.js";
import { vectorDBService } from "../services/vectordb.service.js";
import {
    RetrievalResult,
    SearchResponse,
    SearchResultItem,
} from "../types/index.js";

const EXCERPT_LENGTH = 240;

const searchQuerySchema = z.object({
    q: z
        .string({ error: 'Query parameter "q" is required.' })
        .trim()
        .min(1, 'Query parameter "q" is required.')
        .max(500, 'Query parameter "q" must be at most 500 characters.'),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    // Cosine similarity floor; filters out weak matches so nonsense queries
    // don't return arbitrary "nearest" posts.
    minScore: z.coerce.number().min(0).max(1).default(0.25),
});

function toSearchResult(res: RetrievalResult): SearchResultItem {
    const p = res.payload;
    const excerpt =
        p.text.length > EXCERPT_LENGTH
            ? `${p.text.slice(0, EXCERPT_LENGTH).trim()}...`
            : p.text;

    return {
        id: p.id,
        title: p.title || "Untitled post",
        excerpt,
        category: p.category || "Uncategorized",
        tags: p.tags || [],
        date: p.date,
        url: p.url,
        engagementScore: p.engagementScore ?? 0,
        score: Math.round(res.score * 1000) / 1000,
    };
}

/**
 * Controller handling GET /api/search?q=
 * Embeds the query and returns the most semantically similar posts.
 */
export async function searchPosts(req: Request, res: Response): Promise<void> {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        res.status(400).json({
            error: "BadRequest",
            message: parsed.error.issues.map((i) => i.message).join(" "),
        });
        return;
    }

    const { q, limit, minScore } = parsed.data;

    let queryEmbedding: number[];
    try {
        queryEmbedding = await openaiService.generateEmbedding(q);
    } catch (error) {
        console.error("Search embedding generation failed:", error);
        res.status(503).json({
            error: "ServiceUnavailable",
            message: "Search is temporarily unavailable. Please try again.",
        });
        return;
    }

    try {
        const hits = await vectorDBService.queryContext(
            queryEmbedding,
            limit,
            minScore,
        );
        const results = hits.map(toSearchResult);

        const body: SearchResponse = { query: q, count: results.length, results };
        res.status(200).json(body);
    } catch (error) {
        console.error("Search vector query failed:", error);
        res.status(500).json({
            error: "InternalServerError",
            message: "Failed to search posts.",
        });
    }
}
