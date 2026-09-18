import { type MigrationBuilder } from 'node-pg-migrate';

const tenantPredicate =
  "organization_id = current_setting('app.current_organization_id', true)::uuid";
const TENANT_TABLES = [
  'users',
  'surveys',
  'questions',
  'responses',
  'answers',
] as const;

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function up(pgm: MigrationBuilder): Promise<void> {
  // Row-level security on every tenant table (SPEC §2): SELECT/UPDATE see only
  // rows of the transaction's org, INSERT/UPDATE must satisfy the same
  // predicate. current_setting(..., true) yields NULL when the setting is
  // absent, so with no tenant context every row fails (fail closed).
  for (const table of TENANT_TABLES) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    pgm.createPolicy(table, 'tenant_isolation', {
      using: tenantPredicate,
      check: tenantPredicate,
    });
  }

  // SECURITY DEFINER helpers owned by pulse_owner, executed by pulse_app:
  // with no tenant context RLS would return zero rows, so the demo login list
  // and the auth-time user lookup must read through the table owner instead.
  pgm.createFunction(
    'list_demo_users',
    [],
    {
      returns: 'TABLE (id uuid, name text, role org_role, organization text)',
      language: 'sql',
      behavior: 'STABLE',
      security: 'DEFINER',
      replace: true,
      set: [{ configurationParameter: 'search_path', value: 'public' }],
    },
    `
      SELECT u.id, u.name, u.role, o.name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      ORDER BY o.name, u.name
    `,
  );

  pgm.createFunction(
    'get_user_for_auth',
    [{ name: 'p_user_id', type: 'uuid' }],
    {
      returns:
        'TABLE (id uuid, organization_id uuid, name text, email text, role org_role, organization_name text)',
      language: 'sql',
      behavior: 'STABLE',
      security: 'DEFINER',
      replace: true,
      set: [{ configurationParameter: 'search_path', value: 'public' }],
    },
    `
      SELECT u.id, u.organization_id, u.name, u.email, u.role, o.name
      FROM users u
      JOIN organizations o ON o.id = u.organization_id
      WHERE u.id = p_user_id
    `,
  );

  // Runtime role: schema usage + DML on app tables + execute on the helpers.
  pgm.sql('GRANT USAGE ON SCHEMA public TO pulse_app');
  pgm.sql(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pulse_app',
  );
  pgm.sql('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO pulse_app');
}

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql('REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM pulse_app');
  pgm.sql(
    'REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM pulse_app',
  );
  pgm.sql('REVOKE USAGE ON SCHEMA public FROM pulse_app');

  pgm.dropFunction('get_user_for_auth', [{ name: 'p_user_id', type: 'uuid' }], {
    ifExists: true,
  });
  pgm.dropFunction('list_demo_users', [], { ifExists: true });

  for (const table of TENANT_TABLES) {
    pgm.dropPolicy(table, 'tenant_isolation', { ifExists: true });
    pgm.sql(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY`);
  }
}
