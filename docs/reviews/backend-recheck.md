# Backend Scaffold Review — Recheck

- **Date:** 2026-09-19
- **Scope:** Resolution verification of the 25 findings in `docs/reviews/backend-scaffold.md` (verdict `request-changes` against commit `3ecb903`) against the current code at commits **b6684fa** (`feat(backend): implement responses & summary + fix RLS + hardening`) and **a7720ce** (`fix(backend): demo users + cors` — backend aspects plus the frontend's consumption of the new `organizationId` field). Plus a regression scan of the two fix commits.
- **Reviewer:** reviewer-agent (strict senior code review per `.opencode/agents/reviewer-agent.md` + `code-review` skill)
- **Method:** Every finding re-verified in the current source with `file:line` evidence, then re-proven live: full build/typecheck/lint/unit-test pass, Docker Postgres 16 + migrations ×2 + seed ×2, e2e suite, direct psql probes as `pulse_owner`/`pulse_app` (policies, grants, ACLs, indexes, warm-connection fail-closed, privilege denials), a 004 down/up migration cycle, and an HTTP smoke run against the built API (started in background, killed by PID). `.env` files never read; `docker compose down -v` teardown after all probes; working tree left clean.

## Verdict

**approve-with-comments**

No blockers. 24 of 25 findings resolved; 1 partially resolved (E-1: the requested concurrent-seed test was not added, leaving a theoretical transient-failure path untested — minor, demo-scale). Regression scan found no new major issues; four nit-level comments below.

## Disposition table

| ID | Finding (original severity) | Disposition | Evidence |
|---|---|---|---|
| B-1 | Member submission endpoint 501 stub (blocker) | **resolved** | Implemented: `backend/src/surveys/surveys.controller.ts:44-52` → `backend/src/responses/responses.service.ts:39-119` (org+active validation, duplicate pre-check, 23505→409 race mapping, per-question type validation, one tenant tx, server-computed `week_start`). Proven live: e2e 23/23; curl 201 then 409; cross-org 404. |
| B-2 | Manager summary endpoint 501 stub (blocker) | **resolved** | Implemented: `backend/src/summaries/summaries.service.ts:49-102` (completion count/rate, per-question rollups, `?week` resolution, org member-count denominator, divide-by-zero guard). e2e math assertions pass (`test/app.e2e-spec.ts:497-605`). |
| S-1 | RLS predicate breaks on warm pooled connections (`''::uuid` throws) (major) | **resolved** | Migration 003 rewrites both USING and WITH CHECK with the NULLIF form (`backend/src/migrations/003_rls_hardening.ts:16-17,53-62`). Live probe as `pulse_app`: after a `SET LOCAL` tx commits, GUC returns `''` and context-less `SELECT count(*)` on `surveys`/`users` returns 0 rows, no error. Pinned by e2e warm-connection regression (`test/app.e2e-spec.ts:162-199`). SPEC §2 updated to document both NULL and `''`. |
| A-1 | Tenant helpers fall back to shared pool outside tenant tx (major) | **resolved** | Pool fallback removed; every helper requires the transactional `EntityManager` (`backend/src/questions/questions.service.ts:14`, `backend/src/answers/answers.service.ts:18`, `backend/src/organizations/organizations.service.ts:12`); compiler-enforced. |
| A-2 | No request-scoped transaction; `withTenantTx` cannot nest (major) | **resolved** | `backend/src/common/tenancy/tenancy.service.ts:35-63`: AsyncLocalStorage runtime; nested same-org `run()` joins the active tx, different-org throws, `requireManager()` throws outside a context; `with-tenant-tx.ts` deleted. Deviates from SPEC §2's "interceptor" letter but satisfies the review's prescribed alternative and the stated mechanism (one tx per request; submission flow atomic — proven by the concurrent double-submit e2e `[201,409]`). |
| Q-1 | Four dead services/modules (minor) | **resolved** | All four services now have production consumers (surveys/responses/summaries); no dead exports. Unused `forFeature` registrations removed (`backend/src/users/users.module.ts`, `backend/src/organizations/organizations.module.ts` — see N-6). |
| S-2 | `SubmitResponseDto`: unbounded/duplicated/"no-value" answers (minor) | **resolved** | `@ArrayNotEmpty @ArrayMaxSize(3)`, `ExactlyOneAnswerValueConstraint`, `UniqueQuestionIdsConstraint` (`backend/src/surveys/dto/submit-response.dto.ts:80-89,24-61`) + service-level duplicate rejection (`responses.service.ts:175-185`). e2e 400-matrix passes. |
| S-3 | `pulse_app` UPDATE/DELETE + ALL-command policy → intra-org escalation (minor) | **resolved** | Per-command `tenant_select`/`tenant_insert` policies `TO pulse_app` (verified in `pg_policies`: 10 rows, NULLIF predicate); UPDATE/DELETE revoked on all tables (live: `UPDATE users SET role=…`, `UPDATE surveys …`, `DELETE FROM responses` all → `permission denied`); `pgmigrations` grants = 0. |
| S-4 | `?week` accepted with zero validation (minor) | **resolved** | `backend/src/summaries/dto/summary-query.dto.ts:12-30` (real-date + Monday check via `parseMondayWeekParam`, `backend/src/common/weeks.ts:33-51`) → 400; e2e covers `garbage`, non-Monday, `2024-02-30`, unpadded. |
| P-1 | Missing org-leading indexes (minor) | **resolved** | `003_rls_hardening.ts:29-43`; verified in `pg_indexes`: `idx_users_organization_id`, `idx_responses_org_survey_week (organization_id, survey_id, week_start)`, `idx_answers_org_response (organization_id, response_id)`. |
| S-5 | No `ALTER DEFAULT PRIVILEGES` (minor) | **resolved** | `003_rls_hardening.ts:77-79`; verified in `pg_default_acl` (`pulse_app=ar` on tables for `pulse_owner`). Function default privileges intentionally not added — new functions get explicit grants in 003/004 instead (noted below; the finding's table-visibility risk is closed). |
| E-1 | Seed public/ungated; idempotency drift holes; no concurrent-seed test (minor) | **partially resolved** | (1) Production gating done: 403 when `NODE_ENV=production` (`backend/src/seed/seed.controller.ts:18-21`). (2) Idempotency rewritten to INSERT … ON CONFLICT DO NOTHING + read-back by id-or-email (`seed.service.ts:240-287`) — accepted per the intentional disposition (UPDATE was revoked by S-3); seed ×2 clean live. (3) The requested concurrent-seed test was **not** added (only sequential double-seed, `test/app.e2e-spec.ts:608-621`); see regression note R-3. |
| A-3 | HTTP exception from tenancy/DB layer (minor) | **resolved** | `backend/src/common/tenancy/set-tenant-context.ts:19-24` throws plain `Error`, rationale documented. |
| A-4 | API surface split across two controllers (minor) | **resolved** | `backend/src/summaries/summaries.controller.ts` deleted; all `/surveys/*` routes in one controller (`surveys.controller.ts:22-35`); route-mapping log confirms a single `SurveysController {/api/surveys}`. |
| Q-2 | TypeScript strictness partial (minor) | **resolved** | `backend/tsconfig.json:19-24`: `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`; `tsc --noEmit` clean. (`noUncheckedIndexedAccess` remains off — outside the prescribed fix; code consistently uses `rows[0]?.x`.) |
| N-1 | Split imports from same module (nit) | **resolved** | Merged in all five entities (e.g. `backend/src/entities/user.entity.ts:1-8`; diff-verified). |
| N-2 | Inline enum literals duplicate constants (nit) | **resolved** | `user.entity.ts:32` uses `[...ORGANIZATION_ROLES]`, `question.entity.ts:39` uses `[...QUESTION_TYPES]`. |
| N-3 | Bootstrap failures silent (nit) | **resolved** | `backend/src/main.ts:12-20`: `.catch` → `logger.error` + `process.exit(1)`. |
| N-4 | X-Org-Id: no validation, case-sensitive, raw in logs (nit) | **resolved** | `backend/src/common/guards/user.guard.ts:49-71`: trim + `isUUID`, case-insensitive compare (both sides lowercased), raw value never logged; duplicate-header still fails closed. (`class-validator.isUUID` verified case-insensitive.) |
| N-5 | Definer helpers/grants hardening leftovers (nit) | **resolved** | `list_demo_users` LIMIT 100 (`003_rls_hardening.ts:102`, `004_demo_users_org_id.ts:40`); blanket `GRANT EXECUTE ON ALL FUNCTIONS` replaced by explicit grants, PUBLIC revoked — `proacl` shows only `pulse_owner` + `pulse_app` for both helpers; policies `TO pulse_app`. |
| N-6 | Unused repository registration (nit) | **resolved** | `users.module.ts` and `organizations.module.ts` no longer call `forFeature`; entity metadata registered where actually used (`seed.module.ts`). |
| N-7 | CORS origin hardcoded (nit) | **resolved** | `backend/src/app-setup.ts:6,14-20,31-33`: `WEB_ORIGIN` comma-list with 5173/4173 defaults (documented in `.env.example`). Live: ACAO echoed for 5173 and 4173, absent for an arbitrary origin. |
| N-8 | `completionCount` semantics ambiguous (nit) | **resolved** | Survey-scoped reading implemented (`summaries.service.ts:168-187`, `survey-summary.dto.ts:27-32`) and SPEC §5 updated to record the decision (b6684fa). |
| N-9 | Per-request auth lookup uncached (nit) | **resolved (accepted with comment)** | `backend/src/common/guards/user.guard.ts:24-26` NOTE documents the uncached lookup as the first caching candidate — per the accepted disposition. |
| N-10 | `questions.organization_id` vs SPEC §1 (nit) | **resolved** | SPEC §1 questions table now documents `organization_id` (SPEC.md:51, added in b6684fa); explanatory comment retained in `001_init.ts:74-82`. |

**Totals:** 24 resolved · 1 partially resolved (E-1) · 0 open.

## Regression scan (diff 3ecb903..HEAD, backend + frontend organizationId consumption)

Reviewed dimensions and results:

- **AsyncLocalStorage TenancyService — no issues found.** Nesting correct (same-org nested `run()` joins the active tx, `tenancy.service.ts:39-47`); a different-org nested call throws instead of silently opening a second tx; ALS store is scoped to the `run` callback subtree and dies with the async chain (no cross-request leakage possible by construction); `SET LOCAL` is tx-scoped — verified live on a warm pooled connection (GUC `''` after commit, 0 rows, no error). `TenancyModule` is `@Global` (one shared ALS instance app-wide). The one deliberate raw `dataSource.transaction` with mid-tx `SET LOCAL` (seed) is documented and leaves the connection fail-closed (policy probes confirm).
- **Per-command RLS — no legitimate access denied.** Runtime paths need only INSERT+SELECT (seed is insert-or-fetch, never UPDATE; e2e cleanup deliberately uses the owner role, documented at `test/app.e2e-spec.ts:24-26`); SELECT on `organizations` (tenant root, not RLS-enabled per SPEC §2) retained for seed read-back. All denial probes behaved as designed.
- **Migration 004 — function ACLs and down-migration verified live.** After DROP+CREATE the 004 `up` re-applies REVOKE-from-PUBLIC / GRANT-to-`pulse_app` (proacl confirmed, `has_function_privilege('public',…)=f`). `migration:revert` restores the exact 003 shape (4 columns, DEFINER, `search_path=public`, owner `pulse_owner`, ACLs re-applied, `pgmigrations` row removed); re-running `up` restores the 5-column shape. 003's `down` statically reviewed: faithfully restores the pre-003 (002-form) policy and blanket grants — including the `pgmigrations` grant, which is correct-as-revert, not a hardening regression (see R-4).
- **Seed insert-or-fetch under fixture drift — acceptable.** Id-drift-with-same-email and email-drift-with-same-id both degrade to "existing row wins" (no 23505 escape); unresolvable rows are a hard error inside the tx (500 on the public route only in genuine drift, not on re-runs). Residual: concurrency untested → R-3.
- **409-before-validation UX — behavior defensible, comment overstates → R-1 (nit).**
- **CORS comma-list parsing — correct.** Trim + empty-filter + non-empty default; `WEB_ORIGIN=` or blank segments fall back to defaults; exact-match echo verified for both configured origins, arbitrary origin gets no ACAO header. No credentials flag is set, so list-echo is safe.
- **Frontend `organizationId` consumption (a7720ce) — no issues.** `Login.tsx` no longer calls the dev-only `POST /api/seed` to learn org ids; `GET /api/users` supplies `organizationId`, guarded by a `typeof === 'string' && !== ''` fallback that degrades to X-User-Id-only against an older backend; `client.ts` sends `X-Org-Id` only when the session carries it, and the backend guard still validates it against the DB-derived org (403 on mismatch), so the header remains non-trusted.

New findings (none above nit/minor; no blockers or majors):

- **R-1 (nit) — comment overstates the 409-precedence boundary.** `backend/src/responses/responses.service.ts:58-61` claims "ANY second submission this week → 409 … regardless of the body shape", but the global `ValidationPipe` rejects DTO-invalid bodies (both/neither value, rating out of range, empty answers, duplicate questionIds, malformed `questionId`) with 400 *before* the service's duplicate check; only the service-level payload checks (unknown/missing/wrong-type question) sit behind it. The behavior itself is reasonable — a DTO-invalid request is not a submission attempt — but the comment misdocuments the contract. Fix: reword the comment (or move duplicate detection ahead of the pipe via an interceptor if 409-for-any-shape is truly required).
- **R-2 (nit) — invalid `week` maps to 404 in the service.** `backend/src/summaries/summaries.service.ts:56-60` throws `NotFoundException('Invalid week parameter')` for a non-Monday/invalid `week`. Unreachable over HTTP (the DTO 400s first), but a direct caller gets a misleading status. Fix: throw `BadRequestException` or drop the branch in favor of the DTO as the single guard.
- **R-3 (minor, residual of E-1) — concurrent seeding untested.** Two simultaneous `POST /api/seed` runs serialize per-row on unique-index waits, and Postgres may elect a deadlock victim under opposite per-org interleaving (one transient 500); no test pins concurrent-seed behavior (the original E-1 fix asked for one). Self-healing on retry; demo-scale risk. Fix: add a `Promise.all` double-seed e2e asserting both 201 (and, if it ever flakes, add a single retry around `seed()`).
- **R-4 (nit, informational) — `003_rls_hardening.ts:136-141` (down) re-grants `SELECT, INSERT, UPDATE, DELETE ON ALL TABLES` to `pulse_app`, which re-extends to `pgmigrations`.** Faithful to the pre-003 state and therefore correct as a down migration — flagged only so the post-revert state is not mistaken for the hardened one. The full-revert end state also differs cosmetically from true pre-003 (PUBLIC EXECUTE not re-granted), moot since `002.down` then drops both functions.

## Verification log

All commands re-run independently for this report (not trusted from the original review):

| Check | Command | Outcome |
|---|---|---|
| Build | `npm run build` (backend/) | clean, exit 0 |
| Typecheck | `npx tsc --noEmit` | clean, exit 0 |
| Lint | `npx eslint "{src,apps,libs,test}/**/*.ts"` (run **without** `--fix` to avoid mutating the tree; the `npm run lint` script carries `--fix`) | 0 problems |
| Unit tests | `npm test` | 5 suites, 35/35 passed |
| Docker | `docker compose up -d` (repo root) | postgres:16-alpine up; `pg_isready` confirmed |
| Migrations ×2 | `MIGRATION_DATABASE_URL=postgres://pulse_owner:pulse_owner@localhost:5432/pulse npm run migration:run` (inline env from `.env.example` placeholders; `.env` never read) | 001–004 applied; second run "No migrations to run!" (idempotent) |
| Seed ×2 | `DATABASE_URL=postgres://pulse_app:pulse_app@localhost:5432/pulse npm run seed` ×2 | both clean (insert path, then insert-or-fetch path) |
| e2e | `npm run test:e2e` (before any teardown) | 1 suite, 23/23 passed — includes S-1 warm-connection regression, concurrent double-submit `[201,409]`, 400-matrix, summary math, seed idempotency |
| Policies | `pg_policies` probe | 10 rows: 5 tables × `tenant_select`(SELECT, qual NULLIF) + `tenant_insert`(INSERT, with_check NULLIF), `roles = {pulse_app}` |
| Grants | `information_schema.role_table_grants` | `pulse_app` = INSERT,SELECT on the 5 tenant tables + `organizations`; **0 grants on `pgmigrations`** |
| Functions | `pg_proc` / `proacl` / privilege probes | both helpers `prosecdef=t`, `proconfig={search_path=public}`, owner `pulse_owner`; EXECUTE only `pulse_owner`+`pulse_app` (PUBLIC revoked); `list_demo_users()` returns `organization_id` (004 shape) |
| Default ACLs | `pg_default_acl` | `pulse_owner`→tables→`pulse_app=ar` present |
| Indexes | `pg_indexes` | `idx_users_organization_id`, `idx_responses_org_survey_week`, `idx_answers_org_response` present, org-leading |
| Warm-connection fail-closed | psql as `pulse_app`: `BEGIN; SET LOCAL app.current_organization_id='<orgA>'; SELECT…; COMMIT;` then context-less `SELECT count(*)` | GUC returns `''`; surveys=0, users=0 rows, **no error** (fail-closed by design, S-1) |
| Privilege denials | psql as `pulse_app` | `UPDATE users SET role='manager'` → permission denied; `UPDATE surveys SET is_active=false` → denied; `DELETE FROM responses` → denied; INSERT without tenant context → RLS WITH CHECK violation; `INSERT INTO pgmigrations` → denied |
| 004 down/up | `npm run migration:revert` → probe → `npm run migration:run` → probe | down restores 4-column 003 shape with ACLs re-applied and migration row removed; up restores 5-column shape, `public_exec=f` |
| HTTP smoke | `DATABASE_URL=… PORT=3001 node dist/main.js` in background, **PID 184084, killed by PID after probes** | `GET /api/users` → 4 rows each with `organizationId`; CORS: ACAO echoed for Origin 5173 and 4173, **absent** for `http://evil.example`; member POST responses → **201** with server-computed `weekStart=2026-09-14` (Monday of the current week); duplicate → **409**; member GET summary → **403**; org-B member POST to org-A survey → **404** |
| Teardown | `docker compose down -v` (run after e2e and again after the 004 down/up probe) | network + volume removed; `git status` shows no tracked modifications |

## Out-of-scope notes

- **Frontend deep-dive:** a7720ce's frontend changes were assessed only for their consumption of the new `organizationId` field (diff-level); component behavior, styling, and the rest of `frontend/src` were not reviewed.
- **Load/performance:** ALS + per-request transaction cost under concurrency, pool sizing, and index effectiveness at scale were not measured.
- **Browser UI behavior:** the §6 UI walk-through (login dropdown, member/manager flows, isolation demo) was not exercised in a browser; verified at HTTP level only.
- **README/SOLUTION.md consistency** and CI setup were not audited (backend recheck scope only).
- The e2e suite's Docker probes remain point-in-time for this report; they are automated in `test/app.e2e-spec.ts` but not wired into CI.
