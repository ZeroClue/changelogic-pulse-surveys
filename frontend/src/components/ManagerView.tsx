import { useEffect, useMemo, useState } from 'react';
import { ApiError, getActiveSurvey, getSurveySummary } from '../api/client';
import type { AuthHeaders } from '../api/client';
import type { ActiveSurvey, SurveySummary, YesNoQuestionRollup } from '../api/types';
import { countLabel, formatRatePercent } from './format';
import type { SessionUser } from '../session/session';

interface ManagerViewProps {
  user: SessionUser;
}

/** Inline yes/no bar with counts underneath. */
function YesNoRollup({ rollup }: { rollup: YesNoQuestionRollup }) {
  const total = rollup.yesCount + rollup.noCount;
  const yesShare = total === 0 ? 0 : Math.round((rollup.yesCount / total) * 100);
  return (
    <>
      <div className="yesno-bar" aria-hidden="true">
        <span className="yesno-bar-yes" style={{ width: `${yesShare}%` }} />
      </div>
      <p className="rollup-line">
        <strong>{rollup.yesCount}</strong> yes · <strong>{rollup.noCount}</strong> no
        {' '}({countLabel(rollup.count, 'answer')})
      </p>
    </>
  );
}

/** Manager flow: weekly completion + per-question rollups for the org's survey. */
export default function ManagerView({ user }: ManagerViewProps) {
  const auth = useMemo<AuthHeaders>(
    () => ({ userId: user.id, organizationId: user.organizationId }),
    [user],
  );

  const [survey, setSurvey] = useState<ActiveSurvey | null>(null);
  const [summary, setSummary] = useState<SurveySummary | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const active = await getActiveSurvey(auth);
        if (cancelled) {
          return;
        }
        setSurvey(active);
        const weekly = await getSurveySummary(active.id, auth);
        if (!cancelled) {
          setSummary(weekly);
        }
      } catch (cause) {
        if (!cancelled && cause instanceof ApiError) {
          setError(cause);
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
  }, [auth]);

  if (loading) {
    return <p className="muted">Loading the weekly summary…</p>;
  }

  if (error !== null) {
    return (
      <div className="banner banner-error" role="alert">
        {error.status === 403
          ? 'Only managers can view the weekly summary.'
          : error.status === 404
            ? 'There is no active survey for your organization right now.'
            : `Could not load the summary (${error.status}): ${error.message}`}
      </div>
    );
  }

  if (summary === null) {
    return (
      <div className="banner banner-error" role="alert">
        The summary could not be loaded.
      </div>
    );
  }

  const rollups = summary.perQuestion
    .slice()
    .sort((a, b) => a.position - b.position);

  return (
    <>
      <section className="card">
        <h2>{survey?.title ?? 'Weekly summary'}</h2>
        <p className="muted">Week starting {summary.weekStart}</p>
        <div className="completion-card">
          <span className="completion-rate">
            {formatRatePercent(summary.completionRate)}
          </span>
          <span className="completion-detail">
            {countLabel(summary.completionCount, 'response')} submitted this
            week, out of all members in {user.organization}
          </span>
        </div>
      </section>

      {rollups.map((rollup) => (
        <section key={rollup.questionId} className="card">
          <h3>{rollup.prompt}</h3>
          {rollup.type === 'rating' ? (
            <p className="rollup-line">
              {rollup.average === null ? (
                <span className="muted">No ratings yet</span>
              ) : (
                <>
                  <strong>{rollup.average.toFixed(2)}</strong> average
                  {' '}({countLabel(rollup.count, 'rating')})
                </>
              )}
            </p>
          ) : (
            <YesNoRollup rollup={rollup} />
          )}
        </section>
      ))}

      {rollups.length === 0 && (
        <p className="muted">This survey has no questions yet.</p>
      )}
    </>
  );
}
