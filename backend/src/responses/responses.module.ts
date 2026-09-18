import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Response } from '../entities/response.entity';
import { ResponsesService } from './responses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Response])],
  providers: [ResponsesService],
  exports: [ResponsesService],
})
export class ResponsesModule {}
