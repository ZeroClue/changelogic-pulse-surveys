# SOLUTION

Design notes, production sketch, and the AI-workflow record for this take-home. `SPEC.md` is the product and security spec; `README.md` tells you how to run it. This file explains why it looks the way it does, what each choice costs, and how the work was actually done with AI agents.

## 1. Solution overview

The deliverable is a working multi-tenant pulse-survey slice: two organizations, each with a manager, a member, and one active weekly survey; members submit once per calendar week; managers read a weekly summary. NestJS + TypeORM + PostgreSQL 16 behind a Vite React frontend. Isolation is enforced by Postgres row-level security, with application-layer scoping as a second line of defense.

`SPEC.md` was written and committed (6983a17) before any implementation commit, and the code was reviewed against it line by line. Three choices were stated in the spec up front, per the assignment's request:

1. **Isolation: RLS keyed on `organization_id`, driven by `current_setting('app.current_organization_id')` with `SET LOCAL` per request transaction.** The predicate is fail-closed through `NULLIF(current_setting(..., true), '')::uuid`. The `NULLIF` half was not in the first draft of the spec; the first review found that a bare `::uuid` cast throws on warm pooled connections (details in section 4), and the spec was updated in b6684fa to document both the absent (`NULL`) and stale-empty-string (`''`) cases.
2. **"This week" means the calendar week, Monday 00:00:00 through Sunday 23:59:59.999, server timezone.** The server computes `week_start` (the Monday) on submission and stores it. The one-response-per-week rule is then a plain `UNIQUE (survey_id, respondent_id, week_start)` constraint, and summary filters are index lookups instead of date arithmetic.
3. **Auth is a demo header.** The client sends `X-User-Id`; the server resolves the user, their organization, and their role from the database and never trusts a client-sent org on its own (a mismatching `X-Org-Id` is a `403`). Spoofable by design; acceptable only because the assignment allows a local-friendly demo mechanism.

A fourth scoping decision: surveys are created only by seeding. The assignment allows this, and it kept the UI tight. The cost is stated in section 2.

## 2. Architecture and trade-offs

### Data model

Six tables: `organizations`, `users`, `surveys`, `questions`, `responses`, `answers`. Every tenant table (`users`, `surveys`, `questions`, `responses`, `answers`) carries `organization_id` so one uniform RLS predicate covers all of them; `organizations` itself is the ungoverned tenant root. Postgres CHECKs and unique indexes carry the invariants that the database can express (one active survey per org via a partial unique index, one response per member per week, rating bounds, exactly-one-value on answers); the value-type-matches-question-type rule spans two tables, so it lives in the application layer and is covered by e2e tests.

### Database roles and policies

Two roles. `pulse_owner` owns the tables and runs migrations and the seed's schema work; being the owner, it is not subject to the policies. `pulse_app` is the runtime role: non-owner, no `BYPASSRLS`, and after the hardening migration (003) it holds only `SELECT` and `INSERT` on the app tables. `UPDATE` and `DELETE` are revoked, so no runtime code path can rewrite `users.role`, flip `surveys.is_active`, or erase responses even if a bug wanted to.

Policies are per-command (`tenant_select` with `USING`, `tenant_insert` with `WITH CHECK`), declared `TO pulse_app`, and all use the same predicate:

```sql
organization_id = NULLIF(current_setting('app.current_organization_id', true), '')::uuid
```

`current_setting(..., true)` returns `NULL` when the setting was never set and `''` on a pooled connection that already served one committed `SET LOCAL` transaction. `NULLIF` maps both to `NULL`, the predicate becomes `NULL`, and Postgres yields zero rows and rejects writes. No tenant context means no access, on any connection state.

### SECURITY DEFINER helpers

Two context-free reads must work without a tenant context: the login list (`GET /api/users`) and the auth-time user lookup behind the guard. Under RLS, `pulse_app` with no context sees zero rows, which is exactly what the fail-closed design should do. Rather than poke holes in RLS, migration 002 created two `SECURITY DEFINER` functions owned by `pulse_owner`: `list_demo_users()` and `get_user_for_auth(uuid)`. They run with the owner's privileges, expose narrow column sets, pin `search_path` to `public` against search-path hijacking, and grant `EXECUTE` only to `pulse_app` and `pulse_owner` (PUBLIC revoked). Migration 004 widened `list_demo_users()` to include `organization_id` so the frontend no longer needs a second call to map org names to ids.

### Request-scoped tenancy

