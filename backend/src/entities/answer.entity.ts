import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { JoinColumn } from 'typeorm';
import { Organization } from './organization.entity';
import { Question } from './question.entity';
import { Response } from './response.entity';

@Entity('answers')
export class Answer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'uuid' })
  responseId!: string;

  @ManyToOne(() => Response, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'response_id' })
  response!: Response;

  @Column({ type: 'uuid' })
  questionId!: string;

  @ManyToOne(() => Question)
  @JoinColumn({ name: 'question_id' })
  question!: Question;

  @Column({ type: 'smallint', nullable: true })
  ratingValue!: number | null;

  @Column({ type: 'boolean', nullable: true })
  boolValue!: boolean | null;
}
