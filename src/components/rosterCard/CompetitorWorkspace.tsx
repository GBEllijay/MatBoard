/**
 * Competition fields shared by the Edit competitor sheet and the Competition card.
 * Game plan notes read and write the one roster game plan (A/B/C plus Home focus).
 */
import { useEffect, useState } from 'react';
import { resultClassLine } from '../../lib/divisionFields';
import { Link } from 'react-router-dom';
import { useRosterState } from '../../hooks/useStores';
import { competitionRecord, upcomingTournaments } from '../../lib/competitionCard';
import { GAME_PLAN_A, GAME_PLAN_B, GAME_PLAN_C } from '../../lib/coachCopy';
import { GAME_NOTE_MAX, type GameSection } from '../../lib/gamePlan';
import { cardDate } from '../../lib/rosterCard';
import {
  addCompetitorWeighIn,
  competitorGamePlan,
  competitorReady,
  migrateSharedGamePlan,
  setGameNotes,
  setReadyFlag,
  visibleReadyItems,
} from '../../lib/rosterStore';
import { formatWeight } from '../../lib/progress/competition';
import type { WeightUnit } from '../../lib/progress/types';
import { todayIso } from './fileSave';

const GAME_FIELDS: { section: GameSection; title: string; label: string }[] = [
  { section: 'a', title: GAME_PLAN_A, label: 'A Game' },
  { section: 'b', title: GAME_PLAN_B, label: 'B Game' },
  { section: 'c', title: GAME_PLAN_C, label: 'C Game' },
  { section: 'home', title: 'Home focus', label: 'Home focus' },
];

export function SharedGamePlanFields({ competitorId }: { competitorId: string }) {
  useEffect(() => {
    migrateSharedGamePlan(competitorId);
  }, [competitorId]);
  const roster = useRosterState();
  const plan = competitorGamePlan(competitorId, roster);
  return (
    <div className="shared-game" data-testid="shared-game-plan">
      {GAME_FIELDS.map((field) => (
        <label key={field.section} className="card-entry__cell">
          {field.title}
          <textarea
            value={plan[field.section].notes}
            rows={3}
            maxLength={GAME_NOTE_MAX}
            aria-label={field.label}
            onChange={(event) => setGameNotes(competitorId, field.section, event.target.value)}
          />
        </label>
      ))}
      <Link className="comp-card__btn comp-card__btn--ghost" to={`/game-plan?id=${encodeURIComponent(competitorId)}`}>
        Open game plan
      </Link>
    </div>
  );
}

/** Weigh-ins, upcoming events, results, Competition Ready, and the shared game plan. */
export function CompetitorWorkspace({ competitorId }: { competitorId: string }) {
  const roster = useRosterState();
  const plan = roster.competitionPlans[competitorId] ?? null;
  const ready = competitorReady(competitorId, roster);
  const record = competitionRecord(plan);
  const upcoming = upcomingTournaments(plan, todayIso());
  const [date, setDate] = useState('');
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState<WeightUnit>('lb');
  const [error, setError] = useState('');
  const visible = visibleReadyItems(ready);

  return (
    <section className="competitor-workspace" data-testid="competitor-workspace" aria-label="Competition">
      <div className="card-entry__cell" data-testid="competitor-weigh-ins">
        <span>Weigh-ins</span>
        {plan?.weighIns.length ? (
          <ul className="competitor-workspace__list">
            {[...plan.weighIns]
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((row) => (
                <li key={row.id}>
                  {cardDate(row.date) || row.date} · {formatWeight(row.weight, row.unit)}
                  {row.note ? ` · ${row.note}` : ''}
                </li>
              ))}
          </ul>
        ) : (
          <p className="roster-edit__hint">No weigh-ins yet.</p>
        )}
        <div className="competitor-workspace__weigh">
          <label>
            Date
            <input type="date" aria-label="Weigh-in date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            Weight
            <input
              inputMode="decimal"
              aria-label="Weigh-in weight"
              value={weight}
              onChange={(event) => setWeight(event.target.value)}
            />
          </label>
          <label>
            Unit
            <select aria-label="Weigh-in unit" value={unit} onChange={(event) => setUnit(event.target.value === 'kg' ? 'kg' : 'lb')}>
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const result = addCompetitorWeighIn(competitorId, { date, weight, unit });
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setError('');
              setWeight('');
            }}
          >
            Add weigh-in
          </button>
        </div>
        {error ? <p className="roster-edit__error">{error}</p> : null}
      </div>

      <div className="card-entry__cell" data-testid="competitor-upcoming">
        <span>Upcoming tournaments</span>
        {upcoming.length ? (
          <ul className="competitor-workspace__list">
            {upcoming.map((row) => (
              <li key={row.id}>
                {cardDate(row.date) || row.date} · {row.name}
                {row.division ? ` · ${row.division}` : ''}
              </li>
            ))}
          </ul>
        ) : (
          <p className="roster-edit__hint">No upcoming tournaments on this card.</p>
        )}
      </div>

      <div className="card-entry__cell" data-testid="competitor-record">
        <span>Results and win record</span>
        {record.total ? (
          <p>
            {record.wins}–{record.losses}
            {record.draws ? `–${record.draws}` : ''}
            {record.winRate !== null ? ` · ${record.winRate}% wins` : ''}
          </p>
        ) : (
          <p className="roster-edit__hint">No results yet.</p>
        )}
        {plan?.results.length ? (
          <ul className="competitor-workspace__list">
            {plan.results.map((result) => (
              <li key={result.id}>
                {result.tournamentName}
                {resultClassLine(result) ? ` · ${resultClassLine(result)}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="card-entry__cell" data-testid="competitor-ready">
        <span>Competition Ready</span>
        <ul className="competitor-workspace__ready">
          {visible.map((item) => {
            const on = ready.flags[item.id];
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setReadyFlag(competitorId, item.id, !on)}
                >
                  {item.label}: {on ? 'On' : 'Off'}
                </button>
              </li>
            );
          })}
        </ul>
        <Link className="comp-card__btn comp-card__btn--ghost" to={`/competition-ready?id=${encodeURIComponent(competitorId)}`}>
          Open Competition Ready
        </Link>
      </div>

      <div className="card-entry__cell" data-testid="competitor-game">
        <span>Game plan</span>
        <SharedGamePlanFields competitorId={competitorId} />
      </div>
    </section>
  );
}
