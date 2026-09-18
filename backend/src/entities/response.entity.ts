import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Organization } from './organization.entity';
import { Survey } from './survey.entity';
import { User } from './user.entity';

@Entity('responses')
export class Response {
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

  @Column({ type: 'uuid' })
  respondentId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'respondent_id' })
  respondent!: User;

  @Column({ type: 'date' })
  weekStart!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  submittedAt!: Date;
}
