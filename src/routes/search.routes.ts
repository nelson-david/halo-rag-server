import { Router } from "express";
import { searchPosts } from "../controllers/search.controller.js";

const router = Router();

/**
 * GET /api/search?q=<query>&limit=<1-50>&minScore=<0-1>
 * Semantic search across all ingested posts using vector embeddings.
 */
router.get("/", searchPosts);

export default router;
