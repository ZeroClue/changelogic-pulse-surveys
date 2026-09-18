# Pulse surveys (multi-tenant demo slice)

A small but complete multi-tenant pulse-survey app. Two organizations, each with a manager, a member, and one active weekly survey. Members submit once per calendar week; managers see a weekly summary. Stack: NestJS, React (Vite), PostgreSQL 16. Tenant isolation is enforced by Postgres row-level security, not just by application code. Auth is a demo-only `X-User-Id` header: fine for a local demo, not for anything real.

`SPEC.md` is the committed spec the code follows. `SOLUTION.md` has the design notes, the AWS production sketch, and the AI-workflow narrative.

## Prerequisites

- Node 20 or newer
- Docker (for the Postgres container)

## Quickstart

Start Postgres, then the backend, then the frontend.

1. Database (Postgres 16 on `localhost:5432`, database `pulse`):

   ```
   docker compose up -d
   ```

   The first start also creates the non-owner runtime role `pulse_app` from `docker/postgres-init/01-roles.sql`.

2. Backend (API on port 3001, all routes under `/api`):

   ```
   cd backend
   cp .env.example .env
   npm install
   npm run migration:run
   npm run seed
   npm run start:dev
   ```

   `npm run seed` is idempotent; re-running it is safe (and needed again if you wipe the Docker volume).

3. Frontend (port 5173):

   ```
   cd frontend
   npm install
   npm run dev
   ```

   Open http://localhost:5173. The API base defaults to `http://localhost:3001/api`; set `VITE_API_URL` to point elsewhere (see `frontend/.env.example`).

Both `.env.example` files carry local dev placeholder values, and `.env` is gitignored. Nothing in them is a secret; each checkout gets its own copy.

## Demo users

The seed creates two organizations with one manager and one member each. These identities are fixtures for the demo, not credentials; the IDs are deterministic so they survive reseeds. In the UI you just pick a name from the dropdown. For raw API calls, pass the ID in the `X-User-Id` header.

| Organization (org id) | Name | Role | User ID |
|---|---|---|---|
| Acme Corp (`00000000-0000-4000-8000-000000000001`) | Ada Manager | manager | `00000000-0000-4000-8000-000000000011` |
| Acme Corp (`00000000-0000-4000-8000-000000000001`) | Milo Member | member | `00000000-0000-4000-8000-000000000012` |
| Globex (`00000000-0000-4000-8000-000000000002`) | Nia Manager | manager | `00000000-0000-4000-8000-000000000021` |
| Globex (`00000000-0000-4000-8000-000000000002`) | Omar Member | member | `00000000-0000-4000-8000-000000000022` |

## Cross-org demo (two browser tabs)

The point of the slice is that one org can never see another org's data, and you can watch that happen:

1. Tab A: sign in as **Ada Manager** (Acme). You see the Acme survey and its summary.
2. Tab B: sign in as **Nia Manager** (Globex). Same UI, different survey, different numbers. Cross-org survey IDs come back as `404` from the API.
3. Member flow: sign in as **Milo Member** in one tab, submit the Acme survey, then reload; the UI shows "already submitted this week". A second POST returns `409`.

Session storage makes the two tabs independent: each tab's selection lives in `sessionStorage` (`pulse.session.tab-user`), and signing in also updates a shared `localStorage` default (`pulse.session.default`). So a tab keeps its user across reloads even after another tab switches, while a brand-new tab inherits the most recent sign-in.

## API summary

Base URL `/api`. Errors are `{statusCode, message}` JSON.

| Method and path | Role | Success | Errors |
|---|---|---|---|
| `GET /users` | public (demo login list) | 200 | - |
| `GET /surveys/active` | member, manager | 200 | 401 unknown user; 404 if the org has no active survey |
| `POST /surveys/:surveyId/responses` | member | 201 | 400 invalid body (shape, >3 answers, duplicate questionId, out-of-range rating); 401; 403 member-only route, or `X-Org-Id` mismatches the user's org; 404 unknown or cross-org survey (RLS makes cross-org rows invisible); 409 second response in the same calendar week |
| `GET /surveys/:surveyId/summary` | manager | 200 | 400 `?week` not a Monday `YYYY-MM-DD`; 401; 403 member; 404 unknown or cross-org survey |
| `POST /seed` | public, dev only | 201 | 403 when `NODE_ENV=production` |

A member may submit one response per calendar week per survey. A "week" is Monday 00:00:00 through Sunday 23:59:59.999 in the server's timezone; the server computes the Monday `week_start` itself.

## Tests

In `backend/`:

- Unit tests: `npm test`
- E2E: `npm run test:e2e`

The e2e suite runs against a real Postgres and real RLS policies, so it needs the Docker database up with migrations applied (`docker compose up -d`, then `npm run migration:run`). It reads two connection variables, both with defaults matching `backend/.env.example`:

- `DATABASE_URL` (runtime role, `pulse_app`)
- `MIGRATION_DATABASE_URL` (owner role, `pulse_owner`; also overridable as `E2E_OWNER_DATABASE_URL`)

## Project layout

```
├── SPEC.md                  committed spec, written before any code
├── docker-compose.yml       Postgres 16 (roles bootstrapped by docker/postgres-init/)
├── backend/                 NestJS API, port 3001, prefix /api
│   ├── src/migrations/      001_init ... 004 (schema, RLS, hardening, demo-user shape)
│   ├── src/common/          guards, request-scoped tenant transaction runtime
│   ├── src/seed/            deterministic fixtures, idempotent seeding
│   └── test/                e2e suite (real DB, real RLS)
├── frontend/                React (Vite) UI, port 5173
├── docs/reviews/            reviewer reports (scaffold review + recheck)
└── ai-logs/                 redacted AI session transcripts
```

## Troubleshooting

- Port conflicts: Postgres takes 5432, the API takes 3001, Vite dev takes 5173. If 3001 is busy, set `PORT` in `backend/.env` and point `VITE_API_URL` at the new address.
- `vite preview` (port 4173) is also in the default CORS allowlist, but the documented dev path is `:5173`.
- E2E tests fail immediately without the Docker database; start it and run migrations first.
- `docker compose down -v` deletes the volume, so seeds and any submitted responses are gone. Re-run migrations and seed afterwards.
- The API answers `401` unless `X-User-Id` matches a seeded user. The login dropdown in the UI handles this for you.
