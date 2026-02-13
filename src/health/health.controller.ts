import { Controller, Get } from '@nestjs/common';
import { VectorDbService } from '../rag/vector-db.service';
import { EmbeddingService } from '../rag/embedding.service';

@Controller('api')
export class HealthController {
    constructor(
        private readonly vectorDbService: VectorDbService,
        private readonly embeddingService: EmbeddingService,
    ) { }

    /** Health check — không cần API key */
    @Get('health')
    async health() {
        const [qdrantOk, geminiOk] = await Promise.all([
            this.vectorDbService.healthCheck(),
            this.embeddingService.healthCheck(),
        ]);

        return {
            status: qdrantOk && geminiOk ? 'ok' : 'degraded',
            qdrant: qdrantOk ? 'connected' : 'disconnected',
            gemini: geminiOk ? 'available' : 'unavailable',
            timestamp: new Date().toISOString(),
        };
    }
}
