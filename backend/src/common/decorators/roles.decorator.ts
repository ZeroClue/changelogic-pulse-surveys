import { SetMetadata } from '@nestjs/common';
import { type OrganizationRole } from '../../entities/enums';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given organization roles (resolved server-side
 * from the seeded user, never from the client).
 */
export const Roles = (...roles: readonly OrganizationRole[]) =>
  SetMetadata(ROLES_KEY, roles);
