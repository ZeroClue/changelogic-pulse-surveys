import { useEffect, useMemo, useState } from 'react';
import { ApiError, getActiveSurvey, submitResponse } from '../api/client';
import type {
  ActiveSurvey,
  ActiveSurveyQuestion,
  CreatedResponse,
  SubmitAnswerInput,
} from '../api/types';
import type { AuthHeaders } from '../api/client';
import { countLabel } from './format';
import type { SessionUser } from '../session/session';

type AnswerValue = number | boolean;

interface MemberViewProps {
  user: SessionUser;
}

function answerToInput(
  question: ActiveSurveyQuestion,
  value: AnswerValue | undefined,
): SubmitAnswerInput | null {
  if (value === undefined) {
    return null;
  }
  if (question.type === 'rating' && typeof value === 'number') {
    return { questionId: question.id, ratingValue: value };
  }
  if (question.type === 'yes_no' && typeof value === 'boolean') {
    return { questionId: question.id, boolValue: value };
  }
  return null;
}

/** Member flow: read the org's active survey, answer it, submit once per week. */
export default function MemberView({ user }: MemberViewProps) {
  const auth = useMemo<AuthHeaders>(
    () => ({ userId: user.id, organizationId: user.organizationId }),
    [user],
  );

  const [survey, setSurvey] = useState<ActiveSurvey | null>(null);
  const [loadError, setLoadError] = useState<ApiError | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submission, setSubmission] = useState<CreatedResponse | null>(null);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  useEffect(() => {
    let cancelled = false;
    getActiveSurvey(auth)
      .then((active) => {
        if (!cancelled) {
          setSurvey(active);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled && cause instanceof ApiError) {
          setLoadError(cause);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [auth]);

  const allAnswered =
    survey !== null &&
    survey.questions.every(
      (question) => answers[question.id] !== undefined,
    );

  function setAnswer(questionId: string, value: AnswerValue): void {
    setAnswers((previous) => ({ ...previous, [questionId]: value }));
  }

  async function handleSubmit(): Promise<void> {
    if (survey === null || !allAnswered) {
      return;
    }
    const answerInputs: SubmitAnswerInput[] = [];
    for (const question of survey.questions) {
      const input = answerToInput(question, answers[question.id]);
      if (input !== null) {
        answerInputs.push(input);
      }
    }

    setSubmitting(true);
    setSubmitError(null);
    setAlreadySubmitted(false);
    try {
      const created = await submitResponse(survey.id, auth, {
        answers: answerInputs,
      });
      setSubmission(created);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setAlreadySubmitted(true);
      } else if (cause instanceof ApiError) {
        setSubmitError(cause);
      } else {
        setSubmitError(new ApiError(0, 'Something went wrong while submitting.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError !== null) {
    return (
      <div className="banner banner-error" role="alert">
        {loadError.status === 404
          ? 'There is no active survey for your organization right now.'
          : `Could not load the survey (${loadError.status}): ${loadError.message}`}
      </div>
    );
  }

  if (survey === null) {
    return <p className="muted">Loading your survey…</p>;
  }

  if (submission !== null) {
    return (
      <section className="card">
        <h2>Thank you — your response is in</h2>
        <p className="muted">
          {survey.title} · week starting {submission.weekStart}
        </p>
        <ul className="answer-list">
          {submission.answers.map((answer) => {
            const question = survey.questions.find(
              (candidate) => candidate.id === answer.questionId,
            );
            const display =
              typeof answer.ratingValue === 'number'
                ? `${answer.ratingValue} out of 5`
                : answer.boolValue
                  ? 'Yes'
                  : 'No';
            return (
              <li key={answer.questionId}>
                <span className="answer-prompt">
                  {question?.prompt ?? 'Question'}
                </span>
                <span className="answer-value">{display}</span>
              </li>
            );
          })}
        </ul>
        <p className="muted">See you again next week.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>{survey.title}</h2>
      <p className="muted">Takes a minute. One response per week.</p>

      {alreadySubmitted && (
        <div className="banner banner-info" role="status">
          You have already submitted this week for this survey. Come back next
          week.
        </div>
      )}

      {submitError !== null && (
        <div className="banner banner-error" role="alert">
          Submit failed ({submitError.status}): {submitError.message}
        </div>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        {survey.questions.map((question) => (
          <fieldset key={question.id} className="question">
            <legend>{question.prompt}</legend>
            {question.type === 'rating' ? (
              <>
                <div className="radio-row" role="radiogroup" aria-label={question.prompt}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className="radio-label">
                      <input
                        type="radio"
                        name={question.id}
                        value={value}
                        checked={answers[question.id] === value}
                        onChange={() => setAnswer(question.id, value)}
                      />
                      <span>{value}</span>
                    </label>
                  ))}
                </div>
                <p className="question-hint">1 = lowest, 5 = highest</p>
              </>
            ) : (
              <div className="radio-row" role="radiogroup" aria-label={question.prompt}>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === true}
                    onChange={() => setAnswer(question.id, true)}
                  />
                  <span>Yes</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name={question.id}
                    checked={answers[question.id] === false}
                    onChange={() => setAnswer(question.id, false)}
                  />
                  <span>No</span>
                </label>
              </div>
            )}
          </fieldset>
        ))}

        <button
          type="submit"
          className="button button-primary"
          disabled={!allAnswered || submitting}
        >
          {submitting ? 'Submitting…' : 'Submit response'}
        </button>
        {!allAnswered && (
          <p className="question-hint">
            Answer every question to enable submit. {countLabel(Object.keys(answers).length, 'question')} of{' '}
            {survey.questions.length} answered.
          </p>
        )}
      </form>
    </section>
  );
}
