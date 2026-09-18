import { Logger } from '@nestjs/common';
import { createApp } from './app-setup';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

// Bootstrap failures must be loud and fatal (review N-3): log and exit
// non-zero instead of discarding the promise.
bootstrap().catch((error: unknown) => {
  const logger = new Logger('Bootstrap');
  if (error instanceof Error) {
    logger.error(`Application bootstrap failed: ${error.message}`, error.stack);
  } else {
    logger.error(`Application bootstrap failed: ${String(error)}`);
  }
  process.exit(1);
});
