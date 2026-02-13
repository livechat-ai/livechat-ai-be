import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type KnowledgeChunkDoc = HydratedDocument<KnowledgeChunk>;

@Schema({ timestamps: true, collection: 'chunks' })
export class KnowledgeChunk {
    @Prop({ type: String, required: true, index: true })
    tenantSlug: string;

    @Prop({ type: Types.ObjectId, required: true, ref: 'KnowledgeDocument', index: true })
    documentId: Types.ObjectId;

    /** Thứ tự trong tài liệu */
    @Prop({ type: Number, required: true })
    chunkIndex: number;

    /** Nội dung phân đoạn */
    @Prop({ type: String, required: true })
    content: string;

    /** ID trong Qdrant (liên kết MongoDB ↔ Qdrant) */
    @Prop({ type: String, default: null, index: true })
    qdrantPointId: string | null;

    @Prop({
        type: {
            chunkType: { type: String, default: 'paragraph' },
            category: { type: String, default: null },
            documentTitle: { type: String, default: null },
        },
        default: {},
    })
    metadata: {
        chunkType?: string;
        category?: string;
        documentTitle?: string;
    };

    @Prop({ type: Date, default: null })
    indexedAt: Date | null;
}

export const KnowledgeChunkSchema = SchemaFactory.createForClass(KnowledgeChunk);

// Compound indexes
KnowledgeChunkSchema.index({ documentId: 1, chunkIndex: 1 });
KnowledgeChunkSchema.index({ tenantSlug: 1, documentId: 1 });
