/**
 * Job payload interface for knowledge document indexing
 * Note: Content is NOT passed via queue to avoid size limits.
 * Worker reads content from MongoDB document directly.
 */
export interface IndexingJobData {
    documentId: string;
    // content field removed - read from MongoDB instead
    metadata: {
        tenantSlug: string;
        category: string;
        title: string;
    };
}

/**
 * Job progress tracking interface
 */
export interface IndexingProgress {
    stage: 'chunking' | 'embedding' | 'upserting' | 'completed';
    totalChunks?: number;
    chunksProcessed?: number;
    progress?: number; // Percentage 0-100
}

/**
 * Queue names
 */
export const QUEUE_NAMES = {
    KNOWLEDGE_INDEXING: 'knowledge-indexing',
} as const;

/**
 * Job names
 */
export const JOB_NAMES = {
    INDEX_DOCUMENT: 'index-document',
} as const;
