import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

const DEFAULT_WEB_ORIGIN = 'http://localhost:5173';

/**
 * Builds the configured Nest application (global prefix, CORS, validation).
 * Shared by main.ts and the e2e suite so tests run with the exact same
 * middleware as production.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  // CORS origin comes from env (review N-7): WEB_ORIGIN, documented in
  // .env.example; defaults to the local Vite dev server.
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN', DEFAULT_WEB_ORIGIN),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  return app;
}
