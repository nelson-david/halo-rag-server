import { Router } from "express";
import { handleChat } from "../controllers/chat.controller.js";

const router = Router();

/**
 * POST /api/chat
 * Primary conversational endpoint with vector-grounded RAG & SSE response streaming.
 */
router.post("/", handleChat);

export default router;
