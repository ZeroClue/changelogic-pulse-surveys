import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type RequestUser } from '../request-user';
import { RolesGuard } from './roles.guard';

const managerUser: RequestUser = {
  userId: '00000000-0000-4000-8000-000000000011',
  organizationId: '00000000-0000-4000-8000-000000000001',
  role: 'manager',
  user: {
    id: '00000000-0000-4000-8000-000000000011',
    name: 'Ada Manager',
    email: 'ada.manager@acme.test',
    role: 'manager',
    organization: {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Acme Corp',
    },
  },
};

function createContext(requestUser: RequestUser | undefined): ExecutionContext {
  const request = { requestUser };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => RolesGuard,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows routes without role metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext(undefined))).toBe(true);
  });

  it('allows a matching role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['manager']);
    expect(guard.canActivate(createContext(managerUser))).toBe(true);
  });

  it('rejects a mismatching role with 403', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['manager']);
    expect(() =>
      guard.canActivate(
        createContext({
          ...managerUser,
          userId: 'x',
          role: 'member',
          user: { ...managerUser.user, role: 'member' },
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects a missing user context with 401', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['manager']);
    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
