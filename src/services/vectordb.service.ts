import { QdrantClient } from "@qdrant/js-client-rest";
import { env } from "../config/env.js";
import { PostPayload, RetrievalResult } from "../types/index.js";

/**
 * Service for Vector Database operations using Qdrant.
 * Includes resilience and fallback logic for local development.
 */
class VectorDBService {
    private client: QdrantClient;
    private readonly defaultCollection: string;
    private readonly vectorDimension: number = 1536; // text-embedding-3-small dimension
    // In-memory fallback cache for development/testing if Qdrant is unreachable
    private memoryFallback: Map<
        string,
        Array<{ id: string | number; vector: number[]; payload: PostPayload }>
    > = new Map();

    constructor() {
        this.client = new QdrantClient({
            url: env.QDRANT_URL,
            apiKey: env.QDRANT_API_KEY || undefined,
            checkCompatibility: false,
        });
        this.defaultCollection = env.QDRANT_COLLECTION_NAME;
    }

    /**
     * Calculates cosine similarity between two vectors.
     */
    private cosineSimilarity(a: number[], b: number[]): number {
        let dot = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        return normA === 0 || normB === 0
            ? 0
            : dot / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Ensures the target collection exists in Qdrant with Cosine distance metric.
     */
    async ensureCollection(
        collectionName: string = this.defaultCollection,
        vectorSize: number = this.vectorDimension,
    ): Promise<void> {
        try {
            const collections = await this.client.getCollections();
            const exists = collections.collections.some(
                (c) => c.name === collectionName,
            );

            if (!exists) {
                console.log(
                    `Creating Qdrant collection: "${collectionName}" (dim: ${vectorSize}, metric: Cosine)`,
                );
                await this.client.createCollection(collectionName, {
                    vectors: {
                        size: vectorSize,
                        distance: "Cosine",
                    },
                    optimizers_config: {
                        default_segment_number: 2,
                    },
                    replication_factor: 1,
                });
            }
        } catch (error) {
            console.warn(
                `[VectorDBService] Could not connect to Qdrant at ${env.QDRANT_URL}. In-memory fallback will be active. Error:`,
                (error as Error).message,
            );
        }
    }

    /**
     * Upserts embedded points with metadata payloads into Qdrant.
     */
    async upsertPoints(
        collectionName: string = this.defaultCollection,
        points: Array<{
            id: string | number;
            vector: number[];
            payload: PostPayload;
        }>,
    ): Promise<void> {
        if (points.length === 0) return;

        try {
            await this.ensureCollection(collectionName);

            // Batch in chunks of 100 to avoid payload size limit issues
            const batchSize = 100;
            for (let i = 0; i < points.length; i += batchSize) {
                const chunk = points.slice(i, i + batchSize);
                await this.client.upsert(collectionName, {
                    wait: true,
                    points: chunk.map((pt) => ({
                        id: pt.id,
                        vector: pt.vector,
                        payload: pt.payload as unknown as Record<
                            string,
                            unknown
                        >,
                    })),
                });
            }
            console.log(
                `Successfully upserted ${points.length} points to Qdrant collection "${collectionName}".`,
            );
        } catch (error) {
            console.warn(
                `[VectorDBService] Upsert to Qdrant failed. Storing in in-memory fallback.`,
                (error as Error).message,
            );
            const existing = this.memoryFallback.get(collectionName) || [];
            this.memoryFallback.set(collectionName, [...existing, ...points]);
        }
    }

    /**
     * Similarity search querying vector embeddings against Qdrant collection.
     */
    async searchSimilar(
        collectionName: string = this.defaultCollection,
        queryVector: number[],
        limit: number = env.TOP_K_RESULTS,
        scoreThreshold?: number,
    ): Promise<RetrievalResult[]> {
        try {
            const searchResponse = await this.client.search(collectionName, {
                vector: queryVector,
                limit,
                with_payload: true,
                score_threshold: scoreThreshold,
            });

            return searchResponse.map((hit) => ({
                id: hit.id,
                score: hit.score,
                payload: (hit.payload || {}) as unknown as PostPayload,
            }));
        } catch (error) {
            console.warn(
                `[VectorDBService] Search on Qdrant failed, trying in-memory fallback:`,
                (error as Error).message,
            );
            const inMemoryPoints =
                this.memoryFallback.get(collectionName) || [];

            if (inMemoryPoints.length === 0) {
                return [];
            }

            // Rank by cosine similarity
            return inMemoryPoints
                .map((pt) => ({
                    id: pt.id,
                    score: this.cosineSimilarity(queryVector, pt.vector),
                    payload: pt.payload,
                }))
                .filter(
                    (r) => scoreThreshold === undefined || r.score >= scoreThreshold,
                )
                .sort((a, b) => b.score - a.score)
                .slice(0, limit);
        }
    }

    /**
     * Primary query function returning top-k relevant context chunks with metadata.
     */
    async queryContext(
        queryVector: number[],
        topK: number = env.TOP_K_RESULTS,
        scoreThreshold?: number,
    ): Promise<RetrievalResult[]> {
        return this.searchSimilar(
            this.defaultCollection,
            queryVector,
            topK,
            scoreThreshold,
        );
    }
}

export const vectorDBService = new VectorDBService();
