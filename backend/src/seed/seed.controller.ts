import { Controller, ForbiddenException, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { type SeedResult } from './seed-fixtures';
import { SeedService } from './seed.service';

/**
 * Public dev endpoint: idempotent demo fixture seeding (SPEC §5). Gated to
 * non-production (review E-1): in production the route answers 404 so an
 * exposed deployment cannot have its fixtures rewritten by any client.
 */
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @Post()
  @Public()
  seed(): Promise<SeedResult> {
    if (process.env.NODE_ENV === 'production') {
      // ForbiddenException (403): the endpoint exists but is disabled.
      throw new ForbiddenException('Seeding is disabled in production');
    }
    return this.seedService.seed();
  }
}
