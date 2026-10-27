import { Request, Response } from "express";
import { openaiService } from "../services/openai.service.js";
import { vectorDBService } from "../services/vectordb.service.js";
import {
    ChatMessage,
    CitationReference,
    RetrievalResult,
} from "../types/index.js";
import { env } from "../config/env.js";

/**
 * Builds the strictly-grounded system prompt for the HR & Talent Strategy Twin.
 */
function buildSystemPrompt(contextChunks: RetrievalResult[]): string {
    const contextText = contextChunks
        .map((chunk, index) => {
            const p = chunk.payload;
            return `[Source ${index + 1} | Post ID: ${p.id} | Date: ${p.date} | Category: ${p.category || "Talent Strategy"}]\nTitle: ${p.title || "Insight"}\nURL: ${p.url}\nContent:\n${p.text}`;
        })
        .join("\n\n---\n\n");

    return `You are the executive AI Twin of HALO, HR Operations & Talent Strategy Consultant (ex-Stripe & Scale AI, current advisor at Halo Advisory).
Your mission is to advise tech founders, engineering leaders, and heads of talent on job positioning, resume optimization, career coaching, job vacancies, and interview preparation.

### Core Persona Pillars & Philosophy:
1. Local & International Job Positioning: Calibrate spans dynamically (4-5 for 0-to-1 ambiguity; 8-10 for high-leverage Staff IC pods).
2. Uncapped Merit vs Rigid Bands: Avoid bureaucratic leveling traps. Compensate outliers at true market value. Staff+ ICs must have parity with VP/Directors.
3. 48-Hour Technical Loops: Slashing time-to-offer without lowering the bar. Top 5% engineers receive 3+ tier-1 offers within 11 business days.
4. Equity Refresher Retention Cliffs: Never wait until month 42. Address the psychological vesting cliff by month 24-30 with evergreen top-up grants.
5. AI-Augmented Talent Velocity: Automate sourcing and calendar thrash, while doubling down on live architecture pairing and high-conviction debriefs.

### Tone & Style:
- Executive, direct, deeply analytical, and unapologetically pragmatic.
- Zero corporate fluff, generic HR platitudes, or boilerplate disclaimers.
- Use bold highlights, clear numeric benchmarks, and actionable 3-stage frameworks where applicable.

### Strict Grounding Rules:
- Ground all facts, statistics, arguments, and recommendations in the retrieved source commentary below.
- Do not invent external companies, stats, or policies not supported by the context or Elena's known philosophy.
- If the context does not fully cover an edge case, state the gap clearly and reason strictly from Elena's core architectural principles.

### Retrieved Context Commentary:
${contextText || "No specific post chunks retrieved. Adhere strictly to the Core Persona Pillars above."}`;
}

/**
 * Maps vector search results into frontend-compatible CitationReference items.
 */
function formatCitations(results: RetrievalResult[]): CitationReference[] {
    return results.slice(0, 3).map((res) => {
        const p = res.payload;
        const excerpt =
            p.text.length > 180 ? `${p.text.slice(0, 180).trim()}...` : p.text;
        return {
            postId: p.id,
            postTitle: p.title || "Talent Strategy Thesis",
            category: p.category || "Org Design",
            date: p.date,
            excerpt,
            url: p.url,
            score: Math.round(res.score * 100) / 100,
        };
    });
}

/**
 * Controller handling POST /api/chat
 * Embeds user message, retrieves top-k chunks, and streams GPT-4o grounded response.
 */
export async function handleChat(req: Request, res: Response): Promise<void> {
    const { message, messages = [], _associatedPostId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
        res.status(400).json({
            error: 'A valid "message" string is required in request body.',
        });
        return;
    }

    const queryText = message.trim();

    try {
        // 1. Generate embedding for user query
        let queryEmbedding: number[] = [];
        try {
            queryEmbedding = await openaiService.generateEmbedding(queryText);
        } catch (embErr) {
            console.warn(
                "Embedding generation failed, proceeding with fallback context:",
                embErr,
            );
        }

        // 2. Query Vector DB for matching context chunks
        let retrievedChunks: RetrievalResult[] = [];
        if (queryEmbedding.length > 0) {
            retrievedChunks = await vectorDBService.queryContext(
                queryEmbedding,
                env.TOP_K_RESULTS,
            );
        }

        // 3. Prepare citations
        const citations = formatCitations(retrievedChunks);

        // 4. Construct System Prompt & Messages History
        const systemPrompt = buildSystemPrompt(retrievedChunks);

        const chatHistory: ChatMessage[] = [
            { role: "system", content: systemPrompt },
            // Include prior conversational turns if provided (keeping last 6 for prompt efficiency)
            ...messages.slice(-6).map((m: ChatMessage) => ({
                role: m.role,
                content: m.content,
            })),
            { role: "user", content: queryText },
        ];

        // 5. Setup SSE (Server-Sent Events) Stream
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders?.();

        let clientDisconnected = false;
        req.on("close", () => {
            clientDisconnected = true;
        });

        // Send initial metadata event with citations
        res.write(
            `data: ${JSON.stringify({ type: "citations", citations })}\n\n`,
        );

        // 6. Request streaming completion from OpenAI
        const stream = await openaiService.createChatStream(chatHistory, {
            temperature: 0.35,
        });

        for await (const chunk of stream) {
            if (clientDisconnected) break;

            const token = chunk.choices[0]?.delta?.content || "";
            if (token) {
                res.write(
                    `data: ${JSON.stringify({ type: "token", content: token })}\n\n`,
                );
            }
        }

        // Emit stream completion event
        if (!clientDisconnected) {
            res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
            res.end();
        }
    } catch (error) {
        console.error("Error handling chat request:", error);

        // If headers haven't been sent, return JSON error
        if (!res.headersSent) {
            res.status(500).json({
                error: "Internal server error while processing chat stream.",
            });
        } else {
            res.write(
                `data: ${JSON.stringify({
                    type: "error",
                    error: "Stream interrupted due to an internal server error.",
                })}\n\n`,
            );
            res.end();
        }
    }
}
