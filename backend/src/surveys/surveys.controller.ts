import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { type RequestUser } from '../common/request-user';
import { SummariesService } from '../summaries/summaries.service';
import { type SurveySummaryDto } from '../summaries/dto/survey-summary.dto';
import { SummaryQueryDto } from '../summaries/dto/summary-query.dto';
import { type CreatedResponseDto } from '../responses/dto/created-response.dto';
import { ResponsesService } from '../responses/responses.service';
import { ActiveSurveyDto } from './dto/active-survey.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { SurveysService } from './surveys.service';

/**
 * ALL /surveys/* routes live in this single controller (review A-4): route
 * precedence no longer depends on module import order across modules, and the
 * `active` static segment can never be shadowed by a future `:id` route
 * declared elsewhere. The summary handler stays a thin delegation — the
 * logic remains in SummariesService (injected).
 */
@Controller('surveys')
export class SurveysController {
  constructor(
    private readonly surveysService: SurveysService,
    private readonly responsesService: ResponsesService,
    private readonly summariesService: SummariesService,
  ) {}

  /** Caller's org active survey with ordered questions (member + manager). */
  @Get('active')
  getActiveSurvey(@CurrentUser() actor: RequestUser): Promise<ActiveSurveyDto> {
    return this.surveysService.getActiveSurvey(actor.organizationId);
  }

  /** Member-only weekly submission (SPEC §5). */
  @Post(':surveyId/responses')
  @Roles('member')
  submitResponse(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @CurrentUser() actor: RequestUser,
    @Body() dto: SubmitResponseDto,
  ): Promise<CreatedResponseDto> {
    return this.responsesService.createResponse(surveyId, actor, dto);
  }

  /** Manager-only weekly summary (SPEC §5). `?week=YYYY-MM-DD` (a Monday). */
  @Get(':surveyId/summary')
  @Roles('manager')
  getSummary(
    @Param('surveyId', ParseUUIDPipe) surveyId: string,
    @CurrentUser() actor: RequestUser,
    @Query() query: SummaryQueryDto,
  ): Promise<SurveySummaryDto> {
    return this.summariesService.getSummary(surveyId, actor, query.week);
  }
}
