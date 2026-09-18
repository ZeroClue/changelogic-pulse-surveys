const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * SQL for setting the per-transaction tenant context (SPEC §2). `SET LOCAL`
 * does not accept bind parameters in the Postgres wire protocol, so the value
 * is interpolated after strict UUID validation; `LOCAL` scopes it to the
 * current transaction so pooled connections can never leak tenant context.
 *
 * A non-UUID org id reaching this function is a programming error: callers
 * (guard, seeded fixtures, tenancy runtime) always pass DB-derived or
 * validated ids. Plain `Error` — the DB layer must not throw HTTP exceptions
 * (review A-3); HTTP mapping happens at the boundary if ever needed.
 */
export function setTenantContextSql(organizationId: string): string {
  if (!isUuid(organizationId)) {
    throw new Error(
      'organization id is not a valid UUID; refusing to set tenant context',
    );
  }
  return `SET LOCAL app.current_organization_id = '${organizationId}'`;
}
