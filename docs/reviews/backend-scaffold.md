# Backend Scaffold Review

- **Date:** 2026-09-18
- **Scope:** `backend/src/**` — entities, common (guards, tenancy, decorators, naming strategy), modules (organizations, users, surveys, questions, responses, answers, summaries, seed), DTOs, migrations (`001_init`, `002_rls`). Config files (package.json, tsconfig*, nest-cli.json, test/, docker-compose.yml, docker/postgres-init/01-roles.sql, .env.example) reviewed as context.
- **Commit under review:** `3ecb903` — `feat(backend): project scaffold`
- **Reviewer:** reviewer-agent (strict senior code review per `.opencode/agents/reviewer-agent.md` + `code-review` skill)
- **Reference spec:** `SPEC.md` (committed before implementation)

## Verdict

**request-changes**

Blockers: B-1, B-2 — the two SPEC §5 core endpoints (`POST /surveys/:surveyId/responses`, `GET /surveys/:surveyId/summary`) are 501 stubs, so the SPEC §7 validation plan cannot pass against this commit.

## Summary

The scaffold is well-organized for a NestJS + TypeORM codebase: module boundaries are clean, guard ordering is correct, DTOs use class-validator, and the hand-written migrations match the entities closely. The RLS foundation is genuinely fail-closed for inserts and for reads on fresh sessions, and the two SECURITY DEFINER helpers are parameterized, owner-pinned, and `search_path`-hardened — all verified live against Postgres 16. However, the two endpoints that carry the product (member submission, manager summary) are deliberate `NotImplementedException` stubs, so the commit cannot satisfy SPEC §5/§7 on its own. More importantly, the live RLS probe surfaced a real defect the spec's fail-closed claim depends on: after any `SET LOCAL` transaction commits on a pooled connection, `current_setting(..., true)` returns `''` (not NULL), so the policy's `::uuid` cast throws instead of yielding zero rows — fail-closed in effect, but by error, and the SPEC §7 SQL probe as written will fail on warm connections. Finally, four tenant service helpers are dead code whose pool-fallback design encourages exactly the "query outside `withTenantTx`" misuse the RLS model cannot tolerate.

## Findings

### Blocker

**B-1 — Member submission endpoint is a 501 stub (SPEC §5/§7 unmet)**
`backend/src/surveys/surveys.service.ts:58-72` (route: `surveys.controller.ts:27-35`)
`submitResponse` throws `NotImplementedException`. SPEC §5 requires: org/active-survey validation, question-belongs-to-survey, value-type match, rating ∈ 1–5, `409` on second weekly submission, and persistence of response + answers in one tenant transaction with server-computed `week_start`. None of this exists; the DTO (`submit-response.dto.ts`) is wired but nothing consumes it. The end-to-end member flow and the §7 e2e matrix (happy path, 409, cross-org 404) are impossible against this commit.
**Fix:** implement in the next commit per the inline TODO — but until then this commit cannot be considered spec-complete; merge only behind an explicit scaffold milestone.

**B-2 — Manager summary endpoint is a 501 stub (SPEC §5/§7 unmet)**
`backend/src/summaries/summaries.service.ts:20-31` (route: `summaries.controller.ts:13-21`)
`getSummary` throws `NotImplementedException`. Completion count/rate, per-question rollups, `?week=` resolution (Monday default, `date_trunc` Monday semantics), and member-count denominator are all deferred. Manager-only role wiring is live but returns 501 for managers.
**Fix:** same as B-1 — implement, including the `week` validation missing at the controller (see S-4).

### Major

