import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type OrganizationRole } from '../../entities/enums';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { type RequestUser } from '../request-user';

/**
 * Enforces `@Roles(...)` metadata against the role resolved server-side by
 * UserGuard. Members hitting manager-only routes (e.g. summary) get 403.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrganizationRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ requestUser?: RequestUser }>();
    if (!request.requestUser) {
      throw new UnauthorizedException('User context missing');
    }
    if (!requiredRoles.includes(request.requestUser.role)) {
      throw new ForbiddenException('Insufficient role for this operation');
    }
    return true;
  }
}
