/**
 * Mirrors the backend contract (SPEC §5). Source of truth:
 * - backend/src/users/users.dto.ts (DemoUserDto)
 * - backend/src/surveys/dto/active-survey.dto.ts
 * - backend/src/surveys/dto/submit-response.dto.ts
 * - backend/src/responses/dto/created-response.dto.ts
 * - backend/src/summaries/dto/survey-summary.dto.ts
 * - backend/src/seed/seed-fixtures.ts (SeedResult)
 */

export type OrganizationRole = 'manager' | 'member';

export type QuestionType = 'rating' | 'yes_no';

/** GET /api/users — demo login list entry (DemoUserDto). */
export interface DemoUser {
  id: string;
  name: string;
  role: OrganizationRole;
  /** Organization name. */
  organization: string;
  /** Organization id — sent as X-Org-Id on sign-in. */
  organizationId: string;
}

/** GET /api/surveys/active (ActiveSurveyDto). */
export interface ActiveSurveyQuestion {
  id: string;
  position: number;
  prompt: string;
  type: QuestionType;
}

/** GET /api/surveys/active (ActiveSurveyDto). */
export interface ActiveSurvey {
  id: string;
  title: string;
  questions: ActiveSurveyQuestion[];
}

/** Body of POST /api/surveys/:surveyId/responses (SubmitResponseDto). */
export interface SubmitAnswerInput {
  questionId: string;
  /** Required iff the question type is `rating`; 1–5. */
  ratingValue?: number;
  /** Required iff the question type is `yes_no`. */
  boolValue?: boolean;
}

export interface SubmitResponseInput {
  answers: SubmitAnswerInput[];
}

/** One answered question inside a CreatedResponse (CreatedAnswerDto). */
export interface CreatedAnswer {
  questionId: string;
  ratingValue: number | null;
  boolValue: boolean | null;
}

/** 201 payload of POST /api/surveys/:surveyId/responses (CreatedResponseDto). */
export interface CreatedResponse {
  id: string;
  surveyId: string;
  respondentId: string;
  /** Monday (YYYY-MM-DD) of the submission week, computed server-side. */
  weekStart: string;
  answers: CreatedAnswer[];
}

/** Per-question rollup for a `rating` question (RatingQuestionRollupDto). */
export interface RatingQuestionRollup {
  questionId: string;
  position: number;
  prompt: string;
  type: 'rating';
  /** Mean of submitted ratings rounded to 2 decimals; null when no answers. */
  average: number | null;
  count: number;
}

/** Per-question rollup for a `yes_no` question (YesNoQuestionRollupDto). */
export interface YesNoQuestionRollup {
  questionId: string;
  position: number;
  prompt: string;
  type: 'yes_no';
  yesCount: number;
  noCount: number;
  count: number;
}

export type QuestionRollup = RatingQuestionRollup | YesNoQuestionRollup;

/** GET /api/surveys/:surveyId/summary (SurveySummaryDto). */
export interface SurveySummary {
  /** Monday (YYYY-MM-DD) of the summarized calendar week. */
  weekStart: string;
  /** Responses submitted for this survey in the summarized week. */
  completionCount: number;
  /** completionCount / org member count (0 when the org has no members). */
  completionRate: number;
  perQuestion: QuestionRollup[];
}

/**
 * POST /api/seed payload (SeedResult) — public, idempotent, dev-only.
 */
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

/** Error JSON the API returns, e.g. {statusCode: 403, message: '...'}. */
export interface ApiErrorBody {
  statusCode: number;
  message: string | string[];
}
