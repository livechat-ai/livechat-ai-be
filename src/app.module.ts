import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './config/configuration';
import { ChatModule } from './chat/chat.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { RagModule } from './rag/rag.module';
import { IntentModule } from './intent/intent.module';
import { HealthController } from './health/health.controller';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    // Config
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('mongodb.uri'),
      }),
      inject: [ConfigService],
    }),

    // Feature modules
    QueueModule,
    RagModule,
    IntentModule,
    KnowledgeModule,
    ChatModule,
  ],
  controllers: [HealthController],
})
export class AppModule { }
