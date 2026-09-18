import { type MigrationBuilder } from 'node-pg-migrate';

/**
 * GET /api/users gains `organization_id` (migration 004 follow-up).
 *
 * The demo login list exposed only the org NAME, which forced the UI to
 * learn organization ids through the dev-only POST /api/seed response.
 * Returning the id directly from `list_demo_users()` lets the login screen
 * send `X-Org-Id` straight from the list.
 *
 * The return shape CHANGES (new column), so `CREATE OR REPLACE` is not an
 * option — Postgres cannot alter a function's OUT parameters in place —
 * hence the DROP + fresh CREATE. A fresh CREATE re-grants EXECUTE to PUBLIC
 * by default, so the 003 hardening is re-applied after both directions:
 * REVOKE EXECUTE FROM PUBLIC + GRANT EXECUTE TO pulse_app. Everything else
 * 003 established is preserved: SECURITY DEFINER owned by pulse_owner
 * (migrations run as pulse_owner), pinned search_path, LIMIT 100.
 */
const APP_ROLE = 'pulse_app';

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction('list_demo_users', []);
  pgm.createFunction(
    'list_demo_users',
    [],
    {
      returns:
        'TABLE (id uuid, name text, role org_role, organization text, organization_id uuid)',
      language: 'sql',
      behavior: 'STABLE',
      security: 'DEFINER',
      set: [{ configurationParameter: 'search_path', value: 'public' }],
    },
    `
      SELECT u.id, u.name, u.role, o.name, u.organization_id
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      ORDER BY o.name, u.name
      LIMIT 100
    `,
  );

  pgm.sql('REVOKE EXECUTE ON FUNCTION list_demo_users() FROM PUBLIC');
  pgm.sql(`GRANT EXECUTE ON FUNCTION list_demo_users() TO ${APP_ROLE}`);
}

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropFunction('list_demo_users', []);
  // Restore the 003 shape (org name only); LIMIT 100, DEFINER, search_path.
  pgm.createFunction(
    'list_demo_users',
    [],
    {
      returns: 'TABLE (id uuid, name text, role org_role, organization text)',
      language: 'sql',
      behavior: 'STABLE',
      security: 'DEFINER',
      set: [{ configurationParameter: 'search_path', value: 'public' }],
    },
    `
      SELECT u.id, u.name, u.role, o.name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      ORDER BY o.name, u.name
      LIMIT 100
    `,
  );

  pgm.sql('REVOKE EXECUTE ON FUNCTION list_demo_users() FROM PUBLIC');
  pgm.sql(`GRANT EXECUTE ON FUNCTION list_demo_users() TO ${APP_ROLE}`);
}
