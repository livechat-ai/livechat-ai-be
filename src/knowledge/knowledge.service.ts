import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { KnowledgeDocument, KnowledgeDocumentDoc } from './schemas/document.schema';
import { KnowledgeChunk, KnowledgeChunkDoc } from './schemas/chunk.schema';
import { ExtractionService } from './extraction.service';
import { VectorDbService } from '../rag/vector-db.service';

@Injectable()
export class KnowledgeService {
    private readonly logger = new Logger(KnowledgeService.name);

    constructor(
        @InjectModel(KnowledgeDocument.name) private documentModel: Model<KnowledgeDocumentDoc>,
        @InjectModel(KnowledgeChunk.name) private chunkModel: Model<KnowledgeChunkDoc>,
        @InjectQueue('knowledge-indexing') private indexingQueue: Queue,
        private readonly extractionService: ExtractionService,
        private readonly vectorDbService: VectorDbService,
    ) { }

    /** Tạo tài liệu mới và bắt đầu indexing */
    async createDocument(params: {
        tenantSlug: string;
        title: string;
        category: string;
        content?: string;
        filePath?: string;
        fileType?: string;
        metadata?: Record<string, unknown>;
    }): Promise<KnowledgeDocumentDoc> {
        // Extract content first if file is provided
        let extractedContent: string | null = null;
        if (params.content) {
            extractedContent = params.content;
        } else if (params.filePath && params.fileType) {
            extractedContent = await this.extractionService.extractText(params.filePath, params.fileType);
        }

        // Create document with content saved in MongoDB
        const doc = await this.documentModel.create({
            tenantSlug: params.tenantSlug,
            title: params.title,
            category: params.category,
            content: extractedContent, // Save content here!
            filePath: params.filePath || null,
            fileType: params.fileType || null,
            status: 'pending',
            metadata: params.metadata || { language: 'vi' },
        });

        // Enqueue indexing job (only pass documentId, worker reads content from MongoDB)
        await this.indexingQueue.add('index-document', {
            documentId: doc._id.toString(),
            // NO content field - worker will read from MongoDB
            metadata: {
                tenantSlug: doc.tenantSlug,
                category: doc.category,
                title: doc.title,
            },
        });

        this.logger.log(`Enqueued indexing job for document "${doc.title}"`);

        return doc;
    }

    /** Lấy danh sách tài liệu */
    async getDocuments(params: {
        tenantSlug?: string;
        status?: string;
        category?: string;
    }): Promise<KnowledgeDocumentDoc[]> {
        const filter: Record<string, unknown> = {};
        if (params.tenantSlug) filter.tenantSlug = params.tenantSlug;
        if (params.status) filter.status = params.status;
        if (params.category) filter.category = params.category;

        return this.documentModel.find(filter).sort({ createdAt: -1 }).exec();
    }

    /** Lấy chi tiết tài liệu */
    async getDocumentById(id: string): Promise<KnowledgeDocumentDoc> {
        const doc = await this.documentModel.findById(id);
        if (!doc) throw new NotFoundException(`Tài liệu ${id} không tồn tại`);
        return doc;
    }

    /** Xóa tài liệu + chunks + Qdrant points */
    async deleteDocument(id: string): Promise<void> {
        const doc = await this.documentModel.findById(id);
        if (!doc) throw new NotFoundException(`Tài liệu ${id} không tồn tại`);

        // Xóa khỏi Qdrant
        await this.vectorDbService.deleteByDocumentId(id);

        // Xóa chunks MongoDB
        await this.chunkModel.deleteMany({ documentId: new Types.ObjectId(id) });

        // Xóa document
        await this.documentModel.findByIdAndDelete(id);

        this.logger.log(`Deleted document "${doc.title}" and ${doc.chunkCount} chunks`);
    }

    /** Reindex tài liệu */
    async reindexDocument(id: string): Promise<void> {
        const doc = await this.documentModel.findById(id);
        if (!doc) throw new NotFoundException(`Tài liệu ${id} không tồn tại`);

        // Delete old vectors from Qdrant
        await this.vectorDbService.deleteByDocumentId(id);

        // Reset document status and enqueue reindex job
        // Worker will read content from doc.content field
        doc.status = 'pending';
        await doc.save();

        await this.indexingQueue.add('index-document', {
            documentId: id,
            metadata: {
                tenantSlug: doc.tenantSlug,
                category: doc.category,
                title: doc.title,
            },
        });

        this.logger.log(`Enqueued reindex job for document "${doc.title}"`);
    }
}
