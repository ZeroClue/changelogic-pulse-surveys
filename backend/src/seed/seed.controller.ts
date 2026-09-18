import { Controller, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { type SeedResult } from './seed-fixtures';
import { SeedService } from './seed.service';

@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  /** Public dev endpoint: idempotent demo fixture seeding (SPEC §5). */
  @Post()
  @Public()
  seed(): Promise<SeedResult> {
    return this.seedService.seed();
  }
}
