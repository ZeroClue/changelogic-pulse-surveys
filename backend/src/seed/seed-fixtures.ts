import { type OrganizationRole, type QuestionType } from '../entities/enums';

/**
 * Deterministic fixture identities (SPEC §1/§4): stable across resets so the
 * UI login dropdown and demo flows never change. Re-seeding upserts on these
 * ids and is idempotent.
 */

export const ORG_A_ID = '00000000-0000-4000-8000-000000000001';
export const ORG_B_ID = '00000000-0000-4000-8000-000000000002';

export const USER_A_MANAGER_ID = '00000000-0000-4000-8000-000000000011';
export const USER_A_MEMBER_ID = '00000000-0000-4000-8000-000000000012';
export const USER_B_MANAGER_ID = '00000000-0000-4000-8000-000000000021';
export const USER_B_MEMBER_ID = '00000000-0000-4000-8000-000000000022';

export const SURVEY_A_ID = '00000000-0000-4000-8000-000000000101';
export const SURVEY_B_ID = '00000000-0000-4000-8000-000000000201';

export const QUESTION_A1_ID = '00000000-0000-4000-8000-000000000111';
export const QUESTION_A2_ID = '00000000-0000-4000-8000-000000000112';
export const QUESTION_A3_ID = '00000000-0000-4000-8000-000000000113';
export const QUESTION_B1_ID = '00000000-0000-4000-8000-000000000211';
export const QUESTION_B2_ID = '00000000-0000-4000-8000-000000000212';
export const QUESTION_B3_ID = '00000000-0000-4000-8000-000000000213';

export interface SeedUser {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: OrganizationRole;
}

export interface SeedQuestion {
  id: string;
  surveyId: string;
  position: number;
  prompt: string;
  type: QuestionType;
}

export interface SeedSurvey {
  id: string;
  organizationId: string;
  title: string;
  isActive: boolean;
}

export interface SeedOrganization {
  id: string;
  name: string;
}

export interface SeedResult {
  organizations: Array<{ id: string; name: string }>;
  users: Array<{
    id: string;
    name: string;
    email: string;
    role: OrganizationRole;
    organization: string;
  }>;
  surveys: Array<{
    id: string;
    title: string;
    organization: string;
    questions: Array<{
      id: string;
      position: number;
      prompt: string;
      type: QuestionType;
    }>;
  }>;
}
