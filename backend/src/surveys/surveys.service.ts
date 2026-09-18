import { Injectable, NotFoundException } from '@nestjs/common';
import { TenancyService } from '../common/tenancy/tenancy.service';
import { QuestionsService } from '../questions/questions.service';
import { Survey } from '../entities/survey.entity';
import { type ActiveSurveyDto } from './dto/active-survey.dto';

@Injectable()
export class SurveysService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly questionsService: QuestionsService,
  ) {}

  /**
   * The caller's org active survey with questions ordered by position. Runs
   * inside a tenant transaction (SET LOCAL app.current_organization_id) so
   * RLS enforces isolation; the org filter is defense in depth (SPEC §2).
   * Cross-org surveys are never visible; RLS yields empty → 404.
   */
  async getActiveSurvey(organizationId: string): Promise<ActiveSurveyDto> {
    return this.tenancy.run(organizationId, async (manager) => {
      const survey = await manager.getRepository(Survey).findOne({
        where: { organizationId, isActive: true },
      });
      if (!survey) {
        throw new NotFoundException('No active survey for this organization');
      }

      const questions = await this.questionsService.findBySurvey(
        manager,
        survey.id,
      );

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
}
