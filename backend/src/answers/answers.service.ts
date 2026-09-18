import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Answer } from '../entities/answer.entity';

@Injectable()
export class AnswersService {
  constructor(
    @InjectRepository(Answer)
    private readonly answersRepository: Repository<Answer>,
  ) {}

  /** Answers of a response; call inside withTenantTx for RLS enforcement. */
  findByResponse(responseId: string): Promise<Answer[]> {
    return this.answersRepository.find({ where: { responseId } });
  }
}
