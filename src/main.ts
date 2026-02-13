import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: '*', // Sẽ restrict trong production
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  });

  const port = configService.get<number>('port') || 3300;

  await app.listen(port);
  logger.log(`LiveChat-AI server running on port ${port}`);
  logger.log(`Health check: http://localhost:${port}/api/health`);
}

bootstrap();
