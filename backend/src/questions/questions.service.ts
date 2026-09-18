import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Question } from '../entities/question.entity';

/**
 * Tenant-scoped question reads. Methods REQUIRE the transactional
 * EntityManager from TenancyService.run (review A-1): there is no pool
 * fallback, so RLS-scoped usage is compiler-enforced — a call outside a
 * tenant transaction cannot compile a path to the shared pool.
 */
@Injectable()
export class QuestionsService {
  /** Questions of a survey ordered by position, RLS-scoped inside the tx. */
  findBySurvey(manager: EntityManager, surveyId: string): Promise<Question[]> {
    return manager.getRepository(Question).find({
      where: { surveyId },
      order: { position: 'ASC' },
    });
  }
}
