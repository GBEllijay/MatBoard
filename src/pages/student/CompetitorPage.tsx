import { useState } from 'react';
import type { StudentTournament, TournamentStatus, WeightUnit } from '../../lib/progress/types';
import {
  competitionOf,
  formatWeight,
  isUpcomingTournament,
  textHits,
  tournamentHaystack,
  tournamentStatusLabel,
} from '../../lib/progress/competition';
import {
  addTournament,
  addTournamentGoal,
  removeTournament,
  removeTournamentGoal,
  setTournamentGoalMet,
  updateTournament,
  type TournamentDraft,
} from '../../lib/studentCompetition';
import { todayIso } from '../../lib/studentEdition';
import { LeatherHeader, StudentMarks, useStudentFile } from './chrome';
import { StandingGames } from './StandingGames';

const STATUSES: { status: TournamentStatus; label: string }[] = [
  { status: 'considering', label: 'Considering' },
  { status: 'entered', label: 'Entered' },
];

function emptyDraft(unit: WeightUnit, date = todayIso()): TournamentDraft {
  return {
    name: '',
    date,
    location: '',
    division: '',
    deadline: '',
    link: '',
    status: 'considering',
    targetWeight: '',
    targetUnit: unit,
  };
}

function draftFromTournament(tournament: StudentTournament): TournamentDraft {
  return {
    name: tournament.name,
    date: tournament.date,
    location: tournament.location,
    division: tournament.division,
    deadline: tournament.deadline,
    link: tournament.link,
    status: tournament.status,
    targetWeight: tournament.targetWeight == null ? '' : String(tournament.targetWeight),
    targetUnit: tournament.targetUnit,
  };
}

