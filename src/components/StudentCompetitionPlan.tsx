import { useState } from 'react';
import {
  formatWeight,
  isUpcomingTournament,
  planHasContent,
  tournamentStatusLabel,
  workingOnLine,
  type ImportedCompetitionPlan,
} from '../lib/progress/competition';
import { GAME_TAGS } from '../lib/progress/types';
import { importStudentCompetition } from '../lib/rosterStore';

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** What an imported student is working on. Read-only. The file stays on this device. */
export function StudentCompetitionPlan({
  plan,
  compact = false,
}: {
  plan: ImportedCompetitionPlan;
  compact?: boolean;
}) {
  if (!planHasContent(plan)) return null;
  const line = workingOnLine(plan.games);
  const today = todayIso();
  const next = [...plan.tournaments]
    .filter((tournament) => isUpcomingTournament(tournament, today))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (compact) {
    return (
      <p className="roster-plan__line">
        {line || 'Competition plan imported'}
        {next ? ` · ${tournamentStatusLabel(next.status)} ${next.name} ${next.date}` : ''}
      </p>
    );
  }
  return (
    <section className="roster-plan" aria-label="Student competition plan">
      <h3>Student competition plan</h3>
      <p className="roster-plan__quiet">
        Imported from {plan.displayName || 'the student'}’s progress file. It stays on this phone. Advantage does not host it.
      </p>
      {GAME_TAGS.map((tag) => {
        const game = plan.games[tag];
        if (!game.techniques.trim() && !game.notes.trim()) return null;
        return (
          <p key={tag}>
            <strong>{tag.toUpperCase()} game.</strong> {game.techniques || 'No techniques yet'}
            {game.notes ? ` — ${game.notes}` : ''}
          </p>
        );
      })}
      {plan.tournaments.length ? (
        <ul className="roster-plan__list">
          {plan.tournaments.map((tournament) => (
            <li key={tournament.id}>
              {tournamentStatusLabel(tournament.status)} · {tournament.name} · {tournament.date}
              {tournament.division ? ` · ${tournament.division}` : ''}
              {tournament.location ? ` · ${tournament.location}` : ''}
              {tournament.targetWeight != null ? ` · target ${formatWeight(tournament.targetWeight, tournament.targetUnit)}` : ''}
              {tournament.goals.length
                ? ` · ${tournament.goals.map((goal) => goal.name).join(', ')}`
                : ''}
            </li>
          ))}
        </ul>
      ) : null}
      {plan.weighIns.length ? (
        <p>
          Latest weigh-in{' '}
          {(() => {
            const latest = [...plan.weighIns].sort((a, b) => b.date.localeCompare(a.date))[0];
            return `${formatWeight(latest.weight, latest.unit)} on ${latest.date}`;
          })()}
        </p>
      ) : null}
    </section>
  );
}

export function ImportStudentProgress({
  competitorId,
  competitorName,
}: {
  competitorId: string;
  competitorName: string;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="roster-plan">
      <label className="roster-plan__import">
        Import student progress
        <input
          type="file"
          accept="application/json,.json"
          aria-label={`Import student progress for ${competitorName}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void file.text().then((text) => {
              const result = importStudentCompetition(competitorId, text);
              if (result) {
                setError(result);
                setMessage('');
                return;
              }
              setError('');
              setMessage('Competition plan is on this phone. Advantage does not host the file.');
            });
          }}
        />
      </label>
      <p className="roster-plan__quiet">The student’s own email or the gym Drive folder carries the file. Advantage hosts nothing.</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
