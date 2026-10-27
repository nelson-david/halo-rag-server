import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import chatRoutes from "./routes/chat.routes.js";
import insightRoutes from "./routes/insight.routes.js";

const app = express();

// ==========================================
// Security & Core Middleware
// ==========================================
app.use(helmet());

const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    env.CORS_ORIGIN,
].filter(Boolean);

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
            if (!origin) return callback(null, true);
            if (
                allowedOrigins.includes("*") ||
                allowedOrigins.includes(origin) ||
                env.NODE_ENV !== "production"
            ) {
                return callback(null, true);
            }
            callback(new Error(`CORS origin ${origin} not allowed`));
        },
        methods: ["GET", "POST", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept", "Cache-Control"],
        credentials: true,
    }),
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Lightweight request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url}`);
    next();
});

// ==========================================
// Health Check Routes
// ==========================================
app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "halo-rag-server",
        env: env.NODE_ENV,
    });
});

app.get("/api/health", (_req: Request, res: Response) => {
    res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "halo-rag-server",
        vectorCollection: env.QDRANT_COLLECTION_NAME,
        models: {
            chat: env.OPENAI_MODEL,
            embedding: env.OPENAI_EMBEDDING_MODEL,
        },
    });
});

// ==========================================
// API Feature Routes
// ==========================================
app.use("/api/chat", chatRoutes);
app.use("/api/insights", insightRoutes);

// ==========================================
// 404 Handler
// ==========================================
app.use((req: Request, res: Response) => {
    res.status(404).json({
        error: "Not Found",
        message: `Cannot ${req.method} ${req.originalUrl}`,
    });
});

// ==========================================
// Global Error Handler
// ==========================================
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled Server Error:", err);
    res.status(500).json({
        error: "InternalServerError",
        message:
            env.NODE_ENV === "production"
                ? "An unexpected error occurred."
                : err.message,
    });
});

// ==========================================
// Server Initialization & Graceful Shutdown
// ==========================================
const server = app.listen(env.PORT, () => {
    console.log("\n==============================================");
    console.log(`⚡ Halo RAG Server running on port: ${env.PORT}`);
    console.log(`🌐 Environment: ${env.NODE_ENV}`);
    console.log(`📡 Endpoints:`);
    console.log(`   - POST http://localhost:${env.PORT}/api/chat`);
    console.log(`   - GET  http://localhost:${env.PORT}/api/insights`);
    console.log(`   - GET  http://localhost:${env.PORT}/api/health`);
    console.log(
        `🧠 OpenAI Models: ${env.OPENAI_MODEL} | ${env.OPENAI_EMBEDDING_MODEL}`,
    );
    console.log(`📦 Vector Collection: ${env.QDRANT_COLLECTION_NAME}`);
    console.log("==============================================\n");
});

server.on("error", (err: any) => {
    if (err.code === "EADDRINUSE") {
        console.error(`\n❌ Port ${env.PORT} is already in use.`);
        if (env.PORT === 5000) {
            console.error(
                `💡 macOS Note: AirPlay Receiver frequently occupies port 5000 by default.\n` +
                `   Option 1 (Recommended): Disable AirPlay Receiver in macOS System Settings > General > AirDrop & AirPlay.\n` +
                `   Option 2: Change PORT=5001 in server/.env and NEXT_PUBLIC_API_URL=http://localhost:5001 in client/.env.local.\n`
            );
        }
    } else {
        console.error("Server error:", err);
    }
});

const handleTermination = (signal: string) => {
    console.log(
        `\nReceived ${signal}. Shutting down HTTP server gracefully...`,
    );
    server.close(() => {
        console.log("HTTP server closed cleanly.");
        process.exit(0);
    });

    setTimeout(() => {
        console.error("Forcefully terminating server after timeout.");
        process.exit(1);
    }, 10000).unref();
};

process.on("SIGINT", () => handleTermination("SIGINT"));
process.on("SIGTERM", () => handleTermination("SIGTERM"));

export default app;
