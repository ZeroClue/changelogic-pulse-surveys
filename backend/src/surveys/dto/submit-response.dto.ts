import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Enforces "exactly one of ratingValue / boolValue" per answer (SPEC §1: the
 * DB CHECK cannot cross tables; the value-type-vs-question-type match is
 * validated in the service, this catches both/neither at the boundary).
 * `null` counts as "absent" so explicit nulls can never pass by accident.
 */
@ValidatorConstraint({ name: 'exactlyOneAnswerValue', async: false })
export class ExactlyOneAnswerValueConstraint implements ValidatorConstraintInterface {
  validate(answer: unknown): boolean {
    if (typeof answer !== 'object' || answer === null) {
      return false;
    }
    const record = answer as Record<string, unknown>;
    const hasRating = record['ratingValue'] != null;
    const hasBool = record['boolValue'] != null;
    return hasRating !== hasBool;
  }

  defaultMessage(): string {
    return 'exactly one of ratingValue or boolValue must be provided per answer';
  }
}

/** Rejects duplicate questionIds within the answers array (review S-2). */
@ValidatorConstraint({ name: 'uniqueQuestionIds', async: false })
export class UniqueQuestionIdsConstraint implements ValidatorConstraintInterface {
  validate(answers: unknown): boolean {
    if (!Array.isArray(answers)) {
      return false;
    }
    const ids = answers.map((answer) =>
      typeof answer === 'object' && answer !== null
        ? (answer as Record<string, unknown>)['questionId']
        : undefined,
    );
    return ids.every(
      (id) => typeof id === 'string' && ids.indexOf(id) === ids.lastIndexOf(id),
    );
  }

  defaultMessage(): string {
    return 'each question must be answered at most once (no duplicate questionIds)';
  }
}

export class SubmitAnswerDto {
  @IsUUID()
  questionId!: string;

  /** Required iff the question type is `rating`; must be 1–5 (SPEC §1/§5). */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  ratingValue?: number;

  /** Required iff the question type is `yes_no`. */
  @IsOptional()
  @IsBoolean()
  boolValue?: boolean;
}

export class SubmitResponseDto {
  /** Questions are capped at 3 per survey (SPEC §1). */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Validate(ExactlyOneAnswerValueConstraint, { each: true })
  @Validate(UniqueQuestionIdsConstraint)
  @Type(() => SubmitAnswerDto)
  answers!: SubmitAnswerDto[];
}
