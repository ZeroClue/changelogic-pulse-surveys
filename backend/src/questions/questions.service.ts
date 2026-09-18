import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { Question } from '../entities/question.entity';

@Injectable()
export class QuestionsService {
  constructor(
    @InjectRepository(Question)
    private readonly questionsRepository: Repository<Question>,
  ) {}

  /** Questions of a survey ordered by position, optionally inside a tenant tx. */
  findBySurvey(surveyId: string, manager?: EntityManager): Promise<Question[]> {
    const repository = manager
      ? manager.getRepository(Question)
      : this.questionsRepository;
    return repository.find({
      where: { surveyId },
      order: { position: 'ASC' },
    });
  }
}
