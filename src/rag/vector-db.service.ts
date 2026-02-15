import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface SearchResult {
    id: string;
    score: number;
    content: string;
    metadata: Record<string, unknown>;
}

@Injectable()
export class VectorDbService implements OnModuleInit {
    private readonly logger = new Logger(VectorDbService.name);
    private client: QdrantClient;
    private collectionName: string;

    constructor(private readonly configService: ConfigService) {
        const qdrantUrl = this.configService.get<string>('qdrant.url')!;
        this.collectionName = this.configService.get<string>('qdrant.collection')!;
        this.client = new QdrantClient({ url: qdrantUrl });
    }

    async onModuleInit() {
        await this.ensureCollection();
    }

    /** Tạo collection nếu chưa tồn tại */
    private async ensureCollection() {
        try {
            const collections = await this.client.getCollections();
            const exists = collections.collections.some((c) => c.name === this.collectionName);

            if (!exists) {
                await this.client.createCollection(this.collectionName, {
                    vectors: {
                        size: 768, // Google text-embedding-004 output dimension
                        distance: 'Cosine',
                    },
                });
                this.logger.log(`Đã tạo collection "${this.collectionName}"`);
            } else {
                this.logger.log(`Collection "${this.collectionName}" đã tồn tại`);
            }
        } catch (error) {
            this.logger.error(`Lỗi kết nối Qdrant: ${error.message}`);
        }
    }

    /** Thêm/cập nhật vectors vào Qdrant */
    async upsertPoints(
        points: Array<{
            id: string;
            vector: number[];
            payload: Record<string, unknown>;
        }>,
    ) {
        await this.client.upsert(this.collectionName, {
            wait: true,
            points: points.map((p) => ({
                id: p.id,
                vector: p.vector,
                payload: p.payload,
            })),
        });
    }

    /** Tìm kiếm vector gần nhất */
    async search(params: {
        vector: number[];
        tenantSlug: string;
        category?: string;
        topK?: number;
    }): Promise<SearchResult[]> {
        const filter: Record<string, unknown> = {
            must: [{ key: 'tenantSlug', match: { value: params.tenantSlug } }],
        };

        if (params.category) {
            (filter.must as unknown[]).push({
                key: 'category',
                match: { value: params.category },
            });
        }

        const results = await this.client.search(this.collectionName, {
            vector: params.vector,
            filter,
            limit: params.topK || 5,
            with_payload: true,
        });

        return results.map((r) => ({
            id: r.id as string,
            score: r.score,
            content: (r.payload?.content as string) || '',
            metadata: (r.payload as Record<string, unknown>) || {},
        }));
    }

    /** Xóa points theo document ID */
    async deleteByDocumentId(documentId: string) {
        await this.client.delete(this.collectionName, {
            wait: true,
            filter: {
                must: [{ key: 'documentId', match: { value: documentId } }],
            },
        });
    }

    /** Kiểm tra kết nối */
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.getCollections();
            return true;
        } catch {
            return false;
        }
    }
}
