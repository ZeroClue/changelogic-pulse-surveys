import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';

// The scaffold e2e only compiles the DI graph (no app.init(), no DB
// connection); a placeholder URL keeps it runnable without infrastructure.
process.env.DATABASE_URL ??=
  'postgres://pulse_app:pulse_app@localhost:5432/pulse';

/**
 * Placeholder e2e spec for the scaffold commit. Full API e2e (happy path,
 * 409 weekly duplicates, 403 roles, cross-org 404) lands with the
 * responses/summary implementation in the next commit.
 */
describe('AppModule (e2e scaffold)', () => {
  it('compiles the application module', async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    expect(moduleFixture).toBeDefined();
  });
});
