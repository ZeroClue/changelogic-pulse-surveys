import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ORGANIZATION_ROLES, type OrganizationRole } from './enums';
import { Organization } from './organization.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  @Column({
    type: 'enum',
    enum: [...ORGANIZATION_ROLES],
    enumName: 'org_role',
  })
  role!: OrganizationRole;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
