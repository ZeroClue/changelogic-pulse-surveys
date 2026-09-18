import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from './common/db/snake-naming.strategy';
import { RolesGuard } from './common/guards/roles.guard';
import { UserGuard } from './common/guards/user.guard';
import { AnswersModule } from './answers/answers.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { QuestionsModule } from './questions/questions.module';
import { ResponsesModule } from './responses/responses.module';
import { SeedModule } from './seed/seed.module';
import { SummariesModule } from './summaries/summaries.module';
import { SurveysModule } from './surveys/surveys.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.getOrThrow<string>('DATABASE_URL'),
        // Database columns are snake_case (migrations are hand-written SQL);
        // map camelCase entity properties accordingly. synchronize stays off.
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    UsersModule,
    OrganizationsModule,
    SurveysModule,
    QuestionsModule,
    ResponsesModule,
    AnswersModule,
    SummariesModule,
    SeedModule,
  ],
  providers: [
    // Order matters: user resolution first, then role enforcement.
    { provide: APP_GUARD, useClass: UserGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
