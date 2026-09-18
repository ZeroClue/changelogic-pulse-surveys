import { Injectable, NotFoundException } from '@nestjs/common';
import { NotImplementedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Question } from '../entities/question.entity';
import { Survey } from '../entities/survey.entity';
import { withTenantTx } from '../common/tenancy/with-tenant-tx';
import { type RequestUser } from '../common/request-user';
import { type ActiveSurveyDto } from './dto/active-survey.dto';
import { type SubmitResponseDto } from './dto/submit-response.dto';

@Injectable()
export class SurveysService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * The caller's org active survey with questions ordered by position. Runs
   * inside a tenant transaction (SET LOCAL app.current_organization_id) so
   * RLS enforces isolation; the org filter is defense in depth (SPEC §2).
   * Cross-org surveys are never visible; RLS yields empty → 404.
   */
  async getActiveSurvey(organizationId: string): Promise<ActiveSurveyDto> {
    return withTenantTx(this.dataSource, organizationId, async (manager) => {
      const survey = await manager.getRepository(Survey).findOne({
        where: { organizationId, isActive: true },
      });
      if (!survey) {
        throw new NotFoundException('No active survey for this organization');
      }

      const questions = await manager.getRepository(Question).find({
        where: { surveyId: survey.id },
        order: { position: 'ASC' },
      });

      return {
        id: survey.id,
        title: survey.title,
        questions: questions.map((question) => ({
          id: question.id,
          position: question.position,
          prompt: question.prompt,
          type: question.type,
        })),
      };
    });
  }

  /**
   * TODO(next commit): implement submission per SPEC §5:
   *  - survey must belong to the caller's org and be active (else 404)
   *  - questions must belong to the survey (else 400/404)
   *  - value type must match the question type; rating ∈ 1–5 (else 400)
   *  - second response in the same calendar week (Monday-based) → 409
   *  - persist response + answers inside withTenantTx, week_start = Monday
   *    of the submission week, stored server-side (SPEC §3).
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- scaffold stub keeps the async service signature
  async submitResponse(
    _surveyId: string,
    _actor: RequestUser,
    _dto: SubmitResponseDto,
  ): Promise<{ id: string; weekStart: string }> {
    void _surveyId;
    void _actor;
    void _dto;
    // Deliberate scaffold stub: response submission is implemented in the
    // next commit (see the TODO above); DTO validation and guards are live.
    throw new NotImplementedException(
      'Response submission is not implemented yet',
    );
  }
}
