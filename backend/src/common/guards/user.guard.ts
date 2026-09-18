import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isUUID } from 'class-validator';
import { type RequestUser } from '../request-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { UsersService } from '../../users/users.service';

/**
 * Resolves the current user from the demo `X-User-Id` header (SPEC §4).
 * Unknown or missing user → 401. An optional `X-Org-Id` header must match the
 * user's organization or the request is rejected with 403: the organization
 * context is never trusted from the client alone.
 */
@Injectable()
export class UserGuard implements CanActivate {
  private readonly logger = new Logger(UserGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      requestUser?: RequestUser;
    }>();

    const headerUserId = request.headers['x-user-id'];
    const userId =
      typeof headerUserId === 'string' ? headerUserId.trim() : undefined;
    if (!userId || !isUUID(userId)) {
      throw new UnauthorizedException('Missing or malformed X-User-Id header');
    }

    const authUser = await this.usersService.findForAuth(userId);
    if (!authUser) {
      throw new UnauthorizedException('Unknown user');
    }

    const headerOrgId = request.headers['x-org-id'];
    if (
      typeof headerOrgId === 'string' &&
      headerOrgId.trim() !== authUser.organizationId
    ) {
      this.logger.warn(
        `Rejected X-Org-Id ${headerOrgId} for user ${authUser.id} (belongs to ${authUser.organizationId})`,
      );
      throw new ForbiddenException(
        'X-Org-Id does not match the user organization',
      );
    }

    request.requestUser = {
      userId: authUser.id,
      organizationId: authUser.organizationId,
      role: authUser.role,
      user: {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        role: authUser.role,
        organization: {
          id: authUser.organizationId,
          name: authUser.organizationName,
        },
      },
    };
    return true;
  }
}
