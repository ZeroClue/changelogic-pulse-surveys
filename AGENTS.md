# AGENTS.md

Instructions for AI agents working in this repo. The files in `.opencode/agents/` are the machine-readable versions of these rules; keep both in sync.

## Project constraints

- Stack: TypeScript end to end. NestJS backend (`backend/`, port 3001, prefix `/api`), React + Vite frontend (`frontend/`, dev port 5173), PostgreSQL 16 via `docker-compose.yml`.
- Tenancy: Postgres row-level security is the enforcement boundary. Every tenant table carries `organization_id`; policies are per-command, `TO pulse_app`, and use the fail-closed predicate `organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid`. Tenant context is always `SET LOCAL` inside the request transaction (TenancyService); never session-level `SET`, never outside a transaction.
- Roles: `pulse_owner` owns tables and runs migrations; `pulse_app` is the runtime role with `SELECT` + `INSERT` only (`UPDATE`/`DELETE` revoked by design). The two `SECURITY DEFINER` helpers are the only context-free reads.
- Week semantics: "this week" is the calendar week, Monday 00:00:00 through Sunday 23:59:59.999, server timezone. The server computes and stores `week_start`; one response per member per calendar week per survey (unique constraint).
- Auth: demo-only header auth (`X-User-Id`, optional `X-Org-Id` must match the user's org). The server derives org and role from the database. Never treat this as production auth.
- Seeds: deterministic fixture UUIDs in `backend/src/seed/seed-fixtures.ts`; seeding is idempotent and must stay that way.
- TypeScript strict everywhere (`strict: true` plus unused-code checks); no `any`; DTO validation with class-validator.
- Secrets: never read, print, or commit `.env` or `.env.*`. Only `.env.example` is permitted.
- Commits: conventional-commit style, small, and never squashed; history shows progression.
- Spec before code: `SPEC.md` is authoritative. Commit spec changes on their own when the plan changes, and keep code aligned with it.

## Agent roster

| Agent | File | Model | Responsibility |
|---|---|---|---|
| orchestrator (primary) | `.opencode/agents/orchestrator.md` | `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | Plans the slice, delegates tasks, triages review findings, runs validation, makes all commits |
| backend-agent | `.opencode/agents/backend-agent.md` | `openrouter/deepseek/deepseek-v4-flash-0731:free` | NestJS/Postgres implementation: schema, migrations, RLS, guards, seeding |
| frontend-agent | `.opencode/agents/frontend-agent.md` | `openrouter/deepseek/deepseek-v4-flash-0731:free` | React UI per SPEC §6, header auth wiring, the two-tab demo |
| reviewer-agent | `.opencode/agents/reviewer-agent.md` | `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free` | Strict structured review with severities, file:line evidence, and a verdict |
| documenter-agent | `.opencode/agents/documenter-agent.md` | `openrouter/deepseek/deepseek-v4-flash-0731:free` | README.md, SOLUTION.md, AGENTS.md, ai-logs/; applies the humanizer skill to all prose |

## Review gates

- A reviewer-agent pass is required before any feature-complete commit.
- Use the `code-review` skill for RLS policies, guards, and tenancy-scoping changes specifically.
- Reviewer reports are reports, not patches: findings get dispositions (fixed, rejected with a reason, or accepted as a documented residual), never silent edits.
- The orchestrator independently re-runs key checks before committing; it does not trust a subagent's "done" claim.
- Reviewer verdicts and finding dispositions are recorded in `docs/reviews/`.

## Validation checklist

Run from `backend/` unless noted. All must pass before reporting a task complete.

```
npm run build
npx tsc --noEmit
npx eslint "{src,apps,libs,test}/**/*.ts"    # no --fix; the lint script mutates files
npm test
docker compose up -d                          # repo root; e2e prerequisite
MIGRATION_DATABASE_URL=postgres://pulse_owner:pulse_owner@localhost:5432/pulse npm run migration:run
MIGRATION_DATABASE_URL=... npm run migration:run   # second run: "No migrations to run!"
DATABASE_URL=postgres://pulse_app:pulse_app@localhost:5432/pulse npm run seed
DATABASE_URL=... npm run seed                 # second run must stay clean
npm run test:e2e
```

Fail-closed probe (psql as `pulse_app`, on a connection that has already served one `SET LOCAL` transaction):

```sql
BEGIN; SET LOCAL app.current_organization_id = '<org-uuid>'; SELECT count(*) FROM surveys; COMMIT;
SELECT count(*) FROM surveys;   -- warm connection, no context: 0 rows, no error
```

Frontend (from `frontend/`):

```
npm run lint
npm run build
```

If you started Docker for probes, tear it down with `docker compose down -v` and leave the working tree clean.
