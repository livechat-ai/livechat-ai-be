import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface LlmResponse {
    text: string;
    tokenUsage: number;
    finishReason: string;
}

/** Retry config cho Gemini free tier rate limits */
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 5000; // 5s

@Injectable()
export class LlmService {
    private readonly logger = new Logger(LlmService.name);
    private readonly genAI: GoogleGenerativeAI;
    private readonly model: string;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>('gemini.apiKey')!;
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.configService.get<string>('gemini.chatModel')!;
    }

    /** Gọi LLM với system + user prompt */
    async complete(params: {
        systemPrompt: string;
        userPrompt: string;
        temperature?: number;
        maxTokens?: number;
    }): Promise<LlmResponse> {
        const startTime = Date.now();

        const model = this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: params.systemPrompt,
            generationConfig: {
                temperature: params.temperature ?? 0.3,
                maxOutputTokens: params.maxTokens ?? 500,
            },
        });

        const result = await this.withRetry(() => model.generateContent(params.userPrompt));
        const response = result.response;
        const processingTime = Date.now() - startTime;

        const tokenUsage =
            (response.usageMetadata?.promptTokenCount || 0) +
            (response.usageMetadata?.candidatesTokenCount || 0);

        this.logger.debug(`LLM response: ${processingTime}ms, tokens: ${tokenUsage}`);

        return {
            text: response.text(),
            tokenUsage,
            finishReason: response.candidates?.[0]?.finishReason || 'unknown',
        };
    }

    /** Gọi LLM với lịch sử hội thoại */
    async chat(params: {
        systemPrompt: string;
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        temperature?: number;
        maxTokens?: number;
    }): Promise<LlmResponse> {
        const startTime = Date.now();

        const model = this.genAI.getGenerativeModel({
            model: this.model,
            systemInstruction: params.systemPrompt,
            generationConfig: {
                temperature: params.temperature ?? 0.3,
                maxOutputTokens: params.maxTokens ?? 500,
            },
        });

        // Gemini dùng 'model' thay vì 'assistant'
        const history = params.messages.slice(0, -1).map((msg) => ({
            role: msg.role === 'assistant' ? 'model' as const : 'user' as const,
            parts: [{ text: msg.content }],
        }));

        const lastMessage = params.messages[params.messages.length - 1];
        const chat = model.startChat({ history });

        const result = await this.withRetry(() => chat.sendMessage(lastMessage.content));
        const response = result.response;
        const processingTime = Date.now() - startTime;

        const tokenUsage =
            (response.usageMetadata?.promptTokenCount || 0) +
            (response.usageMetadata?.candidatesTokenCount || 0);

        this.logger.debug(`LLM chat: ${processingTime}ms, tokens: ${tokenUsage}`);

        return {
            text: response.text(),
            tokenUsage,
            finishReason: response.candidates?.[0]?.finishReason || 'unknown',
        };
    }

    /** Retry with exponential backoff cho 429 rate limits */
    private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                return await fn();
            } catch (error) {
                const msg = error?.message || '';
                const isRateLimit = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota');

                if (!isRateLimit || attempt === MAX_RETRIES) {
                    throw error; // Rethrow non-429 errors or final attempt
                }

                const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
                this.logger.warn(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`);
                await new Promise((resolve) => setTimeout(resolve, delay));
            }
        }
        throw new Error('Max retries exceeded');
    }
}
