import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route as not requiring the X-User-Id header (e.g. login list, seed). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
