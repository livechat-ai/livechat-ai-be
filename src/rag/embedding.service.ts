import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

@Injectable()
export class EmbeddingService {
    private readonly logger = new Logger(EmbeddingService.name);
    private readonly genAI: GoogleGenerativeAI;
    private readonly model: string;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('gemini.apiKey')!;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.configService.get<string>('gemini.embeddingModel')!;
    }

    /** Tạo embedding cho 1 đoạn text */
    async embed(text: string): Promise<number[]> {
        const model = this.genAI.getGenerativeModel({ model: this.model });
        const result = await model.embedContent(text);
        return result.embedding.values;
    }

    /** Tạo embedding batch cho nhiều đoạn text */
    async embedBatch(texts: string[]): Promise<number[][]> {
        if (texts.length === 0) return [];

        const model = this.genAI.getGenerativeModel({ model: this.model });

        // Gemini hỗ trợ batch embedding qua batchEmbedContents
        const batchSize = 100;
        const allEmbeddings: number[][] = [];

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);

            const result = await model.batchEmbedContents({
                requests: batch.map((text) => ({
                    content: { role: 'user', parts: [{ text }] },
                })),
            });

            allEmbeddings.push(...result.embeddings.map((e) => e.values));

            this.logger.debug(
                `Embedded batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`,
            );
        }

        return allEmbeddings;
    }

    /** Kiểm tra kết nối Gemini */
    async healthCheck(): Promise<boolean> {
        try {
            const model = this.genAI.getGenerativeModel({ model: this.model });
            await model.embedContent('test');
            return true;
        } catch {
            return false;
        }
    }
}
