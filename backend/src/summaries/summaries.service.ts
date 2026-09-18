import { Injectable, NotImplementedException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { type RequestUser } from '../common/request-user';
import { type SurveySummaryDto } from './dto/survey-summary.dto';

@Injectable()
export class SummariesService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * TODO(next commit): implement per SPEC §5:
   *  - resolve `week` query param (a Monday) or default to the current
   *    Monday of the submission week, server timezone (SPEC §3)
   *  - inside withTenantTx: count this week's responses, member count of the
   *    org, per-question rating avg/count and yes/no counts (RLS-scoped)
   *  - completionRate = responses this week ÷ member count
   *  - cross-org survey id must yield 404 (RLS empty + org filter).
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- scaffold stub keeps the async service signature
  async getSummary(
    _surveyId: string,
    _actor: RequestUser,
    _week?: string,
  ): Promise<SurveySummaryDto> {
    void _surveyId;
    void _actor;
    void _week;
    // Deliberate scaffold stub: summary math lands in the next commit.
    throw new NotImplementedException('Summary is not implemented yet');
  }
}
