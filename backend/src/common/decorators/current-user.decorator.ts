import {
  createParamDecorator,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { type RequestUser } from '../request-user';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ requestUser?: RequestUser }>();
    if (!request.requestUser) {
      throw new UnauthorizedException(
        'User context missing: ensure UserGuard ran',
      );
    }
    return request.requestUser;
  },
);
