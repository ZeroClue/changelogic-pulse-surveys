import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { SeedService } from './seed.service';

/**
 * Standalone seeding entrypoint (npm run seed). Boots the Nest application
 * context (so the same DATABASE_URL/config wiring as the API applies) and
 * runs the same SeedService as POST /api/seed. Safe to re-run.
 */
async function runSeed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const seedService = app.get(SeedService);
    const result = await seedService.seed();

    for (const organization of result.organizations) {
      const survey = result.surveys.find(
        (s) => s.organization === organization.name,
      );
      const users = result.users
        .filter((u) => u.organization === organization.name)
        .map((u) => `${u.name} (${u.role})`)
        .join(', ');
      console.log(`- ${organization.name} [${organization.id}]`);
      console.log(`    users: ${users}`);
      console.log(
        `    survey: "${survey?.title}" with ${survey?.questions.length ?? 0} questions`,
      );
    }
    console.log('Seed completed.');
  } finally {
    await app.close();
  }
}

void runSeed();
