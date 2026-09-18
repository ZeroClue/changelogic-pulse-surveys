import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { type RequestUser } from '../common/request-user';
import { ActiveSurveyDto } from './dto/active-survey.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { SurveysService } from './surveys.service';

@Controller('surveys')
export class SurveysController {
  constructor(private readonly surveysService: SurveysService) {}

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
  ): Promise<{ id: string; weekStart: string }> {
    return this.surveysService.submitResponse(surveyId, actor, dto);
  }
}
