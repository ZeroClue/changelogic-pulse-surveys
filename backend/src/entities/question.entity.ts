import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { QUESTION_TYPES, type QuestionType } from './enums';
import { Organization } from './organization.entity';
import { Survey } from './survey.entity';

@Entity('questions')
export class Question {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid' })
  surveyId!: string;

  @ManyToOne(() => Survey)
  @JoinColumn({ name: 'survey_id' })
  survey!: Survey;

  @Column({ type: 'smallint' })
  position!: number;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({
    type: 'enum',
    enum: [...QUESTION_TYPES],
    enumName: 'question_type',
  })
  type!: QuestionType;
}
