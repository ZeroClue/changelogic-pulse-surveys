import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { createApp } from '../src/app-setup';
import { currentWeekStart } from '../src/common/weeks';
import {
  ORG_A_ID,
  ORG_B_ID,
  QUESTION_A1_ID,
  QUESTION_A2_ID,
  QUESTION_A3_ID,
  QUESTION_B1_ID,
  QUESTION_B2_ID,
  QUESTION_B3_ID,
  SURVEY_A_ID,
  SURVEY_B_ID,
  USER_A_MANAGER_ID,
  USER_A_MEMBER_ID,
  USER_B_MANAGER_ID,
  USER_B_MEMBER_ID,
} from '../src/seed/seed-fixtures';

// Real-DB e2e (SPEC §7): requires `docker compose up -d` + `npm run
// migration:run` + a first seed. The suite is self-healing about seed state
// (POST /api/seed is idempotent) and resets response data via the OWNER role
// (pulse_app has no DELETE privilege by design — migration 003).
process.env.DATABASE_URL ??=
  'postgres://pulse_app:pulse_app@localhost:5432/pulse';
const OWNER_DATABASE_URL =
  process.env.E2E_OWNER_DATABASE_URL ??
  process.env.MIGRATION_DATABASE_URL ??
  'postgres://pulse_owner:pulse_owner@localhost:5432/pulse';

// Extra fixtures created/removed by THIS suite (owner connection, RLS-free).
const INACTIVE_SURVEY_A_ID = '00000000-0000-4000-8000-000000000102';
const EXTRA_MEMBER_IDS = [
  '00000000-0000-4000-8000-000000000013',
  '00000000-0000-4000-8000-000000000014',
  // Fresh respondent for the 400-validation cases (no prior weekly response).
  '00000000-0000-4000-8000-000000000015',
];
const VALIDATION_MEMBER_ID = EXTRA_MEMBER_IDS[2];

let app: INestApplication;
let appDb: DataSource;
let ownerDb: DataSource;

const server = (): Parameters<typeof request>[0] => app.getHttpServer();

async function get(path: string, headers: Record<string, string> = {}) {
  return request(server()).get(path).set(headers);
}

async function post(
  path: string,
  body: object,
  headers: Record<string, string> = {},
) {
  return request(server()).post(path).set(headers).send(body);
}

const memberA = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  'x-user-id': USER_A_MEMBER_ID,
  'x-org-id': ORG_A_ID,
  ...extra,
});
const managerA = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  'x-user-id': USER_A_MANAGER_ID,
  'x-org-id': ORG_A_ID,
  ...extra,
});
const memberB = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  'x-user-id': USER_B_MEMBER_ID,
  'x-org-id': ORG_B_ID,
  ...extra,
});
const managerB = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  'x-user-id': USER_B_MANAGER_ID,
  'x-org-id': ORG_B_ID,
  ...extra,
});

async function truncateResponses(): Promise<void> {
  await ownerDb.query('TRUNCATE answers, responses CASCADE');
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  appDb = app.get(DataSource);

  ownerDb = new DataSource({ type: 'postgres', url: OWNER_DATABASE_URL });
  await ownerDb.initialize();

  // Clear guardrail: the migration table must exist and 003's per-command
  // NULLIF policies must be installed, or every RLS assertion below is bogus.
  // (qual is NULL on INSERT-only policies — check whichever expression exists.)
  const policies = await ownerDb.query<
    Array<{
      policyname: string;
      qual: string | null;
      with_check: string | null;
    }>
  >(
    `SELECT policyname, qual, with_check FROM pg_policies
     WHERE policyname IN ('tenant_select', 'tenant_insert')
       AND roles = '{pulse_app}'`,
  );
  // Postgres normalizes the predicate with ::text casts, so assert the
  // structural parts of the NULLIF form rather than the exact string.
  const nullIfPredicate = (expression: string | null): boolean =>
    expression !== null &&
    expression.includes(
      "NULLIF(current_setting('app.current_organization_id'",
    ) &&
    expression.includes("''") &&
    expression.includes('::uuid');
  const isNullIfPolicy = (policy: {
    qual: string | null;
    with_check: string | null;
  }): boolean =>
    nullIfPredicate(policy.qual) || nullIfPredicate(policy.with_check);
  if (policies.length !== 10 || policies.some((p) => !isNullIfPolicy(p))) {
    throw new Error(
      'e2e requires migrations 001–003: run `docker compose up -d && npm run migration:run` in backend/',
    );
  }

  await truncateResponses();
  // Idempotent seed so fixtures exist regardless of prior state.
  const seed = await post('/api/seed', {});
  if (seed.status !== 201) {
    throw new Error(`seed failed during e2e setup: ${seed.status}`);
  }
}, 30000);

