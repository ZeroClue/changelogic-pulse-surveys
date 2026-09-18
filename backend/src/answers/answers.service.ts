import { Injectable } from '@nestjs/common';
import { type EntityManager } from 'typeorm';
import { Answer } from '../entities/answer.entity';
import { type AnswerValueInput } from '../responses/dto/created-response.dto';

/**
 * Tenant-scoped answer writes. Methods REQUIRE the transactional
 * EntityManager from TenancyService.run (review A-1) — no pool fallback.
 */
@Injectable()
export class AnswersService {
  /**
   * Bulk-creates the answers of one response inside the caller's transaction.
   * `rating_value`/`bool_value` exclusivity is re-checked by the DB CHECK
   * (ck_answers_exactly_one_value); the service-level validation happened in
   * ResponsesService before this call.
   */
  async createForResponse(
    manager: EntityManager,
    organizationId: string,
    responseId: string,
    values: AnswerValueInput[],
  ): Promise<void> {
    const entities = values.map((value) => ({
      organizationId,
      responseId,
      questionId: value.questionId,
      ratingValue: value.ratingValue ?? null,
      boolValue: value.boolValue ?? null,
    }));
    await manager.getRepository(Answer).insert(entities);
  }
}
