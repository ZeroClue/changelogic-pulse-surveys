import type { RequestUser } from './request-user';

declare module 'express-serve-static-core' {
  interface Request {
    requestUser?: RequestUser;
  }
}