afterAll(async () => {
  if (ownerDb?.isInitialized) {
    // Remove suite-local fixtures; responses first (FK RESTRICT).
    await ownerDb.query('TRUNCATE answers, responses CASCADE');
    await ownerDb.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [
      EXTRA_MEMBER_IDS,
    ]);
    await ownerDb.query('DELETE FROM surveys WHERE id = $1', [
      INACTIVE_SURVEY_A_ID,
    ]);
    await ownerDb.destroy();
  }
  if (app) {
    await app.close();
  }
});

describe('RLS fail-closed + warm-connection regression (S-1)', () => {
  it('keeps zero rows readable with no tenant context (fresh AND warm pool)', async () => {
    // Pool-level, no context: with the pre-003 predicate a WARM pooled
    // connection (one that served a SET LOCAL tx) would throw ''::uuid.
    const rows = await appDb.query<{ c: number }[]>(
      'SELECT COUNT(*)::int AS c FROM surveys',
    );
    expect(rows[0]?.c).toBe(0);
  });

  it('returns zero rows — not a uuid cast error — on a warm connection after commit', async () => {
    const runner = appDb.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction();
      await runner.query(
        `SET LOCAL app.current_organization_id = '${ORG_A_ID}'`,
      );
      const inTx: Array<{ c: number }> = await runner.query(
        'SELECT COUNT(*)::int AS c FROM surveys',
      );
      expect(inTx[0]?.c).toBe(1); // org A context sees exactly its survey
      await runner.commitTransaction();

      // SET LOCAL dies with the transaction, but the GUC stays "defined"
      // with '' on this pooled connection — the S-1 trap.
      const guc: Array<{ v: string | null }> = await runner.query(
        "SELECT current_setting('app.current_organization_id', true) AS v",
      );
      expect(guc[0]?.v).toBe('');
      const afterCommit: Array<{ c: number }> = await runner.query(
        'SELECT COUNT(*)::int AS c FROM surveys',
      );
      expect(afterCommit[0]?.c).toBe(0); // fail closed, no throw
    } finally {
      await runner.release();
    }
  });

  it('rejects INSERT without tenant context (fail closed)', async () => {
    await expect(
      appDb.query(
        `INSERT INTO users (id, organization_id, name, email, role)
         VALUES (gen_random_uuid(), '${ORG_A_ID}', 'No Context', 'no-context@e2e.test', 'member')`,
      ),
    ).rejects.toThrow();
  });
});

describe('GET /api/users (public demo login list)', () => {
  it('lists the seeded users of both orgs with their organization ids', async () => {
    const res = await get('/api/users');
    expect(res.status).toBe(200);
    const rows = res.body as Array<{
      id: string;
      name: string;
      organization: string;
      organizationId: string;
    }>;
    const names = rows.map((u) => u.name);
    expect(names).toEqual(
      expect.arrayContaining([
        'Ada Manager',
        'Milo Member',
        'Nia Manager',
        'Omar Member',
      ]),
    );
    expect(rows).toHaveLength(4);
    // organization_id ships with the list (migration 004) so the login
    // screen can set X-Org-Id without the POST /api/seed round-trip.
    for (const row of rows) {
      expect(row.organizationId).toBe(
        row.organization === 'Acme Corp' ? ORG_A_ID : ORG_B_ID,
      );
    }
  });
});

describe('GET /api/surveys/active (org-scoped)', () => {
  it('returns org A survey with questions ordered by position', async () => {
    for (const headers of [memberA(), managerA()]) {
      const res = await get('/api/surveys/active', headers);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Acme weekly pulse');
      expect(
        res.body.questions.map((q: { position: number }) => q.position),
      ).toEqual([1, 2, 3]);
      expect(res.body.questions.map((q: { type: string }) => q.type)).toEqual([
        'rating',
        'rating',
        'yes_no',
      ]);
    }
  });

  it('returns org B survey for org B users (isolation)', async () => {
    const res = await get('/api/surveys/active', memberB());
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Globex weekly pulse');
    expect(res.body.questions[0]?.id).toBe(QUESTION_B1_ID);
  });
});

