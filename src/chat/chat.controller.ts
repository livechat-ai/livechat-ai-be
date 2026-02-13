import { Body, Controller, HttpException, HttpStatus, Logger, Post, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { ChatService } from './chat.service';
import { ChatRequestDto, ChatResponseDto } from './chat.dto';

@Controller('api')
@UseGuards(ApiKeyGuard)
export class ChatController {
    private readonly logger = new Logger(ChatController.name);

    constructor(private readonly chatService: ChatService) { }

    /** Core API: KLive-BE gọi để xử lý tin nhắn visitor */
    @Post('chat')
    async chat(@Body() dto: ChatRequestDto): Promise<ChatResponseDto> {
        try {
            return await this.chatService.processMessage(dto);
        } catch (error) {
            const message = error?.message || 'Unknown error';

            // Rate limit — trả lời fallback thay vì 500
            if (message.includes('429') || message.includes('quota') || message.includes('RESOURCE_EXHAUSTED')) {
                this.logger.warn(`Gemini rate limit hit: ${message}`);
                return {
                    response: 'Xin lỗi, hệ thống AI đang bận. Để tôi kết nối bạn với nhân viên hỗ trợ nhé!',
                    confidence: 0,
                    intent: 'general',
                    shouldEscalate: true,
                    escalationReason: 'ai_rate_limited',
                    retrievedChunks: [],
                    tokenUsage: 0,
                    processingTime: 0,
                };
            }

            this.logger.error(`Chat error: ${message}`);
            throw new HttpException(
                { message: 'Lỗi xử lý tin nhắn AI', error: message },
                HttpStatus.SERVICE_UNAVAILABLE,
            );
        }
    }
}
