import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { AnswersService } from '../answers/answers.service';
import { pgErrorCode } from '../common/db/pg-error';
import { TenancyService } from '../common/tenancy/tenancy.service';
import { currentWeekStart } from '../common/weeks';
import { type RequestUser } from '../common/request-user';
import { Question } from '../entities/question.entity';
import { Survey } from '../entities/survey.entity';
import { Response } from '../entities/response.entity';
import { QuestionsService } from '../questions/questions.service';
import {
  type AnswerValueInput,
  type CreatedResponseDto,
} from './dto/created-response.dto';
import { type SubmitResponseDto } from '../surveys/dto/submit-response.dto';

const UNIQUE_VIOLATION = '23505';

/**
 * Response submission flow (SPEC §5, review B-1). Everything runs inside ONE
 * tenant transaction opened by TenancyService.run: the duplicate pre-check,
 * the response insert and the answer bulk-insert are atomic, and RLS
 * (WITH CHECK) enforces the org context (SPEC §2).
 */
@Injectable()
export class ResponsesService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly questionsService: QuestionsService,
    private readonly answersService: AnswersService,
  ) {}

  async createResponse(
    surveyId: string,
    actor: RequestUser,
    dto: SubmitResponseDto,
  ): Promise<CreatedResponseDto> {
    this.assertNoDuplicateQuestions(dto);
    return this.tenancy.run(actor.organizationId, async (manager) => {
      const survey = await manager.getRepository(Survey).findOne({
        where: {
          id: surveyId,
          organizationId: actor.organizationId,
          isActive: true,
        },
      });
      // Missing, cross-org (RLS yields empty) or inactive surveys are all 404.
      if (!survey) {
        throw new NotFoundException('Survey not found or not active');
      }

      // Duplicate-submission check BEFORE payload validation: one response per
      // member per calendar week per survey is a state property, so ANY second
      // submission this week → 409 (SPEC §5), regardless of the body shape.
      const weekStart = currentWeekStart();
      const existing = await this.findExisting(
        manager,
        surveyId,
        actor.userId,
        weekStart,
      );
      if (existing) {
        throw new ConflictException(
          'A response was already submitted for this survey this week',
        );
      }

      const questions = await this.questionsService.findBySurvey(
        manager,
        surveyId,
      );
      const values = this.validateAnswers(dto, questions);

      let response: Response;
      try {
        response = await manager.getRepository(Response).save({
          organizationId: actor.organizationId,
          surveyId,
          respondentId: actor.userId,
          weekStart,
        });
      } catch (error) {
        // Concurrent double-submits lose the race at the unique constraint
        // (uq_responses_survey_respondent_week): map 23505 → 409 (SPEC §5).
        if (pgErrorCode(error) === UNIQUE_VIOLATION) {
          throw new ConflictException(
            'A response was already submitted for this survey this week',
          );
        }
        throw error;
      }

      await this.answersService.createForResponse(
        manager,
        actor.organizationId,
        response.id,
        values,
      );

      const answers = values.map((value) => ({
        questionId: value.questionId,
        ratingValue: value.ratingValue ?? null,
        boolValue: value.boolValue ?? null,
      }));
      return {
        id: response.id,
        surveyId,
        respondentId: actor.userId,
        weekStart,
        answers,
      };
    });
  }

  /**
   * Answers must cover all and only the survey's questions, each exactly
   * once, with the value type matching the question type (SPEC §5). Duplicate
   * questionIds are rejected here as well as at the DTO boundary (review S-2).
   */
  private validateAnswers(
    dto: SubmitResponseDto,
    questions: Question[],
  ): AnswerValueInput[] {
    const byId = new Map(questions.map((question) => [question.id, question]));
    const values: AnswerValueInput[] = [];

    for (const answer of dto.answers) {
      const question = byId.get(answer.questionId);
      if (!question) {
        throw new BadRequestException(
          `Question ${answer.questionId} does not belong to this survey`,
        );
      }
      byId.delete(answer.questionId);
      if (question.type === 'rating') {
        if (answer.ratingValue == null || answer.boolValue != null) {
          throw new BadRequestException(
            `Question ${question.id} is a rating question and requires ratingValue (1–5) only`,
          );
        }
        values.push({
          questionId: question.id,
          ratingValue: answer.ratingValue,
        });
      } else {
        if (answer.boolValue == null || answer.ratingValue != null) {
          throw new BadRequestException(
            `Question ${question.id} is a yes/no question and requires boolValue only`,
          );
        }
        values.push({
          questionId: question.id,
          boolValue: answer.boolValue,
        });
      }
    }

    if (byId.size > 0) {
      const missing = [...byId.values()]
        .map((question) => question.id)
        .join(', ');
      throw new BadRequestException(
        `Missing answers for questions: ${missing}`,
      );
    }
    return values;
  }

  private assertNoDuplicateQuestions(dto: SubmitResponseDto): void {
    const seen = new Set<string>();
    for (const answer of dto.answers) {
      if (seen.has(answer.questionId)) {
        throw new BadRequestException(
          `Duplicate answer for question ${answer.questionId}`,
        );
      }
      seen.add(answer.questionId);
    }
  }

  private findExisting(
    manager: EntityManager,
    surveyId: string,
    respondentId: string,
    weekStart: string,
  ): Promise<Response | null> {
    return manager.getRepository(Response).findOne({
      where: { surveyId, respondentId, weekStart },
    });
  }
}
