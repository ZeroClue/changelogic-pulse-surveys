# SPEC — Multi-Tenant Pulse Surveys (Focused Slice)

Deliverable for the Change Logic senior full-stack (AI-native) take-home. This spec is committed before implementation; the code follows it.

**Stack:** TypeScript · NestJS · React (Vite) · PostgreSQL 16. Runs fully locally via `docker-compose` (Postgres) + `npm run dev` for API (`:3001`) and web (`:5173`). No external identity providers or paid services.

**Key decisions (stated per assignment):**
1. **Isolation:** PostgreSQL Row-Level Security keyed on `organization_id`, driven by `current_setting('app.current_organization_id')` set per request transaction — with application-layer scoping as defense in depth.
2. **"This week":** calendar week, Monday 00:00:00 through Sunday 23:59:59.999 (server timezone).
3. **Auth:** local-friendly demo headers `X-User-Id` (+ optional `X-Org-Id`) resolving seeded users. Demo-only; no real authN.
4. **Survey creation:** seeded fixtures only (allowed by the assignment) to keep UI scope tight.

---

## 1. Data model

Shared database, shared schema. Every tenant table carries `organization_id` so RLS policies are uniform.

### Tables

**organizations**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | deterministic UUIDs for seeds |
| name | text NOT NULL | |
| logo_url | text NULL | placeholder for the Task 3 logo design note |

**users**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK → organizations | exactly one org per user |
| name | text NOT NULL | |
| email | text NOT NULL UNIQUE | |
| role | enum `('manager','member')` NOT NULL | exactly one role |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**surveys**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK → organizations | |
| title | text NOT NULL | |
| is_active | boolean NOT NULL DEFAULT false | partial unique index: one active survey per org |
| created_at | timestamptz NOT NULL DEFAULT now() | |

**questions**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| survey_id | uuid NOT NULL FK → surveys ON DELETE CASCADE | |
| position | smallint NOT NULL CHECK (position BETWEEN 1 AND 3) | UNIQUE (survey_id, position); ≤3 questions enforced here + app |
| prompt | text NOT NULL | |
| type | enum `('rating','yes_no')` NOT NULL | rating 1–5, yes/no |

**responses**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK → organizations | RLS predicate |
| survey_id | uuid NOT NULL FK → surveys | |
| respondent_id | uuid NOT NULL FK → users | always the current user |
| week_start | date NOT NULL | Monday of submission week (see §3) |
| submitted_at | timestamptz NOT NULL DEFAULT now() | |

Constraint: `UNIQUE (survey_id, respondent_id, week_start)` → one response per member per calendar week per survey.

**answers**
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| organization_id | uuid NOT NULL FK → organizations | RLS predicate |
| response_id | uuid NOT NULL FK → responses ON DELETE CASCADE | |
| question_id | uuid NOT NULL FK → questions | |
| rating_value | smallint NULL CHECK (rating_value BETWEEN 1 AND 5) | set iff question is `rating` |
| bool_value | boolean NULL | set iff question is `yes_no` |

Constraints: `CHECK ((rating_value IS NULL) <> (bool_value IS NULL))` (exactly one value). The value type must match the question type — enforced in the application layer (Postgres CHECK cannot cross tables), covered by e2e tests.

### Relationships

- organizations 1—N users, 1—N surveys
- surveys 1—N questions, 1—N responses
- responses 1—N answers; users 1—N responses (as respondent); questions 1—N answers

## 2. Tenancy isolation — RLS with `current_setting`

- **Roles:** `pulse_owner` owns tables and runs migrations/seeds (owner bypasses RLS when not forced); `pulse_app` is the runtime role — non-owner, no `BYPASSRLS`, so RLS always applies to it.
- **Policies:** for each tenant table (`users`, `surveys`, `questions`, `responses`, `answers`): `ENABLE ROW LEVEL SECURITY` plus one policy:

```sql
CREATE POLICY tenant_isolation ON surveys
  USING (organization_id = current_setting('app.current_organization_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.current_organization_id', true)::uuid);
```

- **Fail closed:** `current_setting(..., true)` returns NULL when the setting is absent → predicate is NULL → zero rows readable and all writes rejected. No context = no access.
- **Request flow:** NestJS guard resolves the user from `X-User-Id`; a transaction interceptor opens one transaction per request and executes `SET LOCAL app.current_organization_id = '<org-uuid>'` before queries. `SET LOCAL` is transaction-scoped, so pooled connections can never leak tenant context.
- **Defense in depth:** repositories additionally filter by the resolved `organization_id`; the summary completion rate and org member count are computed inside the same RLS-scoped transaction.

