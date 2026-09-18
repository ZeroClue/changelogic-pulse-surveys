import { type OrganizationRole } from '../entities/enums';
import { type Organization } from '../entities/organization.entity';
import { type User } from '../entities/user.entity';

/**
 * Auth-time view of the resolved user. Header auth (X-User-Id) is demo-only
 * and deliberately spoofable per SPEC §4; the role/org always come from the
 * database, never from the client.
 */
export interface RequestUser {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
  user: Pick<User, 'id' | 'name' | 'email' | 'role'> & {
    organization: Pick<Organization, 'id' | 'name'>;
  };
}
