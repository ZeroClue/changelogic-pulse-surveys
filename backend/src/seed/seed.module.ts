import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { Question } from '../entities/question.entity';
import { Survey } from '../entities/survey.entity';
import { User } from '../entities/user.entity';
import { SeedController } from './seed.controller';
import { SeedService } from './seed.service';

// The seed flow is the only consumer of Organization/User/Survey/Question
// entity metadata in this slice (upsert-style fixture writes), so the
// entities are registered here.
@Module({
  imports: [TypeOrmModule.forFeature([Organization, User, Survey, Question])],
  controllers: [SeedController],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