describe('POST /api/surveys/:surveyId/responses (member, B-1)', () => {
  const monday = currentWeekStart();

  it('401 without headers', async () => {
    const res = await post(`/api/surveys/${SURVEY_A_ID}/responses`, {
      answers: [{ questionId: QUESTION_A1_ID, ratingValue: 4 }],
    });
    expect(res.status).toBe(401);
  });

  it('403 when a manager submits (member-only route)', async () => {
    const res = await post(
      `/api/surveys/${SURVEY_A_ID}/responses`,
      { answers: [{ questionId: QUESTION_A1_ID, ratingValue: 4 }] },
      managerA(),
    );
    expect(res.status).toBe(403);
  });

  it('400 on a non-uuid survey id', async () => {
    const res = await post(
      '/api/surveys/not-a-uuid/responses',
      { answers: [{ questionId: QUESTION_A1_ID, ratingValue: 4 }] },
      memberA(),
    );
    expect(res.status).toBe(400);
  });

  it('201 happy path: server-computed Monday week_start, answers persisted', async () => {
    const res = await post(
      `/api/surveys/${SURVEY_A_ID}/responses`,
      {
        answers: [
          { questionId: QUESTION_A1_ID, ratingValue: 4 },
          { questionId: QUESTION_A2_ID, ratingValue: 2 },
          { questionId: QUESTION_A3_ID, boolValue: true },
        ],
      },
      memberA(),
    );
    expect(res.status).toBe(201);
    expect(res.body.surveyId).toBe(SURVEY_A_ID);
    expect(res.body.respondentId).toBe(USER_A_MEMBER_ID);
    expect(res.body.weekStart).toBe(monday);
    expect(res.body.answers).toEqual([
      { questionId: QUESTION_A1_ID, ratingValue: 4, boolValue: null },
      { questionId: QUESTION_A2_ID, ratingValue: 2, boolValue: null },
      { questionId: QUESTION_A3_ID, ratingValue: null, boolValue: true },
    ]);
    const persisted = await ownerDb.query<{ c: number }[]>(
      `SELECT COUNT(*)::int AS c FROM answers a
       JOIN responses r ON r.id = a.response_id
       WHERE r.survey_id = $1 AND r.respondent_id = $2 AND r.week_start = $3`,
      [SURVEY_A_ID, USER_A_MEMBER_ID, monday],
    );
    expect(persisted[0]?.c).toBe(3);
  });

  it('409 on a second submission in the same week', async () => {
    const res = await post(
      `/api/surveys/${SURVEY_A_ID}/responses`,
      { answers: [{ questionId: QUESTION_A1_ID, ratingValue: 5 }] },
      memberA(),
    );
    expect(res.status).toBe(409);
  });

  it('409 for exactly one of two CONCURRENT double-submits (race-safe)', async () => {
    const body = {
      answers: [
        { questionId: QUESTION_B1_ID, ratingValue: 3 },
        { questionId: QUESTION_B2_ID, ratingValue: 4 },
        { questionId: QUESTION_B3_ID, boolValue: true },
      ],
    };
    const [a, b] = await Promise.all([
      post(`/api/surveys/${SURVEY_B_ID}/responses`, body, memberB()),
      post(`/api/surveys/${SURVEY_B_ID}/responses`, body, memberB()),
    ]);
    const statuses = [a.status, b.status].sort((x, y) => x - y);
    expect(statuses).toEqual([201, 409]);
  });

  it('404 for a cross-org survey id (org B member → org A survey)', async () => {
    const res = await post(
      `/api/surveys/${SURVEY_A_ID}/responses`,
      { answers: [{ questionId: QUESTION_B1_ID, ratingValue: 3 }] },
      memberB(),
    );
    expect(res.status).toBe(404);
  });

  it('404 for an inactive survey of the caller org', async () => {
    await ownerDb.query(
      `INSERT INTO surveys (id, organization_id, title, is_active)
       VALUES ($1, $2, 'Inactive probe', false) ON CONFLICT DO NOTHING`,
      [INACTIVE_SURVEY_A_ID, ORG_A_ID],
    );
    const res = await post(
      `/api/surveys/${INACTIVE_SURVEY_A_ID}/responses`,
      { answers: [{ questionId: QUESTION_A1_ID, ratingValue: 3 }] },
      memberA(),
    );
    expect(res.status).toBe(404);
  });

  it('400s: invalid DTOs and broken answer sets', async () => {
    // A respondent with NO prior submission this week: the 409 duplicate check
    // must not mask these payload-level 400s.
    await ownerDb.query(
      `INSERT INTO users (id, organization_id, name, email, role)
       VALUES ($1, $2, 'Val Member', 'val.member@acme.test', 'member')
       ON CONFLICT DO NOTHING`,
      [VALIDATION_MEMBER_ID, ORG_A_ID],
    );
    const headers = { 'x-user-id': VALIDATION_MEMBER_ID, 'x-org-id': ORG_A_ID };
    const cases: Array<{ name: string; body: object }> = [
      {
        name: 'rating out of range (9)',
        body: { answers: [{ questionId: QUESTION_A1_ID, ratingValue: 9 }] },
      },
      {
        name: 'both values',
        body: {
          answers: [
            { questionId: QUESTION_A1_ID, ratingValue: 3, boolValue: true },
          ],
        },
      },
      { name: 'no value', body: { answers: [{ questionId: QUESTION_A1_ID }] } },
      { name: 'empty answers', body: { answers: [] } },
      {
        name: 'duplicate questionIds',
        body: {
          answers: [
            { questionId: QUESTION_A1_ID, ratingValue: 1 },
            { questionId: QUESTION_A1_ID, ratingValue: 2 },
          ],
        },
      },
      {
        name: 'unknown question',
        body: { answers: [{ questionId: QUESTION_B1_ID, ratingValue: 1 }] },
      },
      {
        name: 'missing question (2 of 3)',
        body: {
          answers: [
            { questionId: QUESTION_A1_ID, ratingValue: 1 },
            { questionId: QUESTION_A2_ID, ratingValue: 2 },
          ],
        },
      },
      {
        name: 'wrong value type for question',
        body: {
          answers: [
            { questionId: QUESTION_A1_ID, ratingValue: 1 },
            { questionId: QUESTION_A2_ID, ratingValue: 2 },
            { questionId: QUESTION_A3_ID, ratingValue: 3 },
          ],
        },
      },
    ];
    for (const { name, body } of cases) {
      const res = await post(
        `/api/surveys/${SURVEY_A_ID}/responses`,
        body,
        headers,
      );
      if (res.status !== 400) {
        throw new Error(`case "${name}" expected 400, got ${res.status}`);
      }
    }
  });

  afterAll(async () => {
    // The validation member had only 400s (no response rows); remove it so
    // the summary block's member-count math stays deterministic.
    if (ownerDb?.isInitialized) {
      await ownerDb.query('DELETE FROM users WHERE id = $1', [
        VALIDATION_MEMBER_ID,
      ]);
    }
  });
});

