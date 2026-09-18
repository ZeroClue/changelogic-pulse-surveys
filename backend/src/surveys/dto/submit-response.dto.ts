import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

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
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers!: SubmitAnswerDto[];
}
