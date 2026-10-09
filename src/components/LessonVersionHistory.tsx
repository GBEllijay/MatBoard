import { useEffect, useState } from 'react';
import {
  planVersionNumber,
  reviewStatusLabel,
  versionChangeLines,
  REVIEW_VERSION_LEAD,
  type ReviewSubmission,
} from '../lib/reviewInbox';

/** Proposed copies for one class plan. Opening one does not replace the others. */
export function LessonVersionHistory({ versions }: { versions: readonly ReviewSubmission[] }) {
  const newestFirst = [...versions].sort((a, b) => b.submittedAt - a.submittedAt || b.id.localeCompare(a.id));
  const latestId = newestFirst[0]?.id ?? '';
  const [openId, setOpenId] = useState(latestId);

  useEffect(() => {
    setOpenId(latestId);
  }, [latestId]);

  if (!newestFirst.length) return null;
  const chronological = [...newestFirst].sort(
    (a, b) => a.submittedAt - b.submittedAt || a.id.localeCompare(b.id),
  );

  return (
    <section className="lesson-versions" aria-label="Version history">
      <p>{REVIEW_VERSION_LEAD}</p>
      <ol className="lesson-versions__list">
        {newestFirst.map((version) => {
          const number = planVersionNumber(newestFirst, version.id);
          const index = chronological.findIndex((item) => item.id === version.id);
          const earlier = index > 0 ? chronological[index - 1] : null;
          const open = openId === version.id;
          const lines = versionChangeLines(earlier?.plan ?? null, version.plan);
          return (
            <li key={version.id}>
              <button
                type="button"
                className={open ? 'btn btn--ghost lesson-version--on' : 'btn btn--ghost'}
                aria-expanded={open}
                onClick={() => setOpenId(open ? '' : version.id)}
              >
                Version {number} · {reviewStatusLabel(version.status)}
              </button>
              <ul className="lesson-versions__changes">
                {lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {open ? (
                <div className="lesson-versions__snapshot">
                  {version.plan.intro ? <p>{version.plan.intro}</p> : null}
                  {version.plan.closing ? <p>{version.plan.closing}</p> : null}
                  {version.instructorNote ? <p>Note: {version.instructorNote}</p> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
