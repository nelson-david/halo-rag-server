/**
 * Shared TypeScript interfaces and domain types for the Halo RAG server.
 */

export type MessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
    role: MessageRole;
    content: string;
}

export interface CitationReference {
    postId: string;
    postTitle: string;
    category: string;
    date: string;
    excerpt: string;
    url?: string;
    score?: number;
}

export interface ChatRequest {
    message: string;
    messages?: ChatMessage[];
    associatedPostId?: string;
}

export interface PostPayload {
    id: string;
    text: string;
    date: string;
    url: string;
    engagementScore: number;
    title?: string;
    category?: string;
    tags?: string[];
    author?: string;
    threadId?: string;
    chunkIndex?: number;
}

export interface RawPost {
    id: string;
    text: string;
    date?: string;
    created_at?: string;
    createdAt?: string;
    url?: string;
    link?: string;
    twitterUrl?: string;
    threadId?: string;
    conversation_id?: string;
    replyToId?: string;
    in_reply_to_status_id?: string;
    likes?: number;
    likeCount?: number;
    retweets?: number;
    retweetCount?: number;
    replies?: number;
    replyCount?: number;
    bookmarks?: number;
    bookmarkCount?: number;
    quoteCount?: number;
    isRetweet?: boolean;
    isQuote?: boolean;
    engagementScore?: number;
    category?: string;
    tags?: string[];
    author?: string;
    title?: string;
}

export interface RetrievalResult {
    id: string | number;
    score: number;
    payload: PostPayload;
}

export interface InsightMetric {
    label: string;
    value: string;
    trend?: string;
}

export interface InsightFrameworkStep {
    step: string;
    detail: string;
}

export interface InsightPost {
    id: string;
    title: string;
    slug: string;
    category: string;
    date: string;
    readTime: string;
    summary: string;
    fullContent: string[];
    keyTakeaways: string[];
    keyCalibrations?: string[];
    sourceUrl?: string;
    framework?: {
        name: string;
        description: string;
        steps: InsightFrameworkStep[];
    };
    metrics?: InsightMetric[];
    tags: string[];
    suggestedQuestions: string[];
}

export interface SearchResultItem {
    id: string;
    title: string;
    excerpt: string;
    category: string;
    tags: string[];
    date: string;
    url: string;
    engagementScore: number;
    score: number;
}

export interface SearchResponse {
    query: string;
    count: number;
    results: SearchResultItem[];
}