`TenancyService` wraps AsyncLocalStorage around one TypeORM transaction per request. `run(organizationId, fn)` opens the transaction, executes `SET LOCAL app.current_organization_id` before any query, and publishes the transactional `EntityManager` through the store. A nested `run()` for the same org joins the active transaction instead of opening a second connection (TypeORM transactions do not nest); a nested call for a different org throws, because silently running a second tenant context inside another tenant's transaction would be a correctness bug. `requireManager()` hands out the transactional `EntityManager` and throws outside an active context. Tenant services take that `EntityManager` as a parameter, so "query outside the tenant transaction" is a compile error, not a lint rule.

### Trade-offs

| Decision | Why | What it costs |
|---|---|---|
| RLS vs application-only scoping | The database refuses cross-org rows even when a query forgets its `WHERE`; the app layer can be wrong without a leak. | Every request pays one transaction plus a `SET LOCAL`; some reads need `SECURITY DEFINER` helpers; debugging happens at two layers; policies are raw SQL the ORM does not model. |
| Shared schema vs schema-per-tenant | One migration path, one set of policies, no catalog sprawl, trivial to add a tenant. | One bad policy exposes everyone at once; no per-tenant resource isolation or noisy-neighbor control; backups/restore are all-or-nothing. |
| Header auth vs real IdP | Zero external dependencies, the demo runs offline, and the isolation story stays the focus. | Trivially spoofable by design. In production this breaks immediately: anyone can impersonate anyone, audit logs attest to nothing, and `GET /users` becomes an enumeration endpoint. A real deployment needs OIDC/JWT with server-verified identity. |
| Seed-only surveys vs manager CRUD | The assignment allows it; it cut a whole CRUD surface (UI + API + validation) from the slice. | Half the product narrative is missing; managers cannot create or close surveys. The one-active-survey-per-org partial index does the heavy lifting; adding CRUD later is mostly application work since the RLS write path already exists. |
| Insert-or-fetch seed idempotency | Once `UPDATE` was revoked from `pulse_app` (hardening), classic upserts became impossible for the runtime role. Seeding now does `INSERT ... ON CONFLICT DO NOTHING` and reads the row back by id or email. | A fixture that changes a name while keeping an id silently keeps the old name (existing row wins). Unresolvable id/email drift is a hard error inside the seed transaction. Accepted at demo scale; documented in the recheck. |
| 409-before-validation precedence | For a repeat submission, the duplicate-week check runs before the service's per-question payload checks, so the common "already submitted this week" case gets the more meaningful `409`. | The boundary is subtle: DTO-shape violations still `400` through the global ValidationPipe before the service runs. A code comment overstated this; the reviewer's R-1 note records the exact contract. |
| Strict TypeScript everywhere | `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, no `any`. | More friction per change; a few `!:` assertions on entity columns. In return, converting tenant helpers to `EntityManager`-only signatures turned a class of runtime bugs into compile errors, which paid for itself immediately (see section 4). |

## 3. AWS production design (Task 3, design only)

No infrastructure was deployed for this take-home; this is the design I would build, and where each local choice lands in it.

**Compute and data.** The API containers run on App Runner or ECS Fargate (ECS if we want daemon sets, sidecars, or finer-grained capacity control; App Runner if the team is small and the API is a plain HTTP service). The frontend builds to static assets on S3 behind CloudFront; there is no server-side rendering to host. PostgreSQL runs on RDS, multi-AZ, in private subnets, reachable only from the API tier's security group. Applications connect with IAM database authentication; the master password and any remaining secrets live in Secrets Manager. The `pulse_owner` / `pulse_app` split carries over as-is: migrations run as the owner in a controlled pipeline, the API connects only as the least-privilege runtime role, and the RLS policies remain the enforcement boundary.

**Organization logos.** The requirement is to store and serve org logos with minimal backend bandwidth and cost, without exposing the bucket. The shape:

1. The browser asks the API for a presigned `PUT` URL. The API authenticates the caller, checks the caller's role and organization, and signs a short-lived URL for a single object key scoped to that org (for example `logos/{organizationId}/{hash}.png`). The API never sees the bytes.
2. The browser uploads directly to S3 with that URL. Backend bandwidth for logo traffic is zero, so API scaling and cost are flat with respect to uploads.
3. Reads go through CloudFront with Origin Access Control, so the bucket itself stays private. Access to a given org's logo is gated by signed URLs or signed cookies issued per request, and a logo change triggers a CloudFront invalidation so a replaced image does not linger on the CDN.

This meets the business goal because the two expensive things (upload bytes and edge delivery) bypass the API tier entirely while both authorize against the same server-side identity the rest of the app uses. Presigned URLs expire in minutes, keys are org-scoped, and OAC closes direct S3 access.

**Connection pooling: why RDS Proxy, and the hazard worth naming.** Every request in this design runs inside exactly one transaction that issues `SET LOCAL app.current_organization_id`. The safety of that mechanism depends on the setting dying with the transaction. PgBouncer in transaction-pooling mode hands server connections to transactions one at a time and does not reset custom GUCs between them (its reset query is a session-pooling concept). With strict `SET LOCAL` discipline that is survivable: after a commit the GUC reads as an empty string, which `NULLIF` already treats as "no context, fail closed". The hazard is drift: any future code path that uses session-level `SET` instead of `SET LOCAL`, or that skips setting the context because "the connection already has it", leaves a tenant id sitting on a pooled server connection, and the next transaction that fails to set its own context inherits the previous tenant's org. That is a silent cross-tenant leak, and transaction-mode PgBouncer will not stop it. RDS Proxy pins a client session to a specific DB connection while session state exists, so this class of state cannot straddle transactions unnoticed; it also integrates with IAM auth and Secrets Manager and rides out RDS failovers faster than application-level retry logic. The pooling layer here is a correctness decision first and a scaling decision second. (A cheap supplementary guard: a Postgres-level audit of queries that touch RLS tables without a context set.)

**Scaling priorities.** The API is stateless, so the first lever is plain horizontal scaling behind the load balancer; RLS carries tenancy in the data layer, so the app tier needs no tenant affinity and no tenant-aware routing. The second lever is connection capacity: RDS Proxy in front of the database, sized to the transaction-per-request pattern. Read replicas come later, for summary/analytics queries that do not need to share write capacity; RLS applies on replicas the same as on the primary.

**Security priorities.** Network isolation first (private subnets, security groups narrowed to proxy-to-database, no public DB path). WAF on CloudFront and the API entry. Least-privilege database role carried over from the local design, including the revoked `UPDATE`/`DELETE`. Audit logging of admin actions and of any RLS denial pattern. Secrets in Secrets Manager, IAM auth for DB login, no long-lived passwords in app config.

**Tenancy priorities.** RLS remains the enforcement boundary in production, same predicate, same fail-closed behavior. What changes is where the tenant context comes from: a verified identity (OIDC/JWT claims mapped to the user and their org) resolved server-side per request, never a client-supplied header. The header demo exists so the local slice can run without an IdP; the production design replaces the source of the id, not the mechanism that consumes it.

## 4. AI-assisted delivery (Task 4)

The tool was opencode (TUI), driven by a primary orchestrator persona with four subagent personas defined in `.opencode/agents/`: `backend-agent`, `frontend-agent`, `reviewer-agent`, and `documenter-agent`. Each delegation handed the subagent a focused task that named its persona and pointed at its rules file; the orchestrator kept architecture decisions, review triage, and commits for itself. Models: the orchestrator and reviewer-agent ran on `openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`; the three implementation/writing agents ran on `openrouter/deepseek/deepseek-v4-flash-0731:free`.

Spec before code: the first commit (6983a17) is `SPEC.md` itself, and every later change was reviewed against it. Where the spec was wrong (the fail-closed predicate detail, N-10's `questions.organization_id` omission), the spec was amended in the same commit as the fix, with the decision recorded.

### Delegation and verification

Every delegation ended with mandatory gates: backend `build`, `tsc --noEmit`, lint, unit tests, e2e against a real Docker Postgres, direct psql probes of policies and privileges, and an HTTP contract smoke against the running API. The orchestrator independently re-ran the key checks before each commit rather than trusting the subagent's report.

| Commit | Agent | Task | Verification performed |
|---|---|---|---|
| 6983a17 | orchestrator | Write and commit `SPEC.md` | Prose deliverable; later verified in use as the review's reference spec |
| 3ecb903 | backend-agent | Backend scaffold: entities, migrations 001-002, guards, tenancy helper, seed, stubbed endpoints | Build/tsc/lint/unit clean; migrations and seed idempotent on Docker Postgres; live RLS probes; then a full reviewer pass |
| 057b1bd | reviewer-agent | Structured review of the scaffold against SPEC.md | Reviewer independently re-ran build, tests, migrations, psql probes; produced 25 findings, verdict request-changes (docs/reviews/backend-scaffold.md) |
| b6684fa | backend-agent | Fix review findings; implement responses + summary; RLS hardening | Unit 35/35, e2e 23/23, migration run x2, seed x2, privilege-denial probes, warm-connection fail-closed probe, HTTP smoke (201/409/403/404 paths) |
| f7ade2a | frontend-agent | React member/manager UI with the two-tab cross-org demo | Lint + build clean; contract smoke against a running backend |
| a7720ce | frontend-agent | Add `organizationId` to the demo list (migration 004), CORS for :4173 | e2e and HTTP smoke re-run; CORS echo checked for 5173/4173 and a disallowed origin |
| 0697287 | reviewer-agent | Recheck all 25 findings against the current code | Reviewer re-proved everything live: build/tsc/lint, 35 unit + 23 e2e, policies/grants/indexes probes, 004 down/up cycle, HTTP smoke; verdict approve-with-comments (docs/reviews/backend-recheck.md) |

The reviewer acted as a hard gate between scaffold and implementation: the implementation delegation was written from the review's findings, and nothing was committed until the findings had dispositions. Reviewer verdicts live in `docs/reviews/`.

### Rejected and corrected output

The workflow earned its keep here. Five concrete cases:

1. **RLS fail-closed defect (review finding S-1).** The original policy used `current_setting('app.current_organization_id', true)::uuid`. On a fresh session that is NULL and yields zero rows. But after any committed `SET LOCAL` transaction, which on a pooled connection means "after the first request", the GUC stays defined as an empty string, and the cast throws `invalid input syntax for type uuid`. Fail-closed in effect, but by error, and the spec's fail-closed probe would fail on every warm connection. The reviewer caught this with a live probe; the fix (`NULLIF(..., '')::uuid` in both `USING` and `WITH CHECK`, migration 003) landed with a warm-connection regression test in the e2e suite.
2. **Pool fallbacks in tenant helpers (A-1).** Four service helpers quietly defaulted to the shared pool when no `EntityManager` was passed, exactly the "query outside the tenant transaction" failure mode the model forbids. Rejected; the helpers were reworked to require the transactional `EntityManager`, making the misuse a compile error.
3. **`--strict` that wasn't (Q-2).** NestJS CLI scaffolding with `--strict` did not actually set `strict: true` in the backend tsconfig. Caught in review; enabled along with the unused-code checks, and all resulting errors fixed.
4. **Seed call on login (frontend).** The first frontend draft called the dev-only `POST /api/seed` after login to map organization names to ids. Rejected as a hack: it mutated fixtures to read data. Fixed properly by adding `organizationId` to `list_demo_users()` in migration 004.
5. **Editor false positives (e).** The editor's language server reported dozens of jest/decorator errors on spec files. Verified against `tsc --noEmit`, jest, and eslint, all clean; the LSP was misconfigured, not the code. Explicitly not chased, because chasing it would have produced noise commits.

The recheck also recorded four residual notes, R-1 through R-4 (a comment that overstates the 409 boundary, an unreachable 404 branch for a bad `week`, untested concurrent seeding, and a cosmetic detail of the 003 down-migration). All were accepted as documented nits rather than churned; the first two are already annotated in code.

### Artifacts and what I would change

Agent instructions live in `AGENTS.md` (committed) plus the machine-readable personas in `.opencode/agents/`. Session transcripts are in `ai-logs/`, exported from opencode's session database and redacted. Subagent review reports are preserved verbatim in `docs/reviews/`.

What I would do differently next time:

- Commit each delegation's task brief as a file at the moment of delegation, so the paper trail of who was asked to do what is in git rather than reconstructed from logs.
- Browser-level e2e (Playwright) for the UI flows; today the UI is verified by contract smoke and the API by e2e, and nothing drives a real browser.
- Freeze API DTOs earlier. The `organizationId` addition to the demo list arrived late and forced a migration; a contract-first pass over the endpoints would have caught it.

## 5. Known gaps and next steps

From SPEC §8, still open:

- Header auth is spoofable by design; no real authN/Z, no tokens, no expiry.
- Survey creation is seed-only; managers cannot create or close surveys.
- No pagination, rate limiting, audit logging, or observability.
- The test matrix is deliberately small: e2e happy paths, isolation, validation errors, summary math; no property or load testing.

Additional gaps beyond the spec's own list:

- No browser-level e2e for the UI; the frontend is exercised by contract smoke only.
- Reviewer residuals R-1 to R-4 from the recheck (documented nits: comment accuracy on the 409 boundary, an unreachable 404 branch, untested concurrent seeding, and the 003 down-migration's cosmetic grant shape).
- The production design in section 3 is single-region; no DR story.
- `GET /users` is a demo-only endpoint: public, unauthenticated, and a user-enumeration surface in any real deployment.

## 6. Running locally

One paragraph and a pointer: everything needed to run the stack is in `README.md`, which has the exact commands (`docker compose up -d`, then the backend on :3001 with migrations and seed, then the frontend on :5173), the demo users with their deterministic ids, the two-tab cross-org walkthrough, and troubleshooting notes. No external services are required; Postgres runs in Docker and everything else is npm.
