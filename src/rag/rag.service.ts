import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { LlmService, LlmResponse } from './llm.service';
import { SearchResult, VectorDbService } from './vector-db.service';

/** [js-set-map-lookups] Hoisted uncertainty phrases for O(1) repeated lookups */
const UNCERTAINTY_PHRASES = [
    'không có đủ thông tin',
    'không biết',
    'không chắc',
    'nhân viên hỗ trợ',
    'kết nối bạn với',
] as const;

export interface RagRetrievalResult {
    chunks: SearchResult[];
    maxScore: number;
}

export interface RagGenerateResult {
    response: string;
    confidence: number;
    tokenUsage: number;
    processingTime: number;
}

@Injectable()
export class RagService {
    private readonly logger = new Logger(RagService.name);

    constructor(
        private readonly embeddingService: EmbeddingService,
        private readonly vectorDbService: VectorDbService,
        private readonly llmService: LlmService,
    ) { }

    /** Tìm kiến thức liên quan từ Qdrant */
    async retrieve(params: {
        query: string;
        tenantSlug: string;
        category?: string;
        topK?: number;
    }): Promise<RagRetrievalResult> {
        const queryEmbedding = await this.embeddingService.embed(params.query);

        const results = await this.vectorDbService.search({
            vector: queryEmbedding,
            tenantSlug: params.tenantSlug,
            category: params.category,
            topK: params.topK || 5,
        });

        return {
            chunks: results,
            maxScore: results.length > 0 ? results[0].score : 0,
        };
    }

    /** Tạo câu trả lời dựa trên context + lịch sử hội thoại */
    async generate(params: {
        query: string;
        context: SearchResult[];
        conversationHistory: Array<{ role: 'visitor' | 'assistant'; content: string }>;
        config: {
            responseStyle: string;
            maxResponseLength: number;
            language: string;
            aiDisplayName: string;
        };
    }): Promise<RagGenerateResult> {
        const startTime = Date.now();

        const systemPrompt = this.buildSystemPrompt(params.config);
        const userPrompt = this.buildUserPrompt(params.query, params.context);

        // Multi-turn: giữ tối đa 10 messages gần nhất để tránh token overflow
        const MAX_HISTORY = 10;
        const recentHistory = params.conversationHistory.slice(-MAX_HISTORY);

        // Chuyển đổi lịch sử hội thoại
        const messages = recentHistory.map((msg) => ({
            role: (msg.role === 'visitor' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content,
        }));

        // Thêm tin nhắn mới
        messages.push({ role: 'user' as const, content: userPrompt });

        const llmResponse: LlmResponse = await this.llmService.chat({
            systemPrompt,
            messages,
            temperature: 0.3,
            maxTokens: params.config.maxResponseLength
                ? Math.min(params.config.maxResponseLength * 2, 1000)
                : 500,
        });

        const processingTime = Date.now() - startTime;

        // Tính confidence dựa trên context scores và response quality
        const confidence = this.calculateConfidence(params.context, llmResponse.text);

        return {
            response: llmResponse.text,
            confidence,
            tokenUsage: llmResponse.tokenUsage,
            processingTime,
        };
    }

    private buildSystemPrompt(config: {
        responseStyle: string;
        language: string;
        aiDisplayName: string;
    }): string {
        const name = config.aiDisplayName || 'AI Assistant';
        const isProf = config.responseStyle === 'professional';

        return `Bạn là "${name}", trợ lý AI của doanh nghiệp trên nền tảng chat trực tuyến.

## Vai trò
- Hỗ trợ khách hàng giải đáp thắc mắc dựa trên tài liệu nội bộ
- Phong cách: ${isProf ? 'Chuyên nghiệp, lịch sự, sử dụng kính ngữ' : 'Thân thiện, tự nhiên, gần gũi như nhân viên CSKH'}
- Ngôn ngữ: Tiếng Việt

## Quy tắc BẮT BUỘC
1. CHỈ sử dụng thông tin từ "Context" được cung cấp — KHÔNG BAO GIỜ bịa đặt
2. Nếu Context không đủ thông tin → trả lời: "Tôi chưa có đủ thông tin về vấn đề này. Để tôi kết nối bạn với nhân viên hỗ trợ nhé!"
3. Giữ câu trả lời ngắn gọn (2-4 câu). Dài hơn nếu cần giải thích chi tiết
4. Có thể trích dẫn nguồn: "Theo tài liệu [tên tài liệu]..."
5. KHÔNG đề cập đến "Context", "tài liệu tham khảo", "hệ thống" — nói như bạn TỰ BIẾT
6. Nếu khách hỏi ngoài phạm vi (chính trị, tôn giáo, 18+) → từ chối lịch sự
7. Khi trả lời danh sách, dùng bullet points cho dễ đọc`;
    }

    private buildUserPrompt(query: string, context: SearchResult[]): string {
        if (context.length === 0) {
            return `Câu hỏi: ${query}\n\n(Không tìm thấy tài liệu liên quan — hãy cho khách biết và đề nghị kết nối nhân viên)`;
        }

        const contextStr = context
            .map((c, i) => {
                const title = (c.metadata?.documentTitle as string) || 'N/A';
                return `[${i + 1}] (Nguồn: ${title}, Relevance: ${(c.score * 100).toFixed(0)}%)\n${c.content}`;
            })
            .join('\n\n');

        return `Context:\n${contextStr}\n\nCâu hỏi: ${query}`;
    }

    /** Tính confidence dựa trên context scores */
    private calculateConfidence(context: SearchResult[], response: string): number {
        // [js-early-exit] Return sớm nếu không có context
        if (context.length === 0) return 0.1;

        // [js-combine-iterations] Kết hợp slice + map + reduce thành 1 loop
        const topK = Math.min(context.length, 3);
        let totalScore = 0;
        for (let i = 0; i < topK; i++) {
            totalScore += context[i].score;
        }
        const avgScore = totalScore / topK;

        // [js-set-map-lookups] Dùng hoisted constant thay vì tạo mới mỗi lần gọi
        const lowerResponse = response.toLowerCase();
        const hasUncertainty = UNCERTAINTY_PHRASES.some((phrase) =>
            lowerResponse.includes(phrase),
        );

        const confidence = hasUncertainty ? Math.min(avgScore * 0.5, 0.4) : avgScore;

        return Math.round(confidence * 100) / 100;
    }
}