describe('GET /api/surveys/:surveyId/summary (manager, B-2)', () => {
  const monday = currentWeekStart();
  const lastMonday = ((): string => {
    const [y, m, d] = monday.split('-').map(Number) as [number, number, number];
    const date = new Date(y, m - 1, d - 7);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  })();

  beforeAll(async () => {
    // Deterministic math: wipe responses, add two extra org A members, then
    // submit from all three members of org A this week.
    await truncateResponses();
    await ownerDb.query(
      `INSERT INTO users (id, organization_id, name, email, role)
       VALUES ($1, $2, 'Tara Member', 'tara.member@acme.test', 'member'),
              ($3, $2, 'Tia Member', 'tia.member@acme.test', 'member')
       ON CONFLICT DO NOTHING`,
      [EXTRA_MEMBER_IDS[0], ORG_A_ID, EXTRA_MEMBER_IDS[1]],
    );
    const submissions: Array<{
      user: string;
      ratings: [number, number];
      bool: boolean;
    }> = [
      { user: USER_A_MEMBER_ID, ratings: [4, 2], bool: true },
      { user: EXTRA_MEMBER_IDS[0], ratings: [3, 1], bool: false },
      { user: EXTRA_MEMBER_IDS[1], ratings: [3, 3], bool: true },
    ];
    for (const { user, ratings, bool } of submissions) {
      const res = await post(
        `/api/surveys/${SURVEY_A_ID}/responses`,
        {
          answers: [
            { questionId: QUESTION_A1_ID, ratingValue: ratings[0] },
            { questionId: QUESTION_A2_ID, ratingValue: ratings[1] },
            { questionId: QUESTION_A3_ID, boolValue: bool },
          ],
        },
        { 'x-user-id': user, 'x-org-id': ORG_A_ID },
      );
      expect(res.status).toBe(201);
    }
  }, 30000);

  it('computes the weekly summary (default week) from seeded data', async () => {
    const res = await get(`/api/surveys/${SURVEY_A_ID}/summary`, managerA());
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(monday);
    expect(res.body.completionCount).toBe(3); // 3 member responses this week
    expect(res.body.completionRate).toBeCloseTo(0.75, 5); // 3 ÷ 4 org users
    expect(res.body.perQuestion).toEqual([
      {
        questionId: QUESTION_A1_ID,
        position: 1,
        prompt: 'How satisfied are you with your workload this week?',
        type: 'rating',
        average: 3.33, // (4+3+3)/3 rounded to 2 decimals
        count: 3,
      },
      {
        questionId: QUESTION_A2_ID,
        position: 2,
        prompt: 'How supported do you feel by your team this week?',
        type: 'rating',
        average: 2, // (2+1+3)/3
        count: 3,
      },
      {
        questionId: QUESTION_A3_ID,
        position: 3,
        prompt:
          'Would you recommend Acme Corp as a great place to work this week?',
        type: 'yes_no',
        yesCount: 2,
        noCount: 1,
        count: 3,
      },
    ]);
  });

  it('accepts ?week=<this Monday> with identical numbers', async () => {
    const res = await get(
      `/api/surveys/${SURVEY_A_ID}/summary?week=${monday}`,
      managerA(),
    );
    expect(res.status).toBe(200);
    expect(res.body.completionCount).toBe(3);
    expect(res.body.completionRate).toBeCloseTo(0.75, 5);
  });

  it('zeros for a past Monday week', async () => {
    const res = await get(
      `/api/surveys/${SURVEY_A_ID}/summary?week=${lastMonday}`,
      managerA(),
    );
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(lastMonday);
    expect(res.body.completionCount).toBe(0);
    expect(res.body.completionRate).toBe(0);
    expect(res.body.perQuestion).toEqual([
      expect.objectContaining({
        questionId: QUESTION_A1_ID,
        type: 'rating',
        average: null,
        count: 0,
      }),
      expect.objectContaining({
        questionId: QUESTION_A2_ID,
        type: 'rating',
        average: null,
        count: 0,
      }),
      expect.objectContaining({
        questionId: QUESTION_A3_ID,
        type: 'yes_no',
        yesCount: 0,
        noCount: 0,
        count: 0,
      }),
    ]);
  });

  it('is correct for org B too (no submissions → zeros, memberCount 2)', async () => {
    const res = await get(`/api/surveys/${SURVEY_B_ID}/summary`, managerB());
    expect(res.status).toBe(200);
    expect(res.body.weekStart).toBe(monday);
    expect(res.body.completionCount).toBe(0);
    expect(res.body.completionRate).toBe(0);
    expect(res.body.perQuestion[0]?.questionId).toBe(QUESTION_B1_ID);
    expect(res.body.perQuestion[2]?.count).toBe(0);
  });

  it('403 when a member calls the summary', async () => {
    const res = await get(`/api/surveys/${SURVEY_A_ID}/summary`, memberA());
    expect(res.status).toBe(403);
  });

  it('404 for a cross-org survey id', async () => {
    const res = await get(`/api/surveys/${SURVEY_A_ID}/summary`, managerB());
    expect(res.status).toBe(404);
  });

  it('400 for a bad or non-Monday ?week', async () => {
    for (const week of ['garbage', '2024-01-02', '2024-02-30', '2024-1-1']) {
      const res = await get(
        `/api/surveys/${SURVEY_A_ID}/summary?week=${encodeURIComponent(week)}`,
        managerA(),
      );
      if (res.status !== 400) {
        throw new Error(`week=${week} expected 400, got ${res.status}`);
      }
    }
  });
});

describe('POST /api/seed (idempotent)', () => {
  it('is safe to re-run (twice in a row)', async () => {
    const first = await post('/api/seed', {});
    const second = await post('/api/seed', {});
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    for (const res of [first, second]) {
      expect(res.body.organizations).toHaveLength(2);
      expect(res.body.users).toHaveLength(4);
      expect(res.body.surveys).toHaveLength(2);
      expect(res.body.surveys[0]?.questions).toHaveLength(3);
    }
  });
});
