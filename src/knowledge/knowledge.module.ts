import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { KnowledgeDocument, KnowledgeDocumentSchema } from './schemas/document.schema';
import { KnowledgeChunk, KnowledgeChunkSchema } from './schemas/chunk.schema';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeController } from './knowledge.controller';
import { ExtractionService } from './extraction.service';
import { ChunkingService } from './chunking.service';
import { RagModule } from '../rag/rag.module';
import { BullModule } from '@nestjs/bullmq';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: KnowledgeDocument.name, schema: KnowledgeDocumentSchema },
            { name: KnowledgeChunk.name, schema: KnowledgeChunkSchema },
        ]),
        RagModule,
        BullModule.registerQueue({
            name: 'knowledge-indexing',
        }),
    ],
    controllers: [KnowledgeController],
    providers: [KnowledgeService, ExtractionService, ChunkingService],
    exports: [KnowledgeService],
})
export class KnowledgeModule { }
