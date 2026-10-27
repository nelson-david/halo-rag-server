import { Router } from "express";
import {
    getInsights,
    getInsightById,
} from "../controllers/insight.controller.js";

const router = Router();

/**
 * GET /api/insights
 * Fetches curated insights with optional category and search query filters.
 */
router.get("/", getInsights);

/**
 * GET /api/insights/:id
 * Fetches single curated insight by ID or slug.
 */
router.get("/:id", getInsightById);

export default router;
