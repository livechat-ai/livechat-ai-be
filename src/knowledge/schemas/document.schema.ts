import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type KnowledgeDocumentDoc = HydratedDocument<KnowledgeDocument>;

@Schema({ timestamps: true, collection: 'documents' })
export class KnowledgeDocument {
    @Prop({ type: String, required: true, index: true })
    tenantSlug: string;

    @Prop({ type: String, required: true })
    title: string;

    @Prop({
        type: String,
        required: true,
        enum: ['pricing', 'technical', 'general', 'faq'],
        index: true,
    })
    category: string;

    /** Nội dung text (nếu là text/markdown) */
    @Prop({ type: String, default: null })
    content: string | null;

    /** Đường dẫn file đã upload (local hoặc S3) */
    @Prop({ type: String, default: null })
    filePath: string | null;

    /** Loại file: pdf, docx, text, url */
    @Prop({ type: String, default: null })
    fileType: string | null;

    @Prop({
        type: String,
        required: true,
        enum: ['pending', 'indexing', 'indexed', 'failed'],
        default: 'pending',
        index: true,
    })
    status: string;

    @Prop({ type: Number, default: 0 })
    chunkCount: number;

    @Prop({ type: Date, default: null })
    indexedAt: Date | null;

    @Prop({ type: String, default: null })
    errorMessage: string | null;

    @Prop({
        type: {
            source: { type: String, default: null },
            author: { type: String, default: null },
            tags: { type: [String], default: [] },
            language: { type: String, enum: ['vi', 'en'], default: 'vi' },
        },
        default: {},
    })
    metadata: {
        source?: string;
        author?: string;
        tags?: string[];
        language?: 'vi' | 'en';
    };
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocument);

// Compound indexes
KnowledgeDocumentSchema.index({ tenantSlug: 1, category: 1, status: 1 });
KnowledgeDocumentSchema.index({ tenantSlug: 1, status: 1, createdAt: -1 });
