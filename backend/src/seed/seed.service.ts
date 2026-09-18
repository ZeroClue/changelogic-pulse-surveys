import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  type DataSource,
  type EntityManager,
  type EntityTarget,
  type FindOptionsWhere,
  type QueryDeepPartialEntity,
} from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { Question } from '../entities/question.entity';
import { Survey } from '../entities/survey.entity';
import { User } from '../entities/user.entity';
import { setTenantContextSql } from '../common/tenancy/set-tenant-context';
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
  type SeedResult,
} from './seed-fixtures';

const ORGANIZATIONS = [
  { id: ORG_A_ID, name: 'Acme Corp' },
  { id: ORG_B_ID, name: 'Globex' },
];

const ORG_SEEDS = [
  {
    organization: ORGANIZATIONS[0],
    users: [
      {
        id: USER_A_MANAGER_ID,
        organizationId: ORG_A_ID,
        name: 'Ada Manager',
        email: 'ada.manager@acme.test',
        role: 'manager' as const,
      },
      {
        id: USER_A_MEMBER_ID,
        organizationId: ORG_A_ID,
        name: 'Milo Member',
        email: 'milo.member@acme.test',
        role: 'member' as const,
      },
    ],
    survey: {
      id: SURVEY_A_ID,
      organizationId: ORG_A_ID,
      title: 'Acme weekly pulse',
      isActive: true,
    },
    questions: [
      {
        id: QUESTION_A1_ID,
        organizationId: ORG_A_ID,
        surveyId: SURVEY_A_ID,
        position: 1,
        prompt: 'How satisfied are you with your workload this week?',
        type: 'rating' as const,
      },
      {
        id: QUESTION_A2_ID,
        organizationId: ORG_A_ID,
        surveyId: SURVEY_A_ID,
        position: 2,
        prompt: 'How supported do you feel by your team this week?',
        type: 'rating' as const,
      },
      {
        id: QUESTION_A3_ID,
        organizationId: ORG_A_ID,
        surveyId: SURVEY_A_ID,
        position: 3,
        prompt:
          'Would you recommend Acme Corp as a great place to work this week?',
        type: 'yes_no' as const,
      },
    ],
  },
  {
    organization: ORGANIZATIONS[1],
    users: [
      {
        id: USER_B_MANAGER_ID,
        organizationId: ORG_B_ID,
        name: 'Nia Manager',
        email: 'nia.manager@globex.test',
        role: 'manager' as const,
      },
      {
        id: USER_B_MEMBER_ID,
        organizationId: ORG_B_ID,
        name: 'Omar Member',
        email: 'omar.member@globex.test',
        role: 'member' as const,
      },
    ],
    survey: {
      id: SURVEY_B_ID,
      organizationId: ORG_B_ID,
      title: 'Globex weekly pulse',
      isActive: true,
    },
    questions: [
      {
        id: QUESTION_B1_ID,
        organizationId: ORG_B_ID,
        surveyId: SURVEY_B_ID,
        position: 1,
        prompt: 'How energized did you feel at work this week?',
        type: 'rating' as const,
      },
      {
        id: QUESTION_B2_ID,
        organizationId: ORG_B_ID,
        surveyId: SURVEY_B_ID,
        position: 2,
        prompt: 'How clear were your priorities this week?',
        type: 'rating' as const,
      },
      {
        id: QUESTION_B3_ID,
        organizationId: ORG_B_ID,
        surveyId: SURVEY_B_ID,
        position: 3,
        prompt: 'Did you have at least one meaningful win this week?',
        type: 'yes_no' as const,
      },
    ],
  },
];

/**
 * Seed write semantics (review E-1): INSERT … ON CONFLICT DO NOTHING
 * followed by a read of the stored rows — never UPDATE. Two reasons:
 *  1. Migration 003 revokes UPDATE from pulse_app (review S-3), so re-running
 *     the seed must not take the update path of an upsert.
 *  2. Fixture identity is immutable: deterministic ids and emails win. A row
 *     that already exists (by id OR by the unique email) is returned as-is,
 *     so a re-run can never 500 on a unique-constraint conflict.
 */
