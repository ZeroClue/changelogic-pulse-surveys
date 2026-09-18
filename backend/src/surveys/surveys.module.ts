import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from '../entities/survey.entity';
import { QuestionsModule } from '../questions/questions.module';
import { ResponsesModule } from '../responses/responses.module';
import { SummariesModule } from '../summaries/summaries.module';
import { SurveysController } from './surveys.controller';
import { SurveysService } from './surveys.service';

/**
 * Hosts ALL /surveys/* routes in one controller (review A-4): responses and
 * summary handlers delegate to ResponsesService and SummariesService
 * (imported modules), so no cross-module route-ordering dependence exists.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Survey]),
    QuestionsModule,
    ResponsesModule,
    SummariesModule,
  ],
  controllers: [SurveysController],
  providers: [SurveysService],
  exports: [SurveysService],
})
export class SurveysModule {}
