import { type MigrationBuilder } from 'node-pg-migrate';

/**
 * RLS + privilege hardening (reviews S-1, S-3, S-5, P-1, N-5).
 *
 * Migration 002 created one ALL-commands policy per tenant table with the
 * predicate `organization_id = current_setting('app.current_organization_id', true)::uuid`.
 * That predicate fails on any pooled connection that has served one
 * SET LOCAL transaction: after COMMIT Postgres keeps the custom GUC "defined"
 * with an empty string, and `''::uuid` THROWS `invalid input syntax for type
 * uuid` instead of yielding zero rows (fail-closed by error, not by design).
 *
 * This migration is a NEW migration on purpose: 001/002 are already applied
 * and committed, and must never be edited in place.
 */
const TENANT_PREDICATE =
  "organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid";
const TENANT_TABLES = [
  'users',
  'surveys',
  'questions',
  'responses',
  'answers',
] as const;
const APP_ROLE = 'pulse_app';

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function up(pgm: MigrationBuilder): Promise<void> {
  // ---- P-1: indexes for the auth/summary paths -----------------------------
  // users(organization_id): org member-count denominator (summary rate).
  pgm.createIndex('users', ['organization_id'], {
    name: 'idx_users_organization_id',
  });
  // Org-leading composite: every RLS-filtered response query predicates on
  // organization_id first (survey+week composite already exists from 001).
  pgm.createIndex('responses', ['organization_id', 'survey_id', 'week_start'], {
    name: 'idx_responses_org_survey_week',
  });
  // answers(question_id) exists from 001; add the org-leading composite for
  // per-org answer lookups.
  pgm.createIndex('answers', ['organization_id', 'response_id'], {
    name: 'idx_answers_org_response',
  });

  // ---- S-1 + S-3: NULLIF predicate, per-command policies -------------------
  // DROP the single ALL-commands policy and recreate two per-command policies
  // with the NULL-safe predicate (works for NULL and '' alike → zero rows,
  // fail closed by design on fresh AND warm connections). No UPDATE/DELETE
  // policies are created: responses/answers are immutable at runtime, and
  // users.role / surveys.is_active must not be writable by pulse_app.
  for (const table of TENANT_TABLES) {
    pgm.dropPolicy(table, 'tenant_isolation', { ifExists: true });
    pgm.createPolicy(table, 'tenant_select', {
      command: 'SELECT',
      role: APP_ROLE,
      using: TENANT_PREDICATE,
    });
    pgm.createPolicy(table, 'tenant_insert', {
      command: 'INSERT',
      role: APP_ROLE,
      check: TENANT_PREDICATE,
    });
  }

  // ---- S-3: runtime role cannot mutate or delete app rows ------------------
  // UPDATE/DELETE are revoked table-wide (users, surveys, questions,
  // responses, answers AND the organizations tenant root). The seed flow was
  // rewritten to INSERT … ON CONFLICT DO NOTHING + read, so idempotent
  // re-seeding no longer needs UPDATE. The migration-bookkeeping table keeps
  // no runtime privileges at all (it inherited the 002 blanket grant).
  pgm.sql(
    `REVOKE UPDATE, DELETE ON ${TENANT_TABLES.join(', ')}, organizations FROM ${APP_ROLE}`,
  );
  pgm.sql(`REVOKE ALL ON pgmigrations FROM ${APP_ROLE}`);

  // ---- S-5: future tables start visible to pulse_app -----------------------
  pgm.sql(
    `ALTER DEFAULT PRIVILEGES FOR ROLE pulse_owner IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO ${APP_ROLE}`,
  );

  // ---- N-5: function hardening ---------------------------------------------
  // list_demo_users gets a LIMIT; blanket GRANT EXECUTE ON ALL FUNCTIONS is
  // replaced by explicit execute on exactly the two helpers; PUBLIC execute
  // is revoked. Functions are REPLACEd so ownership/definer settings stay
  // pinned to pulse_owner with a fixed search_path.
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
      LIMIT 100
    `,
  );

  pgm.sql(`REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM ${APP_ROLE}`);
  pgm.sql('REVOKE EXECUTE ON FUNCTION list_demo_users() FROM PUBLIC');
  pgm.sql('REVOKE EXECUTE ON FUNCTION get_user_for_auth(uuid) FROM PUBLIC');
  pgm.sql(`GRANT EXECUTE ON FUNCTION list_demo_users() TO ${APP_ROLE}`);
  pgm.sql(`GRANT EXECUTE ON FUNCTION get_user_for_auth(uuid) TO ${APP_ROLE}`);
}

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function down(pgm: MigrationBuilder): Promise<void> {
  // Reverse in the opposite order of up.
  pgm.sql(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO ${APP_ROLE}`);
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

  pgm.sql(
    `ALTER DEFAULT PRIVILEGES FOR ROLE pulse_owner IN SCHEMA public REVOKE SELECT, INSERT ON TABLES FROM ${APP_ROLE}`,
  );
  pgm.sql(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`,
  );

  for (const table of TENANT_TABLES) {
    pgm.dropPolicy(table, 'tenant_select', { ifExists: true });
    pgm.dropPolicy(table, 'tenant_insert', { ifExists: true });
    // Restore the pre-003 policy (002 form) so 002.down still makes sense.
    pgm.createPolicy(table, 'tenant_isolation', {
      using:
        "organization_id = current_setting('app.current_organization_id', true)::uuid",
      check:
        "organization_id = current_setting('app.current_organization_id', true)::uuid",
    });
  }

  pgm.dropIndex('answers', ['organization_id', 'response_id'], {
    name: 'idx_answers_org_response',
    ifExists: true,
  });
  pgm.dropIndex('responses', ['organization_id', 'survey_id', 'week_start'], {
    name: 'idx_responses_org_survey_week',
    ifExists: true,
  });
  pgm.dropIndex('users', ['organization_id'], {
    name: 'idx_users_organization_id',
    ifExists: true,
  });
}