**S-1 — RLS fail-closed predicate breaks on warm pooled connections: `''::uuid` cast error instead of zero rows**
`backend/src/migrations/002_rls.ts:3-4` (predicate used in both USING and WITH CHECK, lines 19–25)
Verified live: on a fresh session, `current_setting('app.current_organization_id', true)` is NULL → predicate NULL → 0 rows (fail-closed, correct). But after a transaction that executed `SET LOCAL app.current_organization_id = '...'` commits — i.e., **every pooled connection that has served one tenant request** — Postgres keeps the custom GUC "defined" with an empty string, and `current_setting(..., true)` returns `''`, not NULL. A subsequent context-less query on an RLS table then fails with `ERROR: invalid input syntax for type uuid: ""` (a 500) instead of returning zero rows. Consequences: (a) the SPEC §7 fail-closed SQL probe ("unset → zero rows") only holds on never-used sessions and will ERROR on any reused connection; (b) SPEC §2's stated invariant ("predicate is NULL → zero rows") is factually wrong after first use; (c) any current or future query path that touches an RLS table outside `withTenantTx` (the fallback paths of the helper services, ad-hoc scripts, e2e probes) produces an opaque 500 on warm connections. Today no data leaks (the error is still fail-closed), but the behavior diverges from the documented security model and from what tests will assert.
**Fix:** make the predicate tolerant of both NULL and `''`:
`organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid`
in both USING and WITH CHECK of `002_rls.ts` (and any future policies). Add a warm-session fail-closed regression probe to the test suite.

**A-1 — Tenant service helpers default to running on the shared pool outside any tenant transaction**
`backend/src/questions/questions.service.ts:14-22`, `backend/src/responses/responses.service.ts:13-22`, `backend/src/answers/answers.service.ts:13-16`, `backend/src/organizations/organizations.service.ts:13-15`
Each wraps a bare repository and falls back to the pool connection when no `EntityManager` is passed (`questions.service.ts:15-17`); the others document "call inside withTenantTx" as a comment-level contract (`responses.service.ts:13`, `answers.service.ts:13`). This is exactly the "query outside a SET LOCAL transaction" failure mode the tenancy model forbids: the compiler cannot enforce it, RLS silently returns 0 rows (fresh connection) or a 500 (warm connection, per S-1), and defense-in-depth org filters are absent from these helpers. As written, the first consumer that forgets `withTenantTx` gets wrong-but-plausible results (empty lists) with no error.
**Fix:** remove the pool fallback — require an `EntityManager` parameter so tenant-tx usage is compiler-enforced, or delete these services until the implementing commit actually needs them (see Q-1).

**A-2 — No request-scoped transaction; `withTenantTx` per service call cannot nest, breaking SPEC §2's stated mechanism and future atomicity**
`backend/src/common/tenancy/with-tenant-tx.ts:26-35`; `backend/src/surveys/surveys.service.ts:23`
SPEC §2 specifies "a transaction interceptor opens one transaction per request and executes `SET LOCAL` before queries". The implementation instead opens one transaction per service call. TypeORM's `dataSource.transaction` does not nest: a service method that calls another tenant-scoped service inside `withTenantTx` gets a **second connection from the pool with its own independent transaction and tenant context** — not a joined transaction. For the upcoming submission flow this matters concretely: the duplicate-check → insert → answers-write sequence (SPEC §5, and the 409 race in Edge cases below) is only correct if all steps share one transaction; nothing in the current structure guarantees that, and composable services (A-1/Q-1) invite splitting it.
**Fix:** implement the request-scoped transaction (interceptor + AsyncLocalStorage/CLS) as per spec, or mandate that `withTenantTx` is the single entry point and all tenant services accept `EntityManager` only.

### Minor

