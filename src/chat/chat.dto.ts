import { IsString, IsArray, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ConversationMessageDto {
    @IsString()
    role: 'visitor' | 'assistant';

    @IsString()
    content: string;
}

class ChatConfigDto {
    @IsOptional()
    @IsString()
    responseStyle?: string;

    @IsOptional()
    @IsNumber()
    maxResponseLength?: number;

    @IsOptional()
    @IsString()
    language?: string;

    @IsOptional()
    @IsNumber()
    confidenceThreshold?: number;

    @IsOptional()
    @IsArray()
    enabledCategories?: string[];

    @IsOptional()
    @IsString()
    aiDisplayName?: string;
}

export class ChatRequestDto {
    @IsString()
    message: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConversationMessageDto)
    conversationHistory?: ConversationMessageDto[];

    @IsString()
    tenantSlug: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => ChatConfigDto)
    config?: ChatConfigDto;
}

export class ChatResponseDto {
    response: string;
    confidence: number;
    intent: string;
    shouldEscalate: boolean;
    escalationReason?: string;
    retrievedChunks: Array<{
        chunkId: string;
        score: number;
        content: string;
        documentTitle: string;
    }>;
    tokenUsage: number;
    processingTime: number;
}
