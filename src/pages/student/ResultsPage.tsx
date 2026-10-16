import { useState } from 'react';
import type { CompetitionResult, MatchMethod, MatchResult } from '../../lib/progress/types';
import { competitionOf } from '../../lib/progress/competition';
import {
  addBracketNote,
  addCompetitionMatch,
  addCompetitionResult,
  removeBracketNote,
  removeCompetitionMatch,
  removeCompetitionResult,
  setBracketPhotoFlag,
} from '../../lib/studentCompetition';
import { bracketPhotoFromFile, deleteBracketPhoto, loadBracketPhoto, writeBracketPhoto } from '../../lib/bracketPhoto';
import { LeatherHeader, StudentMarks, useStudentFile } from './chrome';

const RESULTS: { id: MatchResult; label: string }[] = [
  { id: 'win', label: 'Win' },
  { id: 'loss', label: 'Loss' },
  { id: 'draw', label: 'Draw' },
];

const METHODS: { id: MatchMethod; label: string }[] = [
  { id: 'points', label: 'Points' },
  { id: 'sub', label: 'Sub' },
  { id: 'advantage', label: 'Advantage' },
  { id: 'dq', label: 'DQ' },
];

export function ResultsPage() {
  const { report, commit } = useStudentFile();
  const competition = competitionOf(report);
  const [tournamentId, setTournamentId] = useState('');
  const [name, setName] = useState('');
  const [division, setDivision] = useState('');
  const [error, setError] = useState('');

  const pickTournament = (id: string) => {
    setTournamentId(id);
    const tournament = competition.tournaments.find((item) => item.id === id);
    if (!tournament) return;
    setName(tournament.name);
    if (!division.trim()) setDivision(tournament.division);
  };

  return (
    <main className="student student-frame student--arena">
      <StudentMarks />
      <LeatherHeader title="Results" />
      <div className="student-paper">
        <div className="student-sheet">
          <p className="student-quiet">
            Record matches and a personal bracket. This is not a live scoreboard. A bracket photo stays on this phone and is not in the file you send.
          </p>
          <form
            className="ink comp-form"
            aria-label="Add a competition result"
            onSubmit={(event) => {
              event.preventDefault();
              try {
                commit(addCompetitionResult(report, { tournamentId, tournamentName: name, division }));
                setTournamentId('');
                setName('');
                setDivision('');
                setError('');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save that result.');
              }
            }}
          >
            <label>
              <span className="ink__label">Tournament</span>
              <select aria-label="Tracked tournament" value={tournamentId} onChange={(event) => pickTournament(event.target.value)}>
                <option value="">Not on my list</option>
                {competition.tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ink__label">Tournament name</span>
              <input aria-label="Result tournament name" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label>
              <span className="ink__label">Division</span>
              <input aria-label="Result division" value={division} onChange={(event) => setDivision(event.target.value)} />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <button type="submit" className="ink-btn ink-btn--save">
              Add result
            </button>
          </form>
          {competition.results.length === 0 ? <p className="student-quiet">No results yet.</p> : null}
          <ul className="comp-list">
            {competition.results.map((result) => (
              <ResultCard key={result.id} result={result} report={report} commit={commit} />
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

function ResultCard({
  result,
  report,
  commit,
}: {
  result: CompetitionResult;
  report: ReturnType<typeof useStudentFile>['report'];
  commit: ReturnType<typeof useStudentFile>['commit'];
}) {
  const [opponent, setOpponent] = useState('');
  const [outcome, setOutcome] = useState<MatchResult>('win');
  const [method, setMethod] = useState<MatchMethod>('points');
  const [note, setNote] = useState('');
  const [round, setRound] = useState('');
  const [bracketName, setBracketName] = useState('');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(() => (result.bracketPhoto ? loadBracketPhoto(result.id) : ''));
  const [confirming, setConfirming] = useState(false);

  return (
    <li id={result.id} className="ink tournament-card">
      <strong>{result.tournamentName}</strong>
      {result.division ? <span>{result.division}</span> : null}
      <ul className="comp-goals" aria-label={`Matches for ${result.tournamentName}`}>
        {result.matches.map((match) => (
          <li key={match.id}>
            <span>
              {matchLabel(match.result)} · {match.opponent}
              {match.method ? ` · ${methodLabel(match.method)}` : ''}
              {match.note ? ` — ${match.note}` : ''}
            </span>
            <button type="button" className="ink-btn ink-btn--small" onClick={() => commit(removeCompetitionMatch(report, result.id, match.id))}>
              {`Remove match ${match.opponent}`}
            </button>
          </li>
        ))}
      </ul>
      <form
        className="comp-form"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            commit(addCompetitionMatch(report, result.id, { opponent, result: outcome, method, note }));
            setOpponent('');
            setNote('');
            setError('');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not add that match.');
          }
        }}
      >
        <p className="ink__label">Match</p>
        <label>
          <span className="ink__label">Opponent</span>
          <input aria-label={`Opponent for ${result.tournamentName}`} value={opponent} onChange={(event) => setOpponent(event.target.value)} />
        </label>
        <div className="student-games" role="group" aria-label={`Result for ${result.tournamentName}`}>
          {RESULTS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={outcome === choice.id ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={outcome === choice.id}
              onClick={() => setOutcome(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <div className="student-games" role="group" aria-label={`Method for ${result.tournamentName}`}>
          {METHODS.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className={method === choice.id ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={method === choice.id}
              onClick={() => setMethod(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <label>
          <span className="ink__label">Match notes</span>
          <input aria-label={`Match notes for ${result.tournamentName}`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <button type="submit" className="ink-btn">
          {`Add match for ${result.tournamentName}`}
        </button>
      </form>

      <section aria-label={`Bracket notes for ${result.tournamentName}`}>
        <p className="ink__label">Personal bracket</p>
        <ul className="comp-goals">
          {result.bracket.map((line) => (
            <li key={line.id}>
              <span>
                {line.round ? `${line.round} — ` : ''}
                {line.name}
              </span>
              <button type="button" className="ink-btn ink-btn--small" onClick={() => commit(removeBracketNote(report, result.id, line.id))}>
                {`Remove ${line.name}`}
              </button>
            </li>
          ))}
        </ul>
        <form
          className="comp-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              commit(addBracketNote(report, result.id, round, bracketName));
              setRound('');
              setBracketName('');
              setError('');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not add that bracket line.');
            }
          }}
        >
          <label>
            <span className="ink__label">Round</span>
            <input aria-label={`Bracket round for ${result.tournamentName}`} placeholder="Quarterfinal" value={round} onChange={(event) => setRound(event.target.value)} />
          </label>
          <label>
            <span className="ink__label">Name</span>
            <input aria-label={`Bracket name for ${result.tournamentName}`} value={bracketName} onChange={(event) => setBracketName(event.target.value)} />
          </label>
          <button type="submit" className="ink-btn ink-btn--small">
            {`Add bracket line for ${result.tournamentName}`}
          </button>
        </form>
        {photo ? <img className="bracket-photo" src={photo} alt={`Bracket photo for ${result.tournamentName}`} /> : null}
        <label className="ink-btn ink-btn--small">
          {photo ? 'Replace bracket photo' : 'Attach bracket photo'}
          <input
            className="student-file"
            type="file"
            accept="image/*"
            aria-label={`Bracket photo for ${result.tournamentName}`}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              void bracketPhotoFromFile(file)
                .then((dataUrl) => {
                  writeBracketPhoto(result.id, dataUrl);
                  setPhoto(dataUrl);
                  commit(setBracketPhotoFlag(report, result.id, true));
                  setError('');
                })
                .catch((err: unknown) => {
                  setError(err instanceof Error ? err.message : 'Could not save that photo.');
                });
            }}
          />
        </label>
        {photo ? (
          <button
            type="button"
            className="ink-btn ink-btn--small"
            onClick={() => {
              deleteBracketPhoto(result.id);
              setPhoto('');
              commit(setBracketPhotoFlag(report, result.id, false));
            }}
          >
            {`Remove bracket photo for ${result.tournamentName}`}
          </button>
        ) : null}
      </section>
      {error ? <p role="alert">{error}</p> : null}
      {confirming ? (
        <div className="student-confirm" role="group" aria-label={`Remove ${result.tournamentName} result`}>
          <span>Remove this result?</span>
          <button
            type="button"
            className="ink-btn"
            onClick={() => {
              deleteBracketPhoto(result.id);
              commit(removeCompetitionResult(report, result.id));
            }}
          >
            {`Confirm remove ${result.tournamentName}`}
          </button>
          <button type="button" className="ink-btn" onClick={() => setConfirming(false)}>
            Keep result
          </button>
        </div>
      ) : (
        <button type="button" className="ink-btn" onClick={() => setConfirming(true)}>
          {`Remove ${result.tournamentName}`}
        </button>
      )}
    </li>
  );
}

function matchLabel(result: MatchResult): string {
  if (result === 'win') return 'Win';
  if (result === 'draw') return 'Draw';
  return 'Loss';
}

function methodLabel(method: MatchMethod): string {
  if (method === 'points') return 'Points';
  if (method === 'sub') return 'Sub';
  if (method === 'advantage') return 'Advantage';
  if (method === 'dq') return 'DQ';
  return '';
}
