import type {
  ActiveSurvey,
  ApiErrorBody,
  CreatedResponse,
  DemoUser,
  SeedResult,
  SubmitResponseInput,
  SurveySummary,
} from './types';

/**
 * Base URL: VITE_API_URL wins (see .env.example); falls back to the local
 * NestJS API on :3001.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3001/api';

const configuredBaseUrl = import.meta.env.VITE_API_URL as string | undefined;

export const API_BASE_URL: string = (configuredBaseUrl ?? DEFAULT_API_BASE_URL).replace(
  /\/+$/,
  '',
);

/**
 * Headers for demo header auth (SPEC §4). `X-User-Id` is always sent;
 * `X-Org-Id` is sent only when the client actually knows the organization
 * id (the demo user list carries org names, so the id is optional — the
 * server always derives the org from the user).
 */
export interface AuthHeaders {
  userId: string;
  organizationId?: string;
}

/**
 * Error thrown for every non-2xx (status 0 = the API is unreachable).
 * `message` carries the API's own message when one was returned.
 */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return (
    isRecord(value) &&
    typeof value['statusCode'] === 'number' &&
    (typeof value['message'] === 'string' ||
      (Array.isArray(value['message']) &&
        value['message'].every((part) => typeof part === 'string')))
  );
}

async function extractErrorMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (isApiErrorBody(body)) {
    return Array.isArray(body.message) ? body.message.join('; ') : body.message;
  }
  return `Request failed with status ${response.status}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  auth?: AuthHeaders;
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', auth, body } = options;

  const headers: Record<string, string> = {};
  if (auth) {
    headers['X-User-Id'] = auth.userId;
    if (auth.organizationId !== undefined) {
      headers['X-Org-Id'] = auth.organizationId;
    }
  }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);

  if (response === null) {
    throw new ApiError(0, 'Could not reach the API. Is the backend running?');
  }

  if (!response.ok) {
    throw new ApiError(response.status, await extractErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }
  const parsed: unknown = await response.json().catch(() => null);
  if (parsed === null) {
    throw new ApiError(response.status, 'Unexpected empty response from the API');
  }
  return parsed as T;
}

/** GET /api/users — public demo login list (DemoUserDto[]). */
export function listDemoUsers(): Promise<DemoUser[]> {
  return request<DemoUser[]>('/users');
}

/** POST /api/seed — public, idempotent, dev-only fixture seeding (SeedResult). */
export function seedDemoFixtures(): Promise<SeedResult> {
  return request<SeedResult>('/seed', { method: 'POST' });
}

/** GET /api/surveys/active — caller's org active survey (member + manager). */
export function getActiveSurvey(auth: AuthHeaders): Promise<ActiveSurvey> {
  return request<ActiveSurvey>('/surveys/active', { auth });
}

/** POST /api/surveys/:surveyId/responses — member-only (201 or error). */
export function submitResponse(
  surveyId: string,
  auth: AuthHeaders,
  input: SubmitResponseInput,
): Promise<CreatedResponse> {
  return request<CreatedResponse>(`/surveys/${surveyId}/responses`, {
    method: 'POST',
    auth,
    body: input,
  });
}

/** GET /api/surveys/:surveyId/summary — manager-only; `week` must be a Monday. */
export function getSurveySummary(
  surveyId: string,
  auth: AuthHeaders,
  week?: string,
): Promise<SurveySummary> {
  const query = week === undefined ? '' : `?week=${encodeURIComponent(week)}`;
  return request<SurveySummary>(`/surveys/${surveyId}/summary${query}`, { auth });
}
