import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

const DEFAULT_WEB_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

/**
 * CORS origins come from WEB_ORIGIN (review N-7), documented in .env.example:
 * a comma-separated list of exact origins (no wildcards, credentials
 * unchanged). Defaults to both local Vite servers — dev (:5173) and
 * preview (:4173) — when unset.
 */
function parseWebOrigins(raw: string | undefined): string[] {
  const configured = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return configured.length > 0 ? configured : DEFAULT_WEB_ORIGINS;
}

/**
 * Builds the configured Nest application (global prefix, CORS, validation).
 * Shared by main.ts and the e2e suite so tests run with the exact same
 * middleware as production.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: parseWebOrigins(config.get<string>('WEB_ORIGIN')),
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  return app;
}
