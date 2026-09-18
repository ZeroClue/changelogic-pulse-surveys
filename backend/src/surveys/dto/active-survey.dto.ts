import { type QuestionType } from '../../entities/enums';

export class ActiveSurveyQuestionDto {
  id!: string;
  position!: number;
  prompt!: string;
  type!: QuestionType;
}

export class ActiveSurveyDto {
  id!: string;
  title!: string;
  questions!: ActiveSurveyQuestionDto[];
}
