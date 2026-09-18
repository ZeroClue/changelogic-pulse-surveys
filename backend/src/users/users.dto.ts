import { type OrganizationRole } from '../entities/enums';

export interface DemoUserDto {
  id: string;
  name: string;
  role: OrganizationRole;
  organization: string;
  organizationId: string;
}

export interface AuthUserDto {
  id: string;
  organizationId: string;
  name: string;
  email: string;
  role: OrganizationRole;
  organizationName: string;
}
