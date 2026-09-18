import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, listDemoUsers } from '../api/client';
import type { DemoUser } from '../api/types';
import { saveSession, type SessionUser } from '../session/session';

interface LoginProps {
  onLogin: (user: SessionUser) => void;
}

/**
 * Demo sign-in. Loads the seeded users — each with its organization id —
 * from GET /api/users, so the session can carry both header identities
 * (X-User-Id + X-Org-Id). The server still derives the organization from
 * the user id, so an unexpectedly missing organizationId (older backend
 * without migration 004) degrades gracefully to X-User-Id only.
 */
export default function Login({ onLogin }: LoginProps) {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
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

  const orgGroups = useMemo(() => {
    const byOrganization = new Map<string, DemoUser[]>();
    for (const user of users) {
      const group = byOrganization.get(user.organization) ?? [];
      group.push(user);
      byOrganization.set(user.organization, group);
    }
    return Array.from(byOrganization.entries());
  }, [users]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const selected = users.find((user) => user.id === selectedId);
    if (selected === undefined) {
      return;
    }
    const sessionUser: SessionUser = {
      id: selected.id,
      name: selected.name,
      role: selected.role,
      organization: selected.organization,
    };
    // X-Org-Id comes straight from the list; when it is unexpectedly absent
    // the session falls back to X-User-Id only (server derives the org).
    if (
      typeof selected.organizationId === 'string' &&
      selected.organizationId !== ''
    ) {
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
        ) : users.length === 0 ? (
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
