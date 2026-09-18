import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from '../entities/response.entity';
import { AnswersModule } from '../answers/answers.module';
import { QuestionsModule } from '../questions/questions.module';
import { ResponsesService } from './responses.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Response]),
    QuestionsModule,
    AnswersModule,
  ],
  providers: [ResponsesService],
  exports: [ResponsesService],
})
export class ResponsesModule {}
