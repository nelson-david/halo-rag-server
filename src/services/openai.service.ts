import OpenAI from "openai";
import { env } from "../config/env.js";
import { ChatMessage } from "../types/index.js";

/**
 * OpenAI Service for embeddings and streaming chat completions.
 */
class OpenAIService {
    private client: OpenAI;
    private readonly embeddingModel: string;
    private readonly chatModel: string;

    constructor() {
        this.client = new OpenAI({
            apiKey: env.OPENAI_API_KEY,
        });
        this.embeddingModel = env.OPENAI_EMBEDDING_MODEL;
        this.chatModel = env.OPENAI_MODEL;
    }

    /**
     * Generates a 1536-dimensional vector embedding for a single text chunk
     * using text-embedding-3-small.
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const cleanedText = text.replace(/\n+/g, " ").trim();

        if (!cleanedText) {
            throw new Error("Cannot generate embedding for empty text string.");
        }

        try {
            const response = await this.client.embeddings.create({
                model: this.embeddingModel,
                input: cleanedText,
                encoding_format: "float",
            });

            return response.data[0].embedding;
        } catch (error) {
            console.error("Error generating OpenAI embedding:", error);
            throw error;
        }
    }

    /**
     * Generates embeddings in batches for high-throughput ingestion.
     */
    async generateEmbeddings(
        texts: string[],
        batchSize = 64,
    ): Promise<number[][]> {
        const results: number[][] = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts
                .slice(i, i + batchSize)
                .map((t) => t.replace(/\n+/g, " ").trim());

            try {
                const response = await this.client.embeddings.create({
                    model: this.embeddingModel,
                    input: batch,
                    encoding_format: "float",
                });

                // Ensure returned embeddings maintain exact input ordering
                const sorted = response.data
                    .sort((a, b) => a.index - b.index)
                    .map((item) => item.embedding);

                results.push(...sorted);
            } catch (error) {
                console.error(
                    `Error in batch embedding range [${i}..${i + batch.length}]:`,
                    error,
                );
                throw error;
            }
        }

        return results;
    }

    /**
     * Creates a streaming chat completion using GPT-4o.
     */
    async createChatStream(
        messages: ChatMessage[],
        options: {
            temperature?: number;
            max_tokens?: number;
            presence_penalty?: number;
            frequency_penalty?: number;
        } = {},
    ): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
        const {
            temperature = 0.3,
            max_tokens = 1200,
            presence_penalty = 0.1,
            frequency_penalty = 0.1,
        } = options;

        return await this.client.chat.completions.create({
            model: this.chatModel,
            messages: messages.map((m) => ({
                role: m.role,
                content: m.content,
            })),
            temperature,
            max_tokens,
            presence_penalty,
            frequency_penalty,
            stream: true,
        });
    }
}

export const openaiService = new OpenAIService();
