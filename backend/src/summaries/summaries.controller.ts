import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { type RequestUser } from '../common/request-user';
import { SurveySummaryDto } from './dto/survey-summary.dto';
import { SummariesService } from './summaries.service';

@Controller('surveys')
export class SummariesController {
  constructor(private readonly summariesService: SummariesService) {}

  /** Manager-only weekly summary (SPEC §5). `?week=YYYY-MM-DD` (a Monday). */
  @Get(':surveyId/summary')
  @Roles('manager')
  getSummary(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @CurrentUser() actor: RequestUser,
    @Query('week') week?: string,
  ): Promise<SurveySummaryDto> {
    return this.summariesService.getSummary(surveyId, actor, week);
  }
}
