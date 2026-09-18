import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Organization } from '../entities/organization.entity';
import { Question } from '../entities/question.entity';
import { Survey } from '../entities/survey.entity';
import { User } from '../entities/user.entity';
import { setTenantContextSql } from '../common/tenancy/with-tenant-tx';
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

@Injectable()
export class SeedService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Idempotent fixture seeding (SPEC §5): 2 organizations, 1 manager + 1
   * member each, one active 3-question survey per org. Deterministic ids make
   * re-runs safe upserts. Everything happens in ONE transaction; for each org
   * the tenant context is set with SET LOCAL so every insert passes the RLS
   * WITH CHECK (organizations itself is not RLS-governed — it is the tenant
   * root, SPEC §2).
   */
  async seed(): Promise<SeedResult> {
    return this.dataSource.transaction(async (manager) => {
      await manager.upsert(Organization, ORGANIZATIONS, ['id']);

      for (const orgSeed of ORG_SEEDS) {
        await manager.query(setTenantContextSql(orgSeed.organization.id));
        await manager.upsert(User, orgSeed.users, ['id']);
        await manager.upsert(Survey, [orgSeed.survey], ['id']);
        await manager.upsert(Question, orgSeed.questions, ['id']);
      }

      return {
        organizations: ORGANIZATIONS.map(({ id, name }) => ({ id, name })),
        users: ORG_SEEDS.flatMap((orgSeed) =>
          orgSeed.users.map((user) => ({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: orgSeed.organization.name,
          })),
        ),
        surveys: ORG_SEEDS.map((orgSeed) => ({
          id: orgSeed.survey.id,
          title: orgSeed.survey.title,
          organization: orgSeed.organization.name,
          questions: orgSeed.questions.map(
            ({ id, position, prompt, type }) => ({
              id,
              position,
              prompt,
              type,
            }),
          ),
        })),
      };
    });
  }
}
