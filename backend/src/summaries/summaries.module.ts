import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from '../entities/survey.entity';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SummariesService } from './summaries.service';

@Module({
  imports: [TypeOrmModule.forFeature([Survey]), OrganizationsModule],
  providers: [SummariesService],
  exports: [SummariesService],
})
export class SummariesModule {}
