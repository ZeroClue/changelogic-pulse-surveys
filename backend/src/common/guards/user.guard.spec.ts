import {
  ForbiddenException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type RequestUser } from '../request-user';
import { UsersService } from '../../users/users.service';
import { UserGuard } from './user.guard';

const ORG_A_ID = '00000000-0000-4000-8000-000000000001';
const USER_A_MEMBER_ID = '00000000-0000-4000-8000-000000000012';

const authUser = {
  id: USER_A_MEMBER_ID,
  organizationId: ORG_A_ID,
  name: 'Milo Member',
  email: 'milo.member@acme.test',
  role: 'member' as const,
  organizationName: 'Acme Corp',
};

interface RequestLike {
  headers: Record<string, string | string[] | undefined>;
  requestUser?: RequestUser;
}

function createContext(request: RequestLike): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => UserGuard,
  } as unknown as ExecutionContext;
}

function makeGuard(
  findForAuth: UsersService['findForAuth'],
  isPublic = false,
): UserGuard {
  const reflector = new Reflector();
  jest
    .spyOn(reflector, 'getAllAndOverride')
    .mockReturnValue(isPublic ? true : undefined);
  const usersService = { findForAuth } as unknown as UsersService;
  return new UserGuard(reflector, usersService);
}

describe('UserGuard', () => {
  it('allows public routes without any header', async () => {
    const guard = makeGuard(jest.fn(), true);
    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).resolves.toBe(true);
  });

  it('rejects a missing X-User-Id with 401', async () => {
    const guard = makeGuard(jest.fn());
    await expect(
      guard.canActivate(createContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a non-UUID X-User-Id with 401', async () => {
    const guard = makeGuard(jest.fn());
    await expect(
      guard.canActivate(
        createContext({ headers: { 'x-user-id': 'not-a-uuid' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an unknown user with 401', async () => {
    const findForAuth = jest.fn().mockResolvedValue(null);
    const guard = makeGuard(findForAuth);
    await expect(
      guard.canActivate(
        createContext({ headers: { 'x-user-id': USER_A_MEMBER_ID } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(findForAuth).toHaveBeenCalledWith(USER_A_MEMBER_ID);
  });

  it('resolves the request user without X-Org-Id', async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue(authUser));
    const request: RequestLike = { headers: { 'x-user-id': USER_A_MEMBER_ID } };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.requestUser?.organizationId).toBe(ORG_A_ID);
    expect(request.requestUser?.role).toBe('member');
  });

  it('accepts a matching X-Org-Id (case-insensitive)', async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue(authUser));
    await expect(
      guard.canActivate(
        createContext({
          headers: {
            'x-user-id': USER_A_MEMBER_ID,
            // Uppercase form of the same UUID must be accepted (review N-4).
            'x-org-id': ORG_A_ID.toUpperCase(),
          },
        }),
      ),
    ).resolves.toBe(true);
  });

  it('rejects a mismatching X-Org-Id with 403', async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue(authUser));
    await expect(
      guard.canActivate(
        createContext({
          headers: {
            'x-user-id': USER_A_MEMBER_ID,
            'x-org-id': '00000000-0000-4000-8000-000000000002',
          },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a malformed X-Org-Id with 403', async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue(authUser));
    await expect(
      guard.canActivate(
        createContext({
          headers: {
            'x-user-id': USER_A_MEMBER_ID,
            'x-org-id': 'not-a-uuid',
          },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('fails closed on a duplicated (array) X-Org-Id header: DB org is used', async () => {
    const guard = makeGuard(jest.fn().mockResolvedValue(authUser));
    const request: RequestLike = {
      headers: {
        'x-user-id': USER_A_MEMBER_ID,
        // Duplicate header arrives as string[] → trust path skipped.
        'x-org-id': ['00000000-0000-4000-8000-000000000002'],
      },
    };
    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.requestUser?.organizationId).toBe(ORG_A_ID);
  });
});
