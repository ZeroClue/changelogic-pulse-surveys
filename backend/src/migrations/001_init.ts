import { type MigrationBuilder } from 'node-pg-migrate';

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createType('org_role', ['manager', 'member']);
  pgm.createType('question_type', ['rating', 'yes_no']);

  pgm.createTable('organizations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'text', notNull: true },
    logo_url: { type: 'text' },
  });

  pgm.createTable('users', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT',
    },
    name: { type: 'text', notNull: true },
    email: { type: 'text', notNull: true, unique: true },
    role: { type: 'org_role', notNull: true },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  pgm.createTable('surveys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT',
    },
    title: { type: 'text', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: false },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Exactly one active survey per organization (SPEC §1).
  pgm.createIndex('surveys', 'organization_id', {
    name: 'uq_surveys_one_active_per_org',
    unique: true,
    where: 'is_active',
  });

  pgm.createTable('questions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    // SPEC §1 intro: "Every tenant table carries organization_id so RLS
    // policies are uniform" — the questions table listing omits it, but the
    // §2 tenant_isolation policy requires it on every tenant table.
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT',
    },
    survey_id: {
      type: 'uuid',
      notNull: true,
      references: 'surveys',
      onDelete: 'CASCADE',
    },
    position: {
      type: 'smallint',
      notNull: true,
      check: 'position BETWEEN 1 AND 3',
    },
    prompt: { type: 'text', notNull: true },
    type: { type: 'question_type', notNull: true },
  });

  pgm.createIndex('questions', ['survey_id', 'position'], {
    name: 'uq_questions_survey_position',
    unique: true,
  });

  pgm.createTable('responses', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT',
    },
    survey_id: {
      type: 'uuid',
      notNull: true,
      references: 'surveys',
      onDelete: 'RESTRICT',
    },
    respondent_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'RESTRICT',
    },
    week_start: { type: 'date', notNull: true },
    submitted_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // One response per member per calendar week per survey (SPEC §1/§3).
  pgm.createIndex('responses', ['survey_id', 'respondent_id', 'week_start'], {
    name: 'uq_responses_survey_respondent_week',
    unique: true,
  });
  pgm.createIndex('responses', ['survey_id', 'week_start'], {
    name: 'idx_responses_survey_week',
  });

  pgm.createTable('answers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    organization_id: {
      type: 'uuid',
      notNull: true,
      references: 'organizations',
      onDelete: 'RESTRICT',
    },
    response_id: {
      type: 'uuid',
      notNull: true,
      references: 'responses',
      onDelete: 'CASCADE',
    },
    question_id: {
      type: 'uuid',
      notNull: true,
      references: 'questions',
      onDelete: 'RESTRICT',
    },
    rating_value: { type: 'smallint', check: 'rating_value BETWEEN 1 AND 5' },
    bool_value: { type: 'boolean' },
  });

  // Exactly one of the two value columns must be set (SPEC §1).
  pgm.addConstraint('answers', 'ck_answers_exactly_one_value', {
    check: '(rating_value IS NULL) <> (bool_value IS NULL)',
  });

  pgm.createIndex('answers', ['response_id'], { name: 'idx_answers_response' });
  pgm.createIndex('answers', ['question_id'], { name: 'idx_answers_question' });
}

// eslint-disable-next-line @typescript-eslint/require-await -- node-pg-migrate migration signature
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('answers', { ifExists: true, cascade: true });
  pgm.dropTable('responses', { ifExists: true, cascade: true });
  pgm.dropTable('questions', { ifExists: true, cascade: true });
  pgm.dropTable('surveys', { ifExists: true, cascade: true });
  pgm.dropTable('users', { ifExists: true, cascade: true });
  pgm.dropTable('organizations', { ifExists: true, cascade: true });
  pgm.dropType('question_type');
  pgm.dropType('org_role');
}
