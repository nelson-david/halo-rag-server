import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables with fallback path discovery
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), "server/.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const envSchema = z.object({
    PORT: z
        .string()
        .default("5000")
        .transform((val) => parseInt(val, 10)),
    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),

    // OpenAI Configuration
    OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
    OPENAI_MODEL: z.string().default("gpt-4o"),
    OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

    // Vector DB (Qdrant) Configuration
    QDRANT_URL: z.string().default("http://localhost:6333"),
    QDRANT_API_KEY: z.string().optional().default(""),
    QDRANT_COLLECTION_NAME: z.string().default("halo_insights"),
    TOP_K_RESULTS: z
        .string()
        .default("5")
        .transform((val) => parseInt(val, 10)),
});

const parseEnv = () => {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const formattedErrors = result.error.format();
        console.warn(
            "⚠️ Environment configuration warning:\n",
            JSON.stringify(formattedErrors, null, 2),
        );

        // If strictly in production, throw; in development, warn and populate sensible defaults
        if (process.env.NODE_ENV === "production") {
            throw new Error("Invalid environment configuration in production.");
        }

        return {
            PORT: parseInt(process.env.PORT || "5001", 10),
            NODE_ENV:
                (process.env.NODE_ENV as
                    | "development"
                    | "production"
                    | "test") || "development",
            CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
            OPENAI_API_KEY:
                process.env.OPENAI_API_KEY || "mock-openai-key-for-dev",
            OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4o",
            OPENAI_EMBEDDING_MODEL:
                process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small",
            QDRANT_URL: process.env.QDRANT_URL || "http://localhost:6333",
            QDRANT_API_KEY: process.env.QDRANT_API_KEY || "",
            QDRANT_COLLECTION_NAME:
                process.env.QDRANT_COLLECTION_NAME || "halo_insights",
            TOP_K_RESULTS: parseInt(process.env.TOP_K_RESULTS || "5", 10),
        };
    }

    return result.data;
};

export const env = parseEnv();
export type EnvConfig = z.infer<typeof envSchema>;
