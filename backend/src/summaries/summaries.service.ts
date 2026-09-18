import { Injectable, NotFoundException } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { OrganizationsService } from '../organizations/organizations.service';
import { TenancyService } from '../common/tenancy/tenancy.service';
import { type RequestUser } from '../common/request-user';
import { Survey } from '../entities/survey.entity';
import { type QuestionType } from '../entities/enums';
import { currentWeekStart, parseMondayWeekParam } from '../common/weeks';
import {
  type QuestionRollupDto,
  type RatingQuestionRollupDto,
  type SurveySummaryDto,
  type YesNoQuestionRollupDto,
} from './dto/survey-summary.dto';

interface RollupRow {
  question_id: string;
  position: number;
  prompt: string;
  type: QuestionType;
  answer_count: number;
  rating_average: number | null;
  yes_count: number;
  no_count: number;
}

interface CompletionCountRow {
  completion_count: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Manager weekly summary (SPEC §5, review B-2). All reads happen inside the
 * caller's tenant transaction: RLS scopes surveys/questions/responses/answers
 * to the caller's org (cross-org survey ids yield empty → 404) and the member
 * count denominator is computed in the same tx (SPEC §2). Per-question
 * rollups come from a single aggregate query (JOIN + FILTER aggregates).
 */
@Injectable()
export class SummariesService {
  constructor(
    private readonly tenancy: TenancyService,
    private readonly organizationsService: OrganizationsService,
  ) {}

  async getSummary(
    surveyId: string,
    actor: RequestUser,
    week?: string,
  ): Promise<SurveySummaryDto> {
    // Controller DTO validation (S-4) already guarantees Monday-or-absent;
    // the strict parse here keeps the service correct for direct callers.
    const weekStart =
      week === undefined ? currentWeekStart() : parseMondayWeekParam(week);
    if (!weekStart) {
      throw new NotFoundException('Invalid week parameter');
    }

    return this.tenancy.run(actor.organizationId, async (manager) => {
      const survey = await manager.getRepository(Survey).findOne({
        where: { id: surveyId, organizationId: actor.organizationId },
      });
      // Missing or cross-org (RLS yields empty) → 404 (SPEC §5 errors).
      if (!survey) {
        throw new NotFoundException('Survey not found');
      }

      // SEQUENTIAL, deliberately: all three reads share the one transaction
      // connection — concurrent queries on the same pg client (Promise.all
      // over manager.query) are unsupported by the driver.
      const rollups = await this.questionRollups(
        manager,
        surveyId,
        actor.organizationId,
        weekStart,
      );
      const completionCount = await this.completionCount(
        manager,
        surveyId,
        actor.organizationId,
        weekStart,
      );
      const memberCount = await this.organizationsService.memberCount(
        manager,
        actor.organizationId,
      );

      // Guard divide-by-zero → 0 (SPEC §5).
      const completionRate =
        memberCount === 0 ? 0 : completionCount / memberCount;

      return {
        weekStart,
        completionCount,
        completionRate,
        perQuestion: rollups,
      };
    });
  }

  /**
   * One aggregate query: LEFT JOIN answers (restricted to responses of this
   * survey + week via EXISTS) against the survey's questions, with FILTER
   * aggregates for rating averages and yes/no counts. Numeric fields are cast
   * ::int / ::float8 in SQL so pg returns JS numbers, not strings.
   */
  private async questionRollups(
    manager: EntityManager,
    surveyId: string,
    organizationId: string,
    weekStart: string,
  ): Promise<QuestionRollupDto[]> {
    const rows = await manager.query<RollupRow[]>(
      `SELECT
         q.id::text AS question_id,
         q.position::int AS position,
         q.prompt,
         q.type::text AS type,
         COUNT(a.id)::int AS answer_count,
         AVG(a.rating_value)::float8 AS rating_average,
         COUNT(a.id) FILTER (WHERE a.bool_value = true)::int AS yes_count,
         COUNT(a.id) FILTER (WHERE a.bool_value = false)::int AS no_count
       FROM questions q
       LEFT JOIN answers a
         ON a.question_id = q.id
        AND EXISTS (
          SELECT 1 FROM responses r
          WHERE r.id = a.response_id
            AND r.survey_id = $1
            AND r.week_start = $2
        )
       WHERE q.survey_id = $1
         AND q.organization_id = $3
       GROUP BY q.id, q.position, q.prompt, q.type
       ORDER BY q.position`,
      [surveyId, weekStart, organizationId],
    );

    return rows.map((row): QuestionRollupDto => {
      const ratingAverage = row.rating_average;
      if (row.type === 'rating') {
        const rollup: RatingQuestionRollupDto = {
          questionId: row.question_id,
          position: row.position,
          prompt: row.prompt,
          type: 'rating',
          average: ratingAverage === null ? null : round2(ratingAverage),
          count: row.answer_count,
        };
        return rollup;
      }
      const rollup: YesNoQuestionRollupDto = {
        questionId: row.question_id,
        position: row.position,
        prompt: row.prompt,
        type: 'yes_no',
        yesCount: row.yes_count,
        noCount: row.no_count,
        count: row.answer_count,
      };
      return rollup;
    });
  }

  /**
   * Responses for THIS survey in the week (N-8: survey-scoped reading of
   * SPEC §5). RLS scopes the count; the org filter is defense in depth.
   */
  private async completionCount(
    manager: EntityManager,
    surveyId: string,
    organizationId: string,
    weekStart: string,
  ): Promise<number> {
    const rows = await manager.query<CompletionCountRow[]>(
      `SELECT COUNT(*)::int AS completion_count
       FROM responses r
       WHERE r.survey_id = $1
         AND r.week_start = $2
         AND r.organization_id = $3`,
      [surveyId, weekStart, organizationId],
    );
    return rows[0]?.completion_count ?? 0;
  }
}
