import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RANK_BELTS, RANK_TAPE_MAX, type RankBelt } from '../../lib/progress/types';
import {
  rankBeltLabel,
  rankOf,
  removeRankHistory,
  setRankAwardedOn,
  setRankBelt,
  setRankTapeCount,
  setRankTapeDate,
} from '../../lib/studentRank';
import { BELT_LABELS } from '../../lib/studentTools';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';

const TAPE_SLOTS = [1, 2, 3, 4] as const;

export function RankPage() {
  const to = useStudentPath();
  const { report, commit } = useStudentFile();
  const [error, setError] = useState('');
  const [dropId, setDropId] = useState('');
  const rank = rankOf(report);
  const belt = report.profile.belt;
  const tone: RankBelt | 'other' = (RANK_BELTS as readonly string[]).includes(belt) ? (belt as RankBelt) : 'other';

  const run = (next: ReturnType<typeof setRankBelt>) => {
    try {
      commit(next);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that.');
    }
  };

  const tapStripe = (slot: number) => {
    run(setRankTapeCount(report, slot === rank.tapeCount ? slot - 1 : slot));
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="My rank" />
      <div className="student-paper">
        <div className="student-sheet">
          <p className="student-quiet">
            The belt you wear, and the stripes on it. Belt progress reads this belt and shows the checkpoints ahead.
          </p>
          <div className={`rank-belt rank-belt--${tone}`}>
            <div className="rank-belt__bar">
              <span className="rank-belt__name">{BELT_LABELS[belt]}</span>
              <div className="rank-tapes" role="group" aria-label="Stripes">
                {TAPE_SLOTS.map((slot) => {
                  const on = slot <= rank.tapeCount;
                  return (
                    <button
                      key={slot}
                      type="button"
                      className={on ? 'rank-tape is-on' : 'rank-tape'}
                      aria-pressed={on}
                      aria-label={`Stripe ${slot}`}
                      onClick={() => tapStripe(slot)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
          <p className="student-quiet">
            {rank.tapeCount === 0 ? 'No stripes' : rank.tapeCount === 1 ? '1 stripe' : `${rank.tapeCount} stripes`} of {RANK_TAPE_MAX}. Tap a stripe to add it. Tap the last one again to take it off.
          </p>
          <div className="student-games" role="group" aria-label="Current belt">
            {RANK_BELTS.map((item) => (
              <button
                key={item}
                type="button"
                className={item === belt ? 'student-choice is-on' : 'student-choice'}
                aria-pressed={item === belt}
                onClick={() => {
                  setDropId('');
                  run(setRankBelt(report, item));
                }}
              >
                {BELT_LABELS[item]}
              </button>
            ))}
          </div>
          <label>
            <span className="ink__label">Date of this belt</span>
            <input
              type="date"
              aria-label="Date of this belt"
              value={rank.awardedOn}
              onChange={(event) => run(setRankAwardedOn(report, event.target.value))}
            />
          </label>
          {TAPE_SLOTS.filter((slot) => slot <= rank.tapeCount).map((slot) => (
            <label key={slot}>
              <span className="ink__label">Stripe {slot} date</span>
              <input
                type="date"
                aria-label={`Stripe ${slot} date`}
                value={rank.tapeDates[slot - 1] ?? ''}
                onChange={(event) => run(setRankTapeDate(report, slot - 1, event.target.value))}
              />
            </label>
          ))}
          <p className="student-quiet">
            A Promotion test on the calendar is a reminder you add by hand. It does not fill this date. The calendar reads the dates you save here.
          </p>
          <section className="ink" aria-label="Promotion history">
            <h2>Promotion history</h2>
            {rank.history.length === 0 ? <p>No earlier belts yet. A belt moves here when you change it and it already has a date or a stripe.</p> : null}
            <ul className="comp-list">
              {rank.history.map((row) => {
                const label = rankBeltLabel(row.belt);
                const when = row.awardedOn ? ` · ${row.awardedOn}` : '';
                const stripes = row.tapeCount === 1 ? '1 stripe' : `${row.tapeCount} stripes`;
                const dated = row.tapeDates
                  .map((date, index) => (date && index < row.tapeCount ? `stripe ${index + 1} on ${date}` : ''))
                  .filter(Boolean)
                  .join(', ');
                return (
                  <li key={row.id}>
                    <strong>
                      {label}
                      {when}
                    </strong>
                    <span>
                      {stripes}
                      {dated ? ` · ${dated}` : ''}
                    </span>
                    {dropId === row.id ? (
                      <div className="student-actions">
                        <button
                          type="button"
                          className="ink-btn"
                          aria-label={`Confirm remove ${label} history`}
                          onClick={() => {
                            run(removeRankHistory(report, row.id));
                            setDropId('');
                          }}
                        >
                          Confirm remove
                        </button>
                        <button type="button" className="ink-btn" onClick={() => setDropId('')}>
                          Keep history
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="ink-btn ink-btn--small"
                        aria-label={`Remove ${label} history`}
                        onClick={() => setDropId(row.id)}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
          <Link className="ink-btn" to={to('/student/rubric')}>
            Belt progress
          </Link>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      </div>
    </main>
  );
}
