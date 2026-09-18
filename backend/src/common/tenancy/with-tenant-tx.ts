import { BadRequestException } from '@nestjs/common';
import { type DataSource, type EntityManager } from 'typeorm';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * SQL for setting the per-request tenant context (SPEC §2). `SET LOCAL` does
 * not accept bind parameters in the Postgres wire protocol, so the value is
 * interpolated after strict UUID validation; `LOCAL` scopes it to the current
 * transaction so pooled connections can never leak tenant context.
 */
export function setTenantContextSql(organizationId: string): string {
  if (!UUID_PATTERN.test(organizationId)) {
    throw new BadRequestException('organization id is not a valid UUID');
  }
  return `SET LOCAL app.current_organization_id = '${organizationId}'`;
}

/**
 * Opens one transaction, sets `app.current_organization_id` to the given org
 * before any query, then runs `fn` inside it. RLS policies keyed on
 * `current_setting('app.current_organization_id', true)::uuid` enforce
 * tenancy; `SET LOCAL` guarantees the setting dies with the transaction.
 */
export async function withTenantTx<T>(
  dataSource: DataSource,
  organizationId: string,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return dataSource.transaction(async (manager) => {
    await manager.query(setTenantContextSql(organizationId));
    return fn(manager);
  });
}
