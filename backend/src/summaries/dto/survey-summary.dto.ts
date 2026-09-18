export class RatingQuestionRollupDto {
  questionId!: string;
  position!: number;
  prompt!: string;
  type!: 'rating';
  /** Mean of submitted ratings, rounded to 2 decimals; null when no answers. */
  average!: number | null;
  count!: number;
}

export class YesNoQuestionRollupDto {
  questionId!: string;
  position!: number;
  prompt!: string;
  type!: 'yes_no';
  yesCount!: number;
  noCount!: number;
  count!: number;
}

export type QuestionRollupDto =
  RatingQuestionRollupDto | YesNoQuestionRollupDto;

export class SurveySummaryDto {
  /** Monday (YYYY-MM-DD) of the summarized calendar week (SPEC §3). */
  weekStart!: string;
  /**
   * Responses submitted for THIS SURVEY in the summarized week (N-8: the
   * survey-scoped reading of SPEC §5 — with one-active-survey-per-org this
   * coincides with the org-wide count).
   */
  completionCount!: number;
  /** completionCount ÷ member count of the org; 0 when the org has no members. */
  completionRate!: number;
  perQuestion!: QuestionRollupDto[];
}
