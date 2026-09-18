export class RatingQuestionRollupDto {
  questionId!: string;
  position!: number;
  prompt!: string;
  type!: 'rating';
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
  /** Responses submitted in that week, org-wide. */
  completionCount!: number;
  /** completionCount ÷ member count of the org. */
  completionRate!: number;
  perQuestion!: QuestionRollupDto[];
}