**Q-1 — Dead code: four services (and their modules' wiring) are exported but never used**
`backend/src/questions/questions.service.ts:7`, `backend/src/responses/responses.service.ts:7`, `backend/src/answers/answers.service.ts:7`, `backend/src/organizations/organizations.service.ts:7`
Grep confirms no consumer anywhere in `src` (surveys/summaries/seed all do their own queries). `UsersModule` also registers `TypeOrmModule.forFeature([User])` that its service never uses (`users.module.ts:8`). Dead exports are not just noise — combined with A-1 they are an attractive, unsafe shortcut for the next commit.
**Fix:** delete until needed, or land them together with their first consumer.

**S-2 — `SubmitResponseDto` allows unbounded `answers`, duplicates, and "no value" entries**
`backend/src/surveys/dto/submit-response.dto.ts:14-36`
No `@ArrayMaxSize` (a client can post thousands of nested entries), no per-item enforcement of "exactly one of `ratingValue`/`boolValue`" (both/neither passes DTO validation), and no duplicate-`questionId` rejection. The cross-field rules are admittedly app-layer per SPEC §1, but the size/duplication gaps are DTO-level and should be closed now while the contract is being set (the endpoint is a stub, so this is the moment).
**Fix:** `@ArrayMaxSize(3)` (questions are capped at 3), add a class-validator custom validator enforcing exactly-one-value, and reject duplicate questionIds in the service (or via a validated set).

**S-3 — `pulse_app` holds UPDATE/DELETE on all tables and the single ALL-commands policy permits intra-org privilege escalation**
`backend/src/migrations/002_rls.ts:70-74` (grants), `:21-25` (policy, verified `cmd = ALL`, `roles = {public}` in `pg_policies`)
RLS is tenant-scoped only: any SQL executed by the runtime role can update any row of its own org — including `users.role` (member → manager), `surveys.is_active`, or delete responses. No endpoint does this today, but the surface is one forgotten raw query away from a self-service promotion, and nothing needs DELETE at all (only seed upserts need INSERT+UPDATE).
**Fix:** `GRANT SELECT, INSERT, UPDATE` (drop DELETE) to `pulse_app`; consider splitting the policy per command or adding `TO pulse_app` and restricting sensitive columns via column-level grants when real write paths appear.

**S-4 — `?week` query parameter accepted with zero validation at the boundary**
`backend/src/summaries/summaries.controller.ts:15-21`
Raw `@Query('week')` string flows into the service (currently ignored by the stub). When implemented, an unvalidated `week` (`'2026-09-14; --'`, `'not-a-date'`, a non-Monday date) becomes the service's problem. SPEC §3 requires `YYYY-MM-DD`, Monday.
**Fix:** validate now at the controller: `@IsDateString()` / `^\d{4}-\d{2}-\d{2}$` plus an explicit Monday check, so the next commit inherits a guarded contract.

**P-1 — Missing indexes the summary/auth paths will scan on**
`backend/src/migrations/001_init.ts:18-38` (users), `:103-142` (responses)
No index on `users(organization_id)` — the org member-count query (summary denominator) and any per-org user lookups are seq scans. `responses` lacks an `organization_id`-leading index even though every RLS-filtered query predicates on it (the existing `idx_responses_survey_week` helps only survey-scoped probes). `answers(organization_id)` likewise absent. Trivial at seed scale; the SPEC's "index-friendly" claim (§3) is only half-realized.
**Fix:** add `idx_users_organization_id`, `idx_responses_organization_week (organization_id, week_start)`, `idx_answers_organization` in the next migration.

**S-5 — No `ALTER DEFAULT PRIVILEGES`; future tables start invisible to `pulse_app`**
`backend/src/migrations/002_rls.ts:70-74`
`GRANT ... ON ALL TABLES` covers only tables existing at migration time. The next migration that creates a table (or the RLS re-runs) must remember to re-grant, or `pulse_app` gets permission-denied at runtime — an easy production incident.
**Fix:** add `ALTER DEFAULT PRIVILEGES FOR ROLE pulse_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE ON TABLES TO pulse_app;` (and for functions).

**E-1 — Seed endpoint: public, unauthenticated, and idempotency has fixture-evolution holes**
`backend/src/seed/seed.controller.ts:11-15`, `backend/src/seed/seed.service.ts:150-159`
(1) POST /api/seed is public by SPEC §5, but nothing gates it by environment — in any exposed deployment any client can rewrite fixtures. (2) Upserts conflict on `id` only (`seed.service.ts:156-158`): if a future fixture changes a user's id while keeping its email (or vice versa), the `users.email` UNIQUE constraint raises an unhandled error → 500 on a public route, and the whole seed transaction rolls back. (3) Two concurrent seeds serialize on row locks (verified conceptually; deterministic ids make this safe today), but there is no test pinning that behavior.
**Fix:** gate the controller behind `NODE_ENV !== 'production'` (or an env flag); add a conflict fallback (catch 23505 → fetch/re-map) or document that fixture ids are immutable; add a concurrent-seed test.

**A-3 — HTTP exception thrown from the tenancy/DB layer**
`backend/src/common/tenancy/with-tenant-tx.ts:13-18`
`setTenantContextSql` throws Nest's `BadRequestException` from a pure SQL-building helper. A caller inside `run-seed.ts` (CLI) or a future non-HTTP context gets an HTTP-shaped error; a genuinely invalid UUID reaching this function is a programming error, not a client error (the guard already UUID-validates the header, and org ids come from the DB).
**Fix:** throw a plain `Error` here; map to HTTP at the boundary if ever needed.

**A-4 — API surface split across two controllers sharing the `surveys` prefix in different modules**
`backend/src/summaries/summaries.controller.ts:8-13` vs `backend/src/surveys/surveys.controller.ts:16`
`GET /surveys/active` and `GET /surveys/:surveyId/summary` live in different modules. Legal in Nest, but route precedence now silently depends on module import order in `app.module.ts` (`surveys` before `summaries`); a future `GET /surveys/:id` route would collide with `active`. Cohesion argues for the summary route living with its resource family or an explicit ordering comment.
**Fix:** keep survey-resource routes in one controller, or document the ordering dependency in `app.module.ts`.

**Q-2 — TypeScript strictness is partial**
`backend/tsconfig.json:19-23`
`strictNullChecks` + `noImplicitAny` are on, but `strict: true` is not set, so `strictFunctionTypes`, `strictPropertyInitialization`, `useUnknownInCatchVariables`, `noImplicitThis`, and `alwaysStrict` are all off; `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` are absent too. Catch blocks get implicit `any` errors — relevant given the transaction-heavy code.
**Fix:** set `"strict": true` (entities already use `!:` so `strictPropertyInitialization` is moot) and enable the unused checks.

### Nit

**N-1 — Split imports from the same module**
`backend/src/entities/user.entity.ts:7-8` (`import {...} from 'typeorm'` then a second `import { JoinColumn } from 'typeorm'`); same pattern in `survey.entity.ts:8`, `question.entity.ts:2`, `response.entity.ts:8`, `answer.entity.ts:2`. Merge into one import each.

**N-2 — Inline enum literals duplicate the exported constants**
`backend/src/entities/user.entity.ts:30` and `backend/src/entities/question.entity.ts:32-36` hardcode `['manager','member']` / `['rating','yes_no']` although `enums.ts:5-6` exports `QUESTION_TYPES`/`ORGANIZATION_ROLES` (currently unused). Drift risk between enum type, DB type, and entity metadata. Use the consts (TypeORM accepts readonly arrays) or delete the unused consts.

**N-3 — Bootstrap failures are silent**
`backend/src/main.ts:20` — `void bootstrap();` discards the promise; a port-bind or config failure relies on Node's default unhandled-rejection crash with no structured log or exit strategy. Add `.catch((err) => { logger.error(err); process.exit(1); })`.

**N-4 — X-Org-Id handling: no UUID validation, case-sensitive comparison, raw value in logs**
`backend/src/common/guards/user.guard.ts:56-67` — the header is compared without `isUUID`/trim normalization (an uppercase-but-valid UUID mismatches the lowercase DB value → 403); the raw client-controlled string is interpolated into the warn log (log-forging hardening; Node rejects control chars in header values, so low risk). Normalize with `.trim().toLowerCase()` and validate before logging/comparing. Note the duplicate-header (array) case fails closed (typeof check skips the trust path and the DB value is used) — acceptable, worth a comment.

**N-5 — Definer helpers and grants: minor hardening leftovers**
`backend/src/migrations/002_rls.ts:30-47` — `list_demo_users()` has no LIMIT (unbounded by design today; add one when users grow); `GRANT EXECUTE ON ALL FUNCTIONS` (line 74) is broader than needed and PUBLIC execute is not revoked; policies could carry `TO pulse_app` instead of the default `{public}`. Cosmetic for the demo, worth tightening before anything real.

**N-6 — Unused repository registration**
`backend/src/users/users.module.ts:8` — `forFeature([User])` registers a repository `UsersService` never injects (it uses `DataSource.query`). Harmless but misleading.

**N-7 — CORS origin hardcoded**
`backend/src/main.ts:5,10` — `http://localhost:5173` only. Correct for the demo; move to config before any non-local deployment, otherwise the web app silently breaks.

**N-8 — `completionCount` semantics ambiguous vs SPEC §5**
`backend/src/summaries/dto/survey-summary.dto.ts:26-27` — the DTO comment says "responses submitted in that week, org-wide"; SPEC §5 defines completionRate over "responses this week" for the survey's summary. With one-active-survey-per-org the numbers coincide, but pick one definition (survey-scoped is the safer reading of §5) before implementing.

**N-9 — Per-request auth lookup uncached**
`backend/src/common/guards/user.guard.ts:51` — every authenticated request pays one `get_user_for_auth` round-trip plus a `withTenantTx` transaction. Fine for the demo; note as the first caching candidate if the demo grows.

**N-10 — `questions.organization_id` deviates from SPEC §1's table listing (documented, but record the decision)**
`backend/src/migrations/001_init.ts:74-82` — SPEC §1's questions table omits `organization_id`, while §2's uniform-policy statement requires it. The migration adds it with an explanatory comment; reasonable resolution, but the SPEC itself should be corrected (or SOLUTION.md should record the reconciliation) so future readers don't "fix" it away.

## What was checked and verified

Commands run in `backend/` (all independently re-run, not trusted from the scaffold):

| Check | Command | Result |
|---|---|---|
| Build | `npm run build` | clean, no output |
| Typecheck | `npx tsc --noEmit` | clean |
| Unit tests | `npm test` | 1 suite, 4/4 passed (RolesGuard) |
| Lint | `npx eslint "src/**/*.ts"` | 0 problems |
| Migrations | `MIGRATION_DATABASE_URL=... npm run migration:run` against Docker Postgres 16 | both migrations applied; idempotent re-run ("No migrations to run!") — note my first probe omitted `-d` and failed; the committed script itself is correct |
| Seed idempotency | `DATABASE_URL=<pulse_app> npm run seed` ×2 | both clean (insert path, then update path, both under RLS WITH CHECK as `pulse_app`) |
| Fail-closed reads (fresh session) | psql as `pulse_app`, no context | 0 rows on surveys/users/answers; no error |
| Org scoping | `SET LOCAL` org A → 1 survey / 2 users / 3 questions; org B context → org A survey invisible (0) | correct |
| `SET LOCAL` cleanup | after COMMIT on a fresh session, `current_setting(..., true)` is NULL | correct — **but see S-1: on a session that previously ran a `SET LOCAL` tx, the same probe returns `''` and the `::uuid` cast errors** |
| Fail-closed inserts | INSERT with no context → `new row violates row-level security policy`; INSERT with wrong-org context → same (WITH CHECK) | correct |
| SECURITY DEFINER helpers | `list_demo_users()` → 4 rows and `get_user_for_auth(uuid)` → 1 row with no tenant context, including on a warm session; `pg_proc`: owner `pulse_owner`, `prosecdef = t`, `proconfig = {search_path=public}` | correct and hardened |
| Policies | `pg_policies`: `tenant_isolation` on all 5 tenant tables, `cmd = ALL`, permissive | as designed |
| Privileges | `pulse_app`: can INSERT into `organizations` (tenant root, no RLS — per SPEC §2), cannot CREATE in schema | as designed |
| Dead code | grep for `QuestionsService|ResponsesService|AnswersService|OrganizationsService` | only self/module references — no consumers |

Runtime RLS probe environment: `docker compose up -d` (Postgres 16-alpine), migrations + seed applied, probes via `psql` as `pulse_app`/`pulse_owner`; **torn down afterwards with `docker compose down -v`** (network + volume removed). `.env` files were never read or printed (only the committed `.env.example` template).

## Out-of-scope notes

- **Frontend** (`web/`) not part of this review.
- **Week-boundary runtime behavior** (Mon 00:00:00–Sun 23:59:59.999, year boundary, server-timezone vs Postgres `date_trunc` semantics, duplicate-submission race → 409 via 23505 mapping) is untestable against this commit because both consuming endpoints are stubs (B-1/B-2). It must be covered when those land — the S-1 fix above also changes what the week-window probe should assert on warm connections.
- **README/SOLUTION.md** consistency not audited (backend scope only).
- **Load/performance testing** (pool sizing vs `SET LOCAL` transaction cost under concurrency) not measured; only static analysis of the per-call transaction pattern (A-2).
- **Docker RLS probes were run once against this commit's migrations**; the results above are point-in-time for `3ecb903` and were not automated into the repo's test suite.
