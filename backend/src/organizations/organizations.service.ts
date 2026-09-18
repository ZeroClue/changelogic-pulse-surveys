import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';

/**
 * Organization reads. The member count is computed INSIDE the caller's tenant
 * transaction (review A-1): raw SQL on the transactional EntityManager, RLS
 * scopes it to the caller's org, the explicit filter is defense in depth
 * (SPEC §2). Denominator of the summary completion rate (SPEC §5).
 */
@Injectable()
export class OrganizationsService {
  async memberCount(
    manager: EntityManager,
    organizationId: string,
  ): Promise<number> {
    const rows = await manager.query<{ count: number }[]>(
      'SELECT COUNT(*)::int AS count FROM users WHERE organization_id = $1',
      [organizationId],
    );
    return rows[0]?.count ?? 0;
  }
}
