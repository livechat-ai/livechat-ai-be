import { Injectable, Logger } from '@nestjs/common';
import { ChatRequestDto, ChatResponseDto } from './chat.dto';
import { IntentService } from '../intent/intent.service';
import { RagService } from '../rag/rag.service';

@Injectable()
export class ChatService {
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private readonly intentService: IntentService,
        private readonly ragService: RagService,
    ) { }

    /** Xử lý tin nhắn từ visitor */
    async processMessage(dto: ChatRequestDto): Promise<ChatResponseDto> {
        const startTime = Date.now();

        const config = {
            responseStyle: dto.config?.responseStyle || 'friendly',
            maxResponseLength: dto.config?.maxResponseLength || 300,
            language: dto.config?.language || 'vi',
            confidenceThreshold: dto.config?.confidenceThreshold || 0.7,
            enabledCategories: dto.config?.enabledCategories || [],
            aiDisplayName: dto.config?.aiDisplayName || 'AI Assistant',
        };

        // 1. [async-defer-await] Phát hiện ý định TRƯỚC — cheap operation, có thể return sớm
        const intent = this.intentService.detectIntent(dto.message);

        // 2. [js-early-exit] Nếu visitor yêu cầu nhân viên → return ngay, KHÔNG gọi RAG/LLM
        if (intent.isEscalationRequest) {
            return {
                response: 'Tôi sẽ kết nối bạn với nhân viên hỗ trợ ngay. Vui lòng chờ trong giây lát!',
                confidence: 1,
                intent: 'escalation',
                shouldEscalate: true,
                escalationReason: 'user_request',
                retrievedChunks: [],
                tokenUsage: 0,
                processingTime: Date.now() - startTime,
            };
        }

        // 3. [async-parallel] Vector search & history prep có thể chạy song song
        //    Nhưng RAG generate phụ thuộc retrieval result → KHÔNG parallel toàn bộ
        //    Chỉ parallel nếu có thêm operations độc lập trong tương lai

        // 4. Tìm kiến thức từ Knowledge Base (expensive: embedding + Qdrant search)
        const retrievalResult = await this.ragService.retrieve({
            query: dto.message,
            tenantSlug: dto.tenantSlug,
            category: intent.category !== 'general' ? intent.category : undefined,
            topK: 5,
        });

        // 5. Tạo câu trả lời bằng LLM (expensive: API call to OpenAI)
        const ragResult = await this.ragService.generate({
            query: dto.message,
            context: retrievalResult.chunks,
            conversationHistory: dto.conversationHistory || [],
            config,
        });

        // 6. [js-early-exit] Quyết định escalation — return structure based on confidence
        const shouldEscalate = ragResult.confidence < config.confidenceThreshold;

        let escalationReason: string | undefined;
        if (shouldEscalate) {
            // [js-length-check-first] Check array length trước so sánh đắt hơn
            escalationReason = retrievalResult.chunks.length === 0 ? 'no_context' : 'low_confidence';
        }

        const processingTime = Date.now() - startTime;

        this.logger.log(
            `Chat processed: intent=${intent.category}, confidence=${ragResult.confidence}, escalate=${shouldEscalate}, ${processingTime}ms`,
        );

        return {
            response: ragResult.response,
            confidence: ragResult.confidence,
            intent: intent.category,
            shouldEscalate,
            escalationReason,
            retrievedChunks: retrievalResult.chunks.map((c) => ({
                chunkId: c.id,
                score: c.score,
                content: c.content,
                documentTitle: (c.metadata?.documentTitle as string) || '',
            })),
            tokenUsage: ragResult.tokenUsage,
            processingTime,
        };
    }
}
