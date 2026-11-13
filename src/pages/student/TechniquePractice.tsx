import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { StudentProgressReport } from '../../lib/progress/types';
import type { TechniqueAnchor } from '../../lib/videoAssociation';
import { earlierPractices, latestPractice, resolveTechnique } from '../../lib/videoAssociation';
import { useStudentPath } from './chrome';

/** Practice dates for one technique. Newest session by date, not by the last edit. */
export function TechniquePractice({
  report,
  anchor,
  currentId = '',
}: {
  report: StudentProgressReport;
  anchor: TechniqueAnchor;
  currentId?: string;
}) {
  const to = useStudentPath();
  const [query, setQuery] = useState('');
  const resolved = resolveTechnique(report, anchor);
  const latest = latestPractice(report, anchor);
  const allEarlier = earlierPractices(report, anchor, currentId);
  const earlier = allEarlier.filter((hit) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${hit.date} ${hit.name}`.toLowerCase().includes(needle);
  });
  const title = resolved.title || anchor.name;
  return (
    <div className="technique-practice">
      <p className="student-quiet">
        {resolved.missing ? `${anchor.name} is no longer on your list. Older practice cards that used it are still here.` : title}
      </p>
      {latest ? (
        latest.id === currentId ? (
          <p>This is the latest saved practice, {latest.date}.</p>
        ) : (
          <Link className="ink-btn" to={to(`/student/cards/${latest.id}#class-videos`)}>
            {`Latest practice · ${latest.date}`}
          </Link>
        )
      ) : (
        <p className="student-quiet">No saved practice card for this technique.</p>
      )}
      {allEarlier.length ? (
        <label className="ink student-search">
          <span className="ink__label">Earlier practice</span>
          <input
            aria-label={`Find an earlier practice of ${title}`}
            type="search"
            value={query}
            placeholder="Date"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      ) : null}
      {earlier.map((hit) => (
        <Link key={hit.id} className="ink-btn" to={to(`/student/cards/${hit.id}#class-videos`)}>
          {`Earlier practice · ${hit.date} · ${hit.name}`}
        </Link>
      ))}
      {query.trim() && earlier.length === 0 ? <p className="student-quiet">No earlier practice matches.</p> : null}
    </div>
  );
}

export function OriginalClass({ report, entryId }: { report: StudentProgressReport; entryId: string }) {
  const to = useStudentPath();
  const entry = report.journal.find((item) => item.id === entryId);
  if (!entry) return <p className="student-quiet">Original class card is no longer on this device.</p>;
  return (
    <Link className="ink-btn" to={to(`/student/cards/${entry.id}#class-videos`)}>
      {`Original class · ${entry.date}`}
    </Link>
  );
}
