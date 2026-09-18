import type { OrganizationRole } from '../api/types';

/**
 * Dual-key session (the two-tab cross-org demo):
 *
 * - `pulse.session.default` (localStorage) is the shared default. Signing in
 *   always writes BOTH keys, so a brand-new tab inherits the most recent
 *   sign-in.
 * - `pulse.session.tab-user` (sessionStorage) is per-tab and wins on
 *   restore. A tab keeps its own user across reloads even after another tab
 *   signs in as someone else, so two tabs can hold two users from two
 *   different organizations at the same time.
 *
 * Restore order: sessionStorage first, then localStorage, else login screen.
 */

const TAB_STORAGE_KEY = 'pulse.session.tab-user';
const SHARED_STORAGE_KEY = 'pulse.session.default';

/** The signed-in demo user, as rendered by the UI and sent via auth headers. */
export interface SessionUser {
  id: string;
  name: string;
  role: OrganizationRole;
  organization: string;
  /** Known only when the login screen could enrich it via POST /api/seed. */
  organizationId?: string;
}

function isOrganizationRole(value: unknown): value is OrganizationRole {
  return value === 'manager' || value === 'member';
}

function parseStoredUser(raw: string | null): SessionUser | null {
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    const { id, name, organization, role } = record;
    if (
      typeof id !== 'string' ||
      typeof name !== 'string' ||
      typeof organization !== 'string' ||
      !isOrganizationRole(role)
    ) {
      return null;
    }
    const user: SessionUser = { id, name, role, organization };
    if (typeof record['organizationId'] === 'string') {
      user.organizationId = record['organizationId'];
    }
    return user;
  } catch {
    return null;
  }
}

/** Restore the session for this tab: sessionStorage wins over localStorage. */
export function loadSession(): SessionUser | null {
  return (
    parseStoredUser(window.sessionStorage.getItem(TAB_STORAGE_KEY)) ??
    parseStoredUser(window.localStorage.getItem(SHARED_STORAGE_KEY))
  );
}

/** Persist the sign-in to both keys (per-tab + shared default for new tabs). */
export function saveSession(user: SessionUser): void {
  const serialized = JSON.stringify(user);
  window.sessionStorage.setItem(TAB_STORAGE_KEY, serialized);
  window.localStorage.setItem(SHARED_STORAGE_KEY, serialized);
}

/** Sign out of this tab: clears both keys so no stale default lingers. */
export function clearSession(): void {
  window.sessionStorage.removeItem(TAB_STORAGE_KEY);
  window.localStorage.removeItem(SHARED_STORAGE_KEY);
}