## 3. Weekly window — calendar week

- Week = **Monday 00:00:00 → Sunday 23:59:59.999**, server timezone (documented in README).
- `week_start` = Monday of `submitted_at`'s week (`date_trunc('week', ...)` is Monday-based in Postgres). Storing `week_start` makes the uniqueness constraint and summary filters trivial and index-friendly.
- "Active week" = any calendar week while the survey `is_active`. Members get exactly one response per active week (unique constraint above).
- Summary defaults to the current week; `?week=YYYY-MM-DD` (a Monday) may be passed.

## 4. Auth — seeded users + headers

- Client sends `X-User-Id` (required, uuid of a seeded user) and `X-Org-Id` (optional). Server resolves the user and derives their organization and role server-side; the org context is **never trusted from the client alone**. If `X-Org-Id` is present and mismatches the user's org → `403`.
- Guards: unknown user → `401`; manager-only routes (`summary`) → `403` for members.
- This is deliberately demo-only (spoofable by design); noted in README and SOLUTION.md.
- Seed users use deterministic UUIDs so the UI login dropdown is stable across resets.

## 5. API endpoints (base `/api`)

| Method & path | Role | Description |
|---|---|---|
| `GET /users` | any | Demo login list: `{id, name, role, organization}` for the dropdown |
| `GET /surveys/active` | member, manager | Caller's org active survey with ordered questions |
| `POST /surveys/:surveyId/responses` | member | Submit `{answers: [{questionId, ratingValue? , boolValue?}]}`. Validates: survey belongs to caller's org & is active, questions belong to the survey, value type matches question type, rating ∈ 1–5. Second response in the same week → `409`. |
| `GET /surveys/:surveyId/summary` | manager | Weekly summary: `{weekStart, completionCount, completionRate, perQuestion}`. Rating questions → `{average, count}`; yes/no → `{yesCount, noCount, count}`. `completionRate` = responses this week ÷ member count of the org. `?week=` optional. |
| `POST /seed` | public (dev) | Idempotent fixture seeding: 2 organizations, ≥2 users per role each, one active 3-question survey per org. Returns the seeded entities for the demo. |

Errors: `{statusCode, message}` JSON; `401` unauthenticated, `403` wrong role/org, `404` not found or cross-org (RLS yields empty), `409` duplicate weekly response.

## 6. UI flows (React)

- **Login:** dropdown of seeded users ("name — role @ org") from `GET /users`; sets both headers, persists selection in `localStorage`, switchable at any time. This drives the isolation demo.
- **Member — view & submit:** shows the org's active survey (title + up to 3 questions); rating 1–5 and yes/no radio inputs; submit → confirmation. Returning later in the same week shows "already submitted this week" with the recorded answers.
- **Manager — summary:** survey picker (own org), weekly summary view: completion count + rate card, per-question rollups (rating average/count, yes/no counts). Defaults to current week.
- **Isolation demo:** switching between users of Org A and Org B shows different surveys, responses, and summaries; cross-org access is never visible (and the API returns `404` if forced).

## 7. Validation plan

- e2e (API): happy path for both orgs; member second-submit → `409`; member calling summary → `403`; user of org B requesting org A's survey id → `404`; summary math matches seeded data.
- SQL probe: with `app.current_organization_id` unset, queries return zero rows (fail-closed proof).
- UI walk-through mirrors §6 using both orgs.

## 8. Known gaps / next steps

**Known gaps (accepted for the slice):**
- Header "auth" is trivially spoofable — acceptable only because the assignment allows a local-friendly demo mechanism.
- Managers cannot create/close surveys via UI or API (seed-only per assignment allowance).
- No pagination, rate limiting, audit logging, or observability.
- Minimal test coverage: e2e happy path + isolation only; no unit-test matrix.

**Next steps with more time:**
1. Real authN/Z (OIDC/JWT) with per-user tokens; service-to-service scoping.
2. Survey management (create/close, question editor) for managers.
3. Multi-week trend endpoint + charts; historical data retention policy.
4. RLS bypass-attempt test suite; CI (GitHub Actions) with a Postgres service container.
5. Production deployment per the Task 3 design note (ECS/Fargate, RDS Postgres, S3 + CloudFront for the org logo with signed URLs — detailed in SOLUTION.md).