export function CompetitorPage() {
  const { report, commit } = useStudentFile();
  const competition = competitionOf(report);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<TournamentDraft>(() => emptyDraft(competition.weightUnit));
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const today = todayIso();
  const needle = query.trim();
  const tournaments = competition.tournaments.filter((tournament) => textHits(tournamentHaystack(tournament), needle));
  const upcoming = tournaments
    .filter((tournament) => isUpcomingTournament(tournament, today))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
  const earlier = tournaments
    .filter((tournament) => !isUpcomingTournament(tournament, today))
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));

  const saveTournament = () => {
    try {
      const next = editing
        ? updateTournament(report, editing, draft)
        : addTournament(report, draft);
      commit(next);
      setDraft(emptyDraft(next.competition?.weightUnit ?? competition.weightUnit));
      setEditing(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that tournament.');
    }
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Competitor" />
      <div className="student-paper">
        <div className="student-sheet">
          <p className="student-quiet">
            Tournaments, your A, B, and C game, and weigh-ins stay on this phone. Send to coach puts them in the same progress file.
          </p>
          <label className="ink student-search">
            <span className="ink__label">Search</span>
            <input
              aria-label="Search competition"
              value={query}
              placeholder="Tournament, technique, or weight"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <section className="ink" aria-label="Tournaments">
            <h2 className="ink__label">Tournaments</h2>
            <p className="student-quiet">Entered and considering dates show on your calendar.</p>
            {upcoming.length === 0 && earlier.length === 0 ? <p className="student-quiet">No tournaments yet.</p> : null}
            {upcoming.length ? (
              <ul className="comp-list">
                {upcoming.map((tournament) => (
                  <TournamentCard
                    key={tournament.id}
                    tournament={tournament}
                    report={report}
                    commit={commit}
                    confirming={confirming === tournament.id}
                    onEdit={() => {
                      setEditing(tournament.id);
                      setDraft(draftFromTournament(tournament));
                      setConfirming(null);
                      setError('');
                    }}
                    onAskRemove={() => setConfirming(tournament.id)}
                    onKeep={() => setConfirming(null)}
                  />
                ))}
              </ul>
            ) : null}
            {earlier.length ? (
              <details className="comp-earlier">
                <summary>Earlier tournaments</summary>
                <ul className="comp-list">
                  {earlier.map((tournament) => (
                    <TournamentCard
                      key={tournament.id}
                      tournament={tournament}
                      report={report}
                      commit={commit}
                      confirming={confirming === tournament.id}
                      onEdit={() => {
                        setEditing(tournament.id);
                        setDraft(draftFromTournament(tournament));
                        setConfirming(null);
                        setError('');
                      }}
                      onAskRemove={() => setConfirming(tournament.id)}
                      onKeep={() => setConfirming(null)}
                    />
                  ))}
                </ul>
              </details>
            ) : null}
            <form
              className="comp-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveTournament();
              }}
            >
              <p className="ink__label">{editing ? 'Edit tournament' : 'Add a tournament'}</p>
              <label>
                <span className="ink__label">Name</span>
                <input aria-label="Tournament name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
              </label>
              <label>
                <span className="ink__label">Date</span>
                <input type="date" aria-label="Tournament date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} required />
              </label>
              <label>
                <span className="ink__label">Location</span>
                <input aria-label="Tournament location" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} />
              </label>
              <label>
                <span className="ink__label">Division / weight class</span>
                <input aria-label="Division and weight class" value={draft.division} onChange={(event) => setDraft({ ...draft, division: event.target.value })} />
              </label>
              <label>
                <span className="ink__label">Registration deadline</span>
                <input type="date" aria-label="Registration deadline" value={draft.deadline} onChange={(event) => setDraft({ ...draft, deadline: event.target.value })} />
              </label>
              <label>
                <span className="ink__label">Link</span>
                <input aria-label="Tournament link" inputMode="url" placeholder="https://" value={draft.link} onChange={(event) => setDraft({ ...draft, link: event.target.value })} />
              </label>
              <div className="student-games" role="group" aria-label="Tournament status">
                {STATUSES.map((choice) => (
                  <button
                    key={choice.status}
                    type="button"
                    className={draft.status === choice.status ? 'student-choice is-on' : 'student-choice'}
                    aria-pressed={draft.status === choice.status}
                    onClick={() => setDraft({ ...draft, status: choice.status })}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              <label>
                <span className="ink__label">Target division weight</span>
                <input
                  aria-label="Target division weight"
                  inputMode="decimal"
                  value={draft.targetWeight}
                  onChange={(event) => setDraft({ ...draft, targetWeight: event.target.value })}
                />
              </label>
              <UnitToggle
                unit={draft.targetUnit}
                group="Target weight unit"
                onChange={(targetUnit) => setDraft({ ...draft, targetUnit })}
              />
              {error ? <p role="alert">{error}</p> : null}
              <div className="student-actions">
                <button type="submit" className="ink-btn ink-btn--save">
                  {editing ? 'Save tournament' : 'Add tournament'}
                </button>
                {editing ? (
                  <button
                    type="button"
                    className="ink-btn"
                    onClick={() => {
                      setEditing(null);
                      setDraft(emptyDraft(competition.weightUnit));
                      setError('');
                    }}
                  >
                    Cancel tournament edit
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <StandingGames
            report={report}
            commit={commit}
            query={needle}
          />
        </div>
      </div>
    </main>
  );
}

function TournamentCard({
  tournament,
  report,
  commit,
  confirming,
  onEdit,
  onAskRemove,
  onKeep,
}: {
  tournament: StudentTournament;
  report: ReturnType<typeof useStudentFile>['report'];
  commit: ReturnType<typeof useStudentFile>['commit'];
  confirming: boolean;
  onEdit: () => void;
  onAskRemove: () => void;
  onKeep: () => void;
}) {
  const [goalName, setGoalName] = useState('');
  const [goalNote, setGoalNote] = useState('');
  const [goalError, setGoalError] = useState('');
  const target =
    tournament.targetWeight == null ? '' : formatWeight(tournament.targetWeight, tournament.targetUnit);
  return (
    <li className="ink tournament-card">
      <strong>
        {tournamentStatusLabel(tournament.status)} · {tournament.name}
      </strong>
      <span>{tournament.date}{tournament.location ? ` · ${tournament.location}` : ''}</span>
      {tournament.division ? <span>{tournament.division}</span> : null}
      {tournament.deadline ? <span>Register by {tournament.deadline}</span> : null}
      {target ? <span>Target {target}</span> : null}
      {tournament.link ? (
        <a href={tournament.link} target="_blank" rel="noopener noreferrer">
          {tournament.link}
        </a>
      ) : null}
      <ul className="comp-goals" aria-label={`Goals for ${tournament.name}`}>
        {tournament.goals.map((goal) => (
          <li key={goal.id}>
            <span>
              {goal.name}
              {goal.note ? ` — ${goal.note}` : ''}
            </span>
            <button
              type="button"
              className="ink-btn"
              aria-pressed={goal.met === true}
              onClick={() => commit(setTournamentGoalMet(report, tournament.id, goal.id, goal.met !== true))}
            >
              {goal.met ? `${goal.name} met` : `Mark ${goal.name} met`}
            </button>
            <button type="button" className="ink-btn" onClick={() => commit(removeTournamentGoal(report, tournament.id, goal.id))}>
              {`Remove ${goal.name}`}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="comp-goal-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            commit(addTournamentGoal(report, tournament.id, goalName, goalNote));
            setGoalName('');
            setGoalNote('');
            setGoalError('');
          } catch (err) {
            setGoalError(err instanceof Error ? err.message : 'Could not add that goal.');
          }
        }}
      >
        <label>
          <span className="ink__label">Goal</span>
          <input aria-label={`Goal for ${tournament.name}`} value={goalName} onChange={(event) => setGoalName(event.target.value)} />
        </label>
        <label>
          <span className="ink__label">Goal note</span>
          <input aria-label={`Goal note for ${tournament.name}`} value={goalNote} onChange={(event) => setGoalNote(event.target.value)} />
        </label>
        <button type="submit" className="ink-btn">
          {`Add goal for ${tournament.name}`}
        </button>
        {goalError ? <p role="alert">{goalError}</p> : null}
      </form>
      <div className="student-actions">
        <button type="button" className="ink-btn" onClick={onEdit}>
          {`Edit ${tournament.name}`}
        </button>
        {confirming ? (
          <div className="student-confirm" role="group" aria-label={`Remove ${tournament.name}`}>
            <span>Remove this tournament?</span>
            <button type="button" className="ink-btn" onClick={() => commit(removeTournament(report, tournament.id))}>
              {`Confirm remove ${tournament.name}`}
            </button>
            <button type="button" className="ink-btn" onClick={onKeep}>
              Keep tournament
            </button>
          </div>
        ) : (
          <button type="button" className="ink-btn" onClick={onAskRemove}>
            {`Remove ${tournament.name}`}
          </button>
        )}
      </div>
    </li>
  );
}

function UnitToggle({
  unit,
  group,
  onChange,
}: {
  unit: WeightUnit;
  group: string;
  onChange: (unit: WeightUnit) => void;
}) {
  return (
    <div className="student-games" role="group" aria-label={group}>
      {(['lb', 'kg'] as const).map((choice) => (
        <button
          key={choice}
          type="button"
          className={unit === choice ? 'student-choice is-on' : 'student-choice'}
          aria-pressed={unit === choice}
          onClick={() => onChange(choice)}
        >
          {choice === 'lb' ? 'Pounds' : 'Kilograms'}
        </button>
      ))}
    </div>
  );
}
