import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Post,
    Query,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { KnowledgeService } from './knowledge.service';
import { RagService } from '../rag/rag.service';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { ConfigService } from '@nestjs/config';

@Controller('api/knowledge')
@UseGuards(ApiKeyGuard)
export class KnowledgeController {
    constructor(
        private readonly knowledgeService: KnowledgeService,
        private readonly configService: ConfigService,
        private readonly ragService: RagService,
    ) { }

    /** Upload tài liệu (file hoặc text) */
    @Post('documents')
    @UseInterceptors(
        FileInterceptor('file', {
            storage: diskStorage({
                destination: './uploads',
                filename: (_req, file, cb) => {
                    const ext = extname(file.originalname);
                    const filename = `${uuidv4()}${ext}`;
                    cb(null, filename);
                },
            }),
            limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
            fileFilter: (_req, file, cb) => {
                const allowedTypes = ['.pdf', '.docx', '.txt'];
                const ext = extname(file.originalname).toLowerCase();
                if (allowedTypes.includes(ext)) {
                    cb(null, true);
                } else {
                    cb(new Error(`Không hỗ trợ file ${ext}. Chấp nhận: ${allowedTypes.join(', ')}`), false);
                }
            },
        }),
    )
    async uploadDocument(
        @UploadedFile() file: Express.Multer.File,
        @Body() body: { tenantSlug: string; title: string; category: string; content?: string },
    ) {
        const fileType = file ? extname(file.originalname).replace('.', '') : 'text';

        const doc = await this.knowledgeService.createDocument({
            tenantSlug: body.tenantSlug,
            title: body.title,
            category: body.category,
            content: body.content || undefined,
            filePath: file?.path || undefined,
            fileType,
        });

        return {
            documentId: doc._id.toString(),
            status: doc.status,
            message: 'Tài liệu đang được xử lý...',
        };
    }

    /** Danh sách tài liệu */
    @Get('documents')
    async getDocuments(
        @Query('tenantSlug') tenantSlug?: string,
        @Query('status') status?: string,
        @Query('category') category?: string,
    ) {
        const documents = await this.knowledgeService.getDocuments({
            tenantSlug,
            status,
            category,
        });

        return {
            documents: documents.map((doc: any) => ({
                id: doc._id.toString(),
                title: doc.title,
                category: doc.category,
                status: doc.status,
                chunkCount: doc.chunkCount,
                createdAt: doc.createdAt,
                indexedAt: doc.indexedAt,
                errorMessage: doc.errorMessage,
                metadata: doc.metadata,
            })),
            total: documents.length,
        };
    }

    /** Chi tiết tài liệu */
    @Get('documents/:id')
    async getDocument(@Param('id') id: string) {
        const doc: any = await this.knowledgeService.getDocumentById(id);
        return {
            id: doc._id.toString(),
            title: doc.title,
            category: doc.category,
            status: doc.status,
            chunkCount: doc.chunkCount,
            createdAt: doc.createdAt,
            indexedAt: doc.indexedAt,
            errorMessage: doc.errorMessage,
            metadata: doc.metadata,
            fileType: doc.fileType,
        };
    }

    /** Xóa tài liệu */
    @Delete('documents/:id')
    async deleteDocument(@Param('id') id: string) {
        await this.knowledgeService.deleteDocument(id);
        return { success: true, message: 'Đã xóa tài liệu' };
    }

    /** Reindex tài liệu */
    @Post('reindex/:id')
    async reindexDocument(@Param('id') id: string) {
        await this.knowledgeService.reindexDocument(id);
        return { success: true, message: 'Đang reindex...' };
    }

    /** Tìm kiếm knowledge base (vector similarity search) */
    @Post('search')
    async search(
        @Body() body: { query: string; tenantSlug: string; category?: string; topK?: number },
    ) {
        const result = await this.ragService.retrieve({
            query: body.query,
            tenantSlug: body.tenantSlug,
            category: body.category,
            topK: body.topK || 5,
        });

        return {
            chunks: result.chunks.map((c) => ({
                id: c.id,
                score: c.score,
                content: c.content,
                metadata: c.metadata,
            })),
            maxScore: result.maxScore,
            total: result.chunks.length,
        };
    }
}
