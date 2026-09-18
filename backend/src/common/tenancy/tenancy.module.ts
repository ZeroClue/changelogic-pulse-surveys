import { Global, Module } from '@nestjs/common';
import { TenancyService } from './tenancy.service';

/**
 * Global so every module can inject the tenancy runtime without importing;
 * the TypeORM DataSource comes from the root TypeOrmModule (global).
 */
@Global()
@Module({
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
