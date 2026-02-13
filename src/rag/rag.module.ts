import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { LlmService } from './llm.service';
import { RagService } from './rag.service';
import { VectorDbService } from './vector-db.service';

@Module({
    providers: [VectorDbService, EmbeddingService, LlmService, RagService],
    exports: [VectorDbService, EmbeddingService, LlmService, RagService],
})
export class RagModule { }
