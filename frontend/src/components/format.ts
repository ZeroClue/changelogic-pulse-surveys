import type { OrganizationRole } from '../api/types';

/** Human-readable role for labels ("manager" -> "Manager"). */
export function roleLabel(role: OrganizationRole): string {
  return role === 'manager' ? 'Manager' : 'Member';
}

/** Fraction (0-1) to a whole percent, e.g. 0.667 -> "67%". */
export function formatRatePercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** "3 responses" / "1 response". */
export function countLabel(count: number, singular: string): string {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}
