import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeIndexingProcessor } from './processors/knowledge-indexing.processor';
import { KnowledgeDocument, KnowledgeDocumentSchema } from '../knowledge/schemas/document.schema';
import { KnowledgeChunk, KnowledgeChunkSchema } from '../knowledge/schemas/chunk.schema';
import { ChunkingService } from '../knowledge/chunking.service';
import { EmbeddingService } from '../rag/embedding.service';
import { VectorDbService } from '../rag/vector-db.service';
import { ExtractionService } from '../knowledge/extraction.service';

/**
 * Queue Module - Central configuration for BullMQ queues
 * 
 * Provides:
 * - Redis connection setup
 * - Default job options (retry, backoff, cleanup)
 * - Queue registration for knowledge indexing
 */
@Module({
    imports: [
        // Root BullMQ configuration
        BullModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
                connection: {
                    host: config.get<string>('REDIS_HOST', 'redis'),
                    port: config.get<number>('REDIS_PORT', 6379),
                },
                defaultJobOptions: {
                    attempts: 3, // Retry up to 3 times
                    backoff: {
                        type: 'exponential',
                        delay: 2000, // Start with 2s, then 4s, 8s
                    },
                    removeOnComplete: {
                        count: 100, // Keep last 100 completed jobs
                    },
                    removeOnFail: {
                        count: 500, // Keep last 500 failed jobs for debugging
                    },
                },
            }),
            inject: [ConfigService],
        }),

        // Register knowledge indexing queue
        BullModule.registerQueue({
            name: 'knowledge-indexing',
        }),

        // Import schemas for processor
        MongooseModule.forFeature([
            { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
            { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
        ]),
    ],
    providers: [
        KnowledgeIndexingProcessor,
        ChunkingService,
        EmbeddingService,
        VectorDbService,
        ExtractionService,
    ],
    exports: [BullModule],
})
export class QueueModule { }
