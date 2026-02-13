import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RagModule } from '../rag/rag.module';
import { IntentModule } from '../intent/intent.module';

@Module({
    imports: [RagModule, IntentModule],
    controllers: [ChatController],
    providers: [ChatService],
})
export class ChatModule { }
