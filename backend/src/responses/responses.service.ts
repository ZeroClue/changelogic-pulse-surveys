import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from '../entities/response.entity';

@Injectable()
export class ResponsesService {
  constructor(
    @InjectRepository(Response)
    private readonly responsesRepository: Repository<Response>,
  ) {}

  /** Tenant-scoped find; call inside withTenantTx for RLS enforcement. */
  findForSurveyAndRespondent(
    surveyId: string,
    respondentId: string,
    weekStart: string,
  ): Promise<Response | null> {
    return this.responsesRepository.findOne({
      where: { surveyId, respondentId, weekStart },
    });
  }
}
