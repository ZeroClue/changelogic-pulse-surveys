import { QueryFailedError } from 'typeorm';

/**
 * Postgres SQLSTATE of the driver error, when present (e.g. '23505'
 * unique_violation). QueryFailedError copies pg driver properties onto itself;
 * a narrow helper keeps the access type-safe.
 */
export function pgErrorCode(error: unknown): string | undefined {
  if (error instanceof QueryFailedError) {
    const code: unknown = (error.driverError as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
