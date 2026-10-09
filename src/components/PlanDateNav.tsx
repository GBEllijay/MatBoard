import { useState } from 'react';
import { earliestPlanDate, isWithinRetention, shiftPlanDate } from '../lib/trainingNotesStore';

type PlanHit = {
  dateKey: string;
  planId: string;
  label: string;
};

/**
 * Previous day, next day, a calendar, and search.
 * Today, Yesterday, and Classes stay on the page beside this.
 */
export function PlanDateNav({
  todayKey,
  viewKey,
  activePlanId,
  hitsFor,
  onOpenDate,
  onOpenHit,
}: {
  todayKey: string;
  viewKey: string;
  activePlanId: string;
  hitsFor: (query: string) => PlanHit[];
  onOpenDate: (dateKey: string) => void;
  onOpenHit: (dateKey: string, planId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const previous = shiftPlanDate(viewKey, todayKey, -1);
  const next = shiftPlanDate(viewKey, todayKey, 1);
  const hits = query.trim() ? hitsFor(query) : [];
  const min = earliestPlanDate(todayKey);

  return (
    <div className="notes__date-nav" aria-label="Plan dates">
      <button
        type="button"
        className="btn btn--ghost"
        disabled={!previous}
        onClick={() => {
          if (previous) onOpenDate(previous);
        }}
      >
        Previous day
      </button>
      <button
        type="button"
        className="btn btn--ghost"
        disabled={!next}
        onClick={() => {
          if (next) onOpenDate(next);
        }}
      >
        Next day
      </button>
      <label className="notes__date-field">
        Calendar
        <input
          type="date"
          value={viewKey}
          min={min}
          max={todayKey}
          onChange={(event) => {
            const value = event.target.value;
            if (isWithinRetention(value, todayKey)) onOpenDate(value);
          }}
        />
      </label>
      <label className="notes__date-field">
        Search plans
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {query.trim() ? (
        hits.length ? (
          <ul className="notes__recent" aria-label="Plan search results">
            {hits.map((hit) => (
              <li key={`${hit.dateKey}:${hit.planId}`}>
                <button
                  type="button"
                  className={
                    hit.dateKey === viewKey && hit.planId === activePlanId
                      ? 'notes__recent-btn notes__recent-btn--on'
                      : 'notes__recent-btn'
                  }
                  onClick={() => onOpenHit(hit.dateKey, hit.planId)}
                >
                  {hit.label}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="notes__recent-empty">No plans match that search.</p>
        )
      ) : null}
    </div>
  );
}
