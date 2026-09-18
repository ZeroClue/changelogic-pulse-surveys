import { Module } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';

// No forFeature (review N-6): OrganizationsService.memberCount is raw SQL on
// the transactional EntityManager inside the tenant tx; the Organization
// entity metadata is registered by SeedModule.
@Module({
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
