import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, listDemoUsers, seedDemoFixtures } from '../api/client';
import type { DemoUser } from '../api/types';
import { saveSession, type SessionUser } from '../session/session';

interface LoginProps {
  onLogin: (user: SessionUser) => void;
}

type EnrichedDemoUser = DemoUser & { organizationId?: string };

/**
 * Demo sign-in. Loads the seeded users from GET /api/users, then enriches
 * them with organization ids from POST /api/seed (public, idempotent,
 * dev-only per SPEC §5) so requests can carry X-Org-Id alongside X-User-Id.
 * If seeding is unavailable the plain list still works: the server derives
 * the organization from the user id.
 */
export default function Login({ onLogin }: LoginProps) {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [orgIdByName, setOrgIdByName] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const seed = await seedDemoFixtures().catch(() => null);
      if (cancelled) {
        return;
      }
      if (seed !== null) {
        setOrgIdByName(
          Object.fromEntries(
            seed.organizations.map((organization) => [organization.name, organization.id]),
          ),
        );
      }
      try {
        const list = await listDemoUsers();
        if (!cancelled) {
          setUsers(list);
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof ApiError
              ? cause.message
              : 'Could not load the demo user list.',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const enrichedUsers = useMemo<EnrichedDemoUser[]>(
    () =>
      users.map((user) => {
        const organizationId = orgIdByName[user.organization];
        return organizationId === undefined ? user : { ...user, organizationId };
      }),
    [users, orgIdByName],
  );

  const orgGroups = useMemo(() => {
    const byOrganization = new Map<string, EnrichedDemoUser[]>();
    for (const user of enrichedUsers) {
      const group = byOrganization.get(user.organization) ?? [];
      group.push(user);
      byOrganization.set(user.organization, group);
    }
    return Array.from(byOrganization.entries());
  }, [enrichedUsers]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const selected = enrichedUsers.find((user) => user.id === selectedId);
    if (selected === undefined) {
      return;
    }
    const sessionUser: SessionUser = {
      id: selected.id,
      name: selected.name,
      role: selected.role,
      organization: selected.organization,
    };
    if (selected.organizationId !== undefined) {
      sessionUser.organizationId = selected.organizationId;
    }
    saveSession(sessionUser);
    onLogin(sessionUser);
  }

  return (
    <main className="login-screen">
      <div className="card login-card">
        <h1>Pulse Surveys</h1>
        <p className="login-subtitle">
          A weekly team pulse check, isolated per organization.
        </p>

        {error !== null && (
          <div className="banner banner-error" role="alert">
            {error}
          </div>
        )}

        {loading ? (
          <p className="muted">Loading demo users…</p>
        ) : enrichedUsers.length === 0 ? (
          <p className="muted">
            No demo users found. Start the backend and seed it, then reload.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label className="field-label" htmlFor="demo-user-select">
              Sign in as
            </label>
            <select
              id="demo-user-select"
              className="select"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Choose a demo user…</option>
              {orgGroups.map(([organization, group]) => (
                <optgroup key={organization} label={organization}>
                  {group.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {user.role} @ {user.organization}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="submit"
              className="button button-primary"
              disabled={selectedId === ''}
            >
              Continue
            </button>
          </form>
        )}

        <p className="login-note">
          This demo uses spoofable identity headers instead of a real sign-in,
          so you can pick any seeded identity. Each organization only ever sees
          its own survey, responses, and summary.
        </p>
      </div>
    </main>
  );
}