@Injectable()
export class SeedService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Idempotent fixture seeding (SPEC §5): 2 organizations, 1 manager + 1
   * member each, one active 3-question survey per org. Everything happens in
   * ONE transaction; for each org the tenant context is set with SET LOCAL so
   * every insert passes the RLS WITH CHECK (organizations itself is not
   * RLS-governed — it is the tenant root, SPEC §2). This is the one
   * deliberate dataSource.transaction user that changes tenant context
   * mid-transaction, so it cannot go through TenancyService.run (one org per
   * transaction by design); SET LOCAL still dies with the transaction, so the
   * pooled connection is left fail-closed (migration 003 policies).
   */
  async seed(): Promise<SeedResult> {
    return this.dataSource.transaction(async (manager) => {
      await this.insertIfMissing(manager, Organization, ORGANIZATIONS);

      // Reads are RLS-scoped: every tenant read must happen while the org's
      // own context is set, so entities are collected per org inside the
      // loop (the final organizations read is context-free — tenant root).
      const orgUsers: User[] = [];
      const orgSurveys: Survey[] = [];
      const orgQuestions: Question[] = [];

      for (const orgSeed of ORG_SEEDS) {
        await manager.query(setTenantContextSql(orgSeed.organization.id));

        await this.insertIfMissing(manager, User, orgSeed.users);
        const users = await this.fetchUsersByIdOrEmail(manager, orgSeed.users);
        if (users.length !== orgSeed.users.length) {
          throw new Error(
            `seed: users for org ${orgSeed.organization.id} could not be inserted or resolved`,
          );
        }
        orgUsers.push(...users);

        await this.insertIfMissing(manager, Survey, [orgSeed.survey]);
        const survey = await manager
          .getRepository(Survey)
          .findOneBy({ id: orgSeed.survey.id });
        if (!survey) {
          throw new Error(
            `seed: survey ${orgSeed.survey.id} could not be inserted or resolved`,
          );
        }
        orgSurveys.push(survey);

        await this.insertIfMissing(manager, Question, orgSeed.questions);
        const questions = await manager.getRepository(Question).find({
          where: {
            surveyId: orgSeed.survey.id,
          } as FindOptionsWhere<Question>,
          order: { position: 'ASC' },
        });
        if (questions.length !== orgSeed.questions.length) {
          throw new Error(
            `seed: questions for survey ${orgSeed.survey.id} could not be inserted or resolved`,
          );
        }
        orgQuestions.push(...questions);
      }

      const organizations = await manager.getRepository(Organization).find({
        where: ORGANIZATIONS.map(({ id }) => ({
          id,
        })) as FindOptionsWhere<Organization>[],
        order: { name: 'ASC' },
      });

      return this.buildResult(
        organizations,
        orgUsers,
        orgSurveys,
        orgQuestions,
      );
    });
  }

  /**
   * INSERT … ON CONFLICT DO NOTHING (`orIgnore`). The re-read by natural keys
   * happens in the callers: for users the email UNIQUE constraint is an
   * alternate conflict target (review E-1), so a fixture-id/email drift
   * degrades to "existing row wins" instead of an unhandled 23505 → 500 on a
   * public route.
   */
  private async insertIfMissing<T extends object>(
    manager: EntityManager,
    entityClass: EntityTarget<T>,
    values: QueryDeepPartialEntity<T>[],
  ): Promise<void> {
    if (values.length === 0) {
      return;
    }
    await manager
      .createQueryBuilder()
      .insert()
      .into(entityClass)
      .values(values)
      .orIgnore()
      .execute();
  }

  /**
   * Resolves seeded users by id, falling back to email for any id that was
   * not found (email-conflict case, review E-1). Rows are returned in
   * fixture order; a row that exists under neither key is a hard error.
   */
  private async fetchUsersByIdOrEmail(
    manager: EntityManager,
    seeds: Array<{ id: string; email: string }>,
  ): Promise<User[]> {
    const ids = seeds.map(({ id }) => id);
    const byId = await manager.getRepository(User).find({
      where: ids.map((id) => ({ id })) as FindOptionsWhere<User>[],
    });
    const found = new Map(byId.map((user) => [user.id, user]));
    const result: User[] = [];
    for (const seed of seeds) {
      const stored = found.get(seed.id);
      if (stored) {
        result.push(stored);
        continue;
      }
      const byEmail = await manager.getRepository(User).findOneBy({
        email: seed.email,
      });
      if (!byEmail) {
        throw new Error(`seed: user ${seed.email} could not be resolved`);
      }
      result.push(byEmail);
    }
    return result;
  }

  private buildResult(
    organizations: Organization[],
    users: User[],
    surveys: Survey[],
    questions: Question[],
  ): SeedResult {
    const organizationName = new Map(
      organizations.map((organization) => [organization.id, organization.name]),
    );
    return {
      organizations: organizations.map(({ id, name }) => ({ id, name })),
      users: users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organization: organizationName.get(user.organizationId) ?? '',
      })),
      surveys: surveys.map((survey) => ({
        id: survey.id,
        title: survey.title,
        organization: organizationName.get(survey.organizationId) ?? '',
        questions: questions
          .filter((question) => question.surveyId === survey.id)
          .map(({ id, position, prompt, type }) => ({
            id,
            position,
            prompt,
            type,
          })),
      })),
    };
  }
}
