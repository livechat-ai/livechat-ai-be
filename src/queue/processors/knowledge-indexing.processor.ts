import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Job } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { KnowledgeDocument, KnowledgeDocumentDoc } from '../../knowledge/schemas/document.schema';
import { KnowledgeChunk, KnowledgeChunkDoc } from '../../knowledge/schemas/chunk.schema';
import { ChunkingService } from '../../knowledge/chunking.service';
import { EmbeddingService } from '../../rag/embedding.service';
import { VectorDbService } from '../../rag/vector-db.service';
import { IndexingJobData, IndexingProgress } from '../interfaces';
import { ExtractionService } from '../../knowledge/extraction.service';

/**
 * Knowledge Indexing Processor
 * 
 * Processes knowledge document indexing jobs with streaming batch pipeline:
 * 1. Fetch document from MongoDB to get content
 * 2. Chunk content into smaller pieces
 * 3. Process chunks in batches (15 chunks at a time)
 * 4. Generate embeddings for each batch
 * 5. Upsert to Qdrant vector database
 * 6. Save chunk metadata to MongoDB
 * 
 * Memory optimization: O(batch_size) instead of O(total_chunks)
 */
@Processor('knowledge-indexing')
export class KnowledgeIndexingProcessor extends WorkerHost {
    private readonly logger = new Logger(KnowledgeIndexingProcessor.name);
    private readonly CHUNK_BATCH_SIZE = 15; // Process 15 chunks at a time to limit memory

    constructor(
        @InjectModel(KnowledgeDocument.name) private docModel: Model<KnowledgeDocumentDoc>,
        @InjectModel(KnowledgeChunk.name) private chunkModel: Model<KnowledgeChunkDoc>,
        private readonly chunkingService: ChunkingService,
        private readonly embeddingService: EmbeddingService,
        private readonly vectorDbService: VectorDbService,
        private readonly extractionService: ExtractionService,
    ) {
        super();
    }

    async process(job: Job<IndexingJobData>): Promise<void> {
        const { documentId, metadata } = job.data;
        this.logger.log(`🚀 Processing document ${documentId}`);

        // 1. Fetch document from MongoDB to get content
        const doc = await this.docModel.findById(documentId);
        if (!doc) {
            throw new Error(`Document ${documentId} not found`);
        }

        // 2. Update status to indexing
        doc.status = 'indexing';
        await doc.save();

        try {
            // 3. Get content from document (either direct content or extract from file)
            let content: string;
            if (doc.content) {
                content = doc.content;
            } else if (doc.filePath && doc.fileType) {
                // Extract from file if not already extracted
                content = await this.extractionService.extractText(doc.filePath, doc.fileType);

                // Save extracted content to avoid re-extraction
                doc.content = content;
                await doc.save();
            } else {
                throw new Error('Document has no content or file');
            }

            this.logger.log(`📄 Content loaded: ${content.length} chars`);

            // 4. Chunk content
            this.logger.debug(`Starting chunking service...`);
            const chunks = this.chunkingService.chunk(content);
            const totalChunks = chunks.length;
            this.logger.debug(`Chunking complete: ${totalChunks} chunks created`);

            this.logger.debug(`Updating job progress...`);
            await job.updateProgress({
                stage: 'chunking',
                totalChunks,
                chunksProcessed: 0,
                progress: 0,
            } as IndexingProgress);
            this.logger.debug(`Progress update complete`);

            this.logger.log(`📄 Chunked into ${totalChunks} pieces`);

            // 3. Delete old chunks if reindexing
            await this.chunkModel.deleteMany({ documentId: new Types.ObjectId(documentId) });

            // 4. Process in batches (STREAMING PIPELINE - Memory Efficient)
            for (let i = 0; i < chunks.length; i += this.CHUNK_BATCH_SIZE) {
                const batch = chunks.slice(i, Math.min(i + this.CHUNK_BATCH_SIZE, chunks.length));
                const batchNum = Math.floor(i / this.CHUNK_BATCH_SIZE) + 1;
                const totalBatches = Math.ceil(chunks.length / this.CHUNK_BATCH_SIZE);

                this.logger.debug(`⚡ Batch ${batchNum}/${totalBatches}: Processing chunks ${i}-${i + batch.length}`);

                // 4a. Embed batch
                const embeddings = await this.embeddingService.embedBatch(
                    batch.map((c: any) => c.content)
                );

                // 4b. Prepare Qdrant points
                const points = batch.map((chunk: any, idx: number) => {
                    const pointId = uuidv4();
                    return {
                        id: pointId,
                        vector: embeddings[idx],
                        payload: {
                            tenantSlug: metadata.tenantSlug,
                            documentId,
                            category: metadata.category,
                            documentTitle: metadata.title,
                            content: chunk.content,
                            chunkIndex: chunk.chunkIndex,
                        },
                    };
                });

                // 4c. Upsert to Qdrant
                await this.vectorDbService.upsertPoints(points);

                // 4d. Save to MongoDB
                const mongoChunks = batch.map((chunk: any, idx: number) => ({
                    tenantSlug: metadata.tenantSlug,
                    documentId: new Types.ObjectId(documentId),
                    chunkIndex: chunk.chunkIndex,
                    content: chunk.content,
                    qdrantPointId: points[idx].id,
                    metadata: {
                        chunkType: chunk.chunkType,
                        category: metadata.category,
                        documentTitle: metadata.title,
                    },
                    indexedAt: new Date(),
                }));
                await this.chunkModel.insertMany(mongoChunks);

                // Update progress
                const chunksProcessed = Math.min(i + batch.length, totalChunks);
                const progress = Math.floor((chunksProcessed / totalChunks) * 100);

                await job.updateProgress({
                    stage: 'embedding',
                    totalChunks,
                    chunksProcessed,
                    progress,
                } as IndexingProgress);

                this.logger.debug(`✅ Batch ${batchNum}/${totalBatches} complete (Progress: ${progress}%)`);
            }

            // 5. Mark as completed
            await this.docModel.updateOne(
                { _id: documentId },
                {
                    status: 'indexed',
                    chunkCount: totalChunks,
                    indexedAt: new Date(),
                    $unset: { errorMessage: 1 },
                }
            );

            await job.updateProgress({
                stage: 'completed',
                totalChunks,
                chunksProcessed: totalChunks,
                progress: 100,
            } as IndexingProgress);

            this.logger.log(`✅ Indexed document "${metadata.title}": ${totalChunks} chunks`);
        } catch (error) {
            // Mark as failed
            await this.docModel.updateOne(
                { _id: documentId },
                { status: 'failed', errorMessage: error.message }
            );

            this.logger.error(`❌ Failed to index ${documentId}: ${error.message}`);
            throw error; // BullMQ will retry based on queue config
        }
    }

    @OnWorkerEvent('failed')
    onFailed(job: Job, error: Error) {
        this.logger.error(
            `❌ Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`
        );
    }

    @OnWorkerEvent('completed')
    onCompleted(job: Job) {
        const data = job.data as IndexingJobData;
        this.logger.log(`🎉 Job ${job.id} completed for document "${data.metadata.title}"`);
    }
}
