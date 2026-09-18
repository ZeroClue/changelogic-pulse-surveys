export class CreatedAnswerDto {
  questionId!: string;
  ratingValue!: number | null;
  boolValue!: boolean | null;
}

/** Payload of `POST /api/surveys/:surveyId/responses` (201, SPEC §5). */
export class CreatedResponseDto {
  id!: string;
  surveyId!: string;
  respondentId!: string;
  /** Monday (YYYY-MM-DD) of the submission week, computed server-side (SPEC §3). */
  weekStart!: string;
  answers!: CreatedAnswerDto[];
}

export interface AnswerValueInput {
  questionId: string;
  ratingValue?: number;
  boolValue?: boolean;
}
