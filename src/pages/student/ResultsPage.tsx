import { useState } from 'react';
import {
  AGE_DIVISIONS,
  COMPETITION_BELTS,
  COMPETITION_DIVISIONS,
  WEIGHT_CLASSES,
  parseResultClass,
  pickerOptions,
  resultClassLine,
} from '../../lib/divisionFields';
import {
  COMPETITION_PLACE_LABELS,
  COMPETITION_PLACES,
  type CompetitionPlace,
  type CompetitionResult,
  type MatchMethod,
  type MatchResult,
} from '../../lib/progress/types';
import { competitionOf } from '../../lib/progress/competition';
import {
  addBracketNote,
  addCompetitionMatch,
  addCompetitionResult,
  removeBracketNote,
  removeCompetitionMatch,
  removeCompetitionResult,
  setBracketPhotoFlag,
  updateCompetitionResult,
  type ResultDraft,
  type ResultMatchDraft,
} from '../../lib/studentCompetition';
import { bracketPhotoFromFile, deleteBracketPhoto, loadBracketPhoto, writeBracketPhoto } from '../../lib/bracketPhoto';
import { forgetPodiumPhotos } from '../../lib/podiumPhotos';
import { PodiumPhotoRow } from './PodiumPhotos';
import { SELF_REPORTED_NOTE } from '../../lib/progressVerification';
import { todayIso } from '../../lib/studentEdition';
import { isIsoDate } from '../../lib/studentTools';
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

const PLACES: { id: CompetitionPlace; label: string }[] = COMPETITION_PLACES.map((id) => ({
  id,
  label: COMPETITION_PLACE_LABELS[id],
}));

type EntryMode = 'quick' | 'full';

type FormState = {
  tournamentId: string;
  name: string;
  date: string;
  note: string;
  place: CompetitionPlace | '';
  ageDivision: string;
  competitionDivision: string;
  weightClass: string;
  belt: string;
};

const emptyForm = (): FormState => ({
  tournamentId: '',
  name: '',
  date: todayIso(),
  note: '',
  place: '',
  ageDivision: '',
  competitionDivision: '',
  weightClass: '',
  belt: '',
});

export function ResultsPage() {
  const { report, commit } = useStudentFile();
  const competition = competitionOf(report);
  const [mode, setMode] = useState<EntryMode>('full');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editMatches, setEditMatches] = useState<ResultMatchDraft[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const patch = (next: Partial<FormState>) => setForm((current) => ({ ...current, ...next }));

  const resetForm = () => {
    setForm(emptyForm());
    setEditMatches([]);
    setEditingId(null);
    setError('');
    setMode('full');
  };

  const pickTournament = (id: string) => {
    const tournament = competition.tournaments.find((item) => item.id === id);
    if (!tournament) {
      patch({ tournamentId: id });
      return;
    }
    const parsed = parseResultClass([tournament.division, tournament.weightClass ?? ''].filter(Boolean).join(' '));
    patch({
      tournamentId: id,
      name: tournament.name,
      date: tournament.date || form.date,
      ageDivision: form.ageDivision || parsed.ageDivision,
      competitionDivision: form.competitionDivision || parsed.competitionDivision,
      weightClass: form.weightClass || parsed.weightClass,
      belt: form.belt || parsed.belt,
    });
  };

  const beginEdit = (result: CompetitionResult) => {
    setEditingId(result.id);
    setMode(result.quick ? 'quick' : 'full');
    setForm({
      tournamentId: result.tournamentId,
      name: result.tournamentName,
      date: result.date || todayIso(),
      note: result.note ?? '',
      place: result.place ?? '',
      ageDivision: result.ageDivision ?? '',
      competitionDivision: result.competitionDivision ?? '',
      weightClass: result.weightClass ?? '',
      belt: result.belt ?? '',
    });
    setEditMatches(
      result.matches.map((match) => ({
        id: match.id,
        opponent: match.opponent,
        result: match.result,
        method: match.method,
        note: match.note,
        date: match.date ?? '',
      })),
    );
    setError('');
  };

  const draftFromForm = (): ResultDraft => ({
    tournamentId: form.tournamentId,
    tournamentName: form.name,
    date: form.date,
    note: form.note,
    place: form.place,
    quick: mode === 'quick',
    ageDivision: form.ageDivision,
    competitionDivision: form.competitionDivision,
    weightClass: form.weightClass,
    belt: form.belt,
  });

  return (
    <main className="student student-frame student--arena">
      <StudentMarks />
      <LeatherHeader title="Results" />
      <div className="student-paper">
        <div className="student-sheet">
          <p className="student-quiet">
            Record a quick result such as gold, silver, or bronze, or log each match. This is not a live scoreboard. A
            bracket photo stays on this phone and is not in the file you send. Podium photos stay on this phone too. They
            are not sent to your coach. {SELF_REPORTED_NOTE} A coach update you accept is the verified copy. Saving does
            not need a coach.
          </p>
          <form
            className="ink comp-form"
            aria-label={editingId ? 'Edit a competition result' : 'Add a competition result'}
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const draft = draftFromForm();
                if (editingId) {
                  commit(
                    updateCompetitionResult(report, editingId, {
                      ...draft,
                      matches: mode === 'full' ? editMatches : undefined,
                    }),
                  );
                } else {
                  commit(addCompetitionResult(report, draft));
                }
                resetForm();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not save that result.');
              }
            }}
          >
            <div className="student-games" role="group" aria-label="Result entry type">
              <button
                type="button"
                className={mode === 'quick' ? 'student-choice is-on' : 'student-choice'}
                aria-pressed={mode === 'quick'}
                onClick={() => setMode('quick')}
              >
                Quick result
              </button>
              <button
                type="button"
                className={mode === 'full' ? 'student-choice is-on' : 'student-choice'}
                aria-pressed={mode === 'full'}
                onClick={() => setMode('full')}
              >
                Match by match
              </button>
            </div>
            <label>
              <span className="ink__label">Tournament</span>
              <select aria-label="Tracked tournament" value={form.tournamentId} onChange={(event) => pickTournament(event.target.value)}>
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
              <input aria-label="Result tournament name" value={form.name} onChange={(event) => patch({ name: event.target.value })} />
            </label>
            <label>
              <span className="ink__label">Date</span>
              <input
                type="date"
                autoComplete="off"
                aria-label="Result date"
                value={form.date}
                onChange={(event) => patch({ date: event.target.value })}
              />
            </label>
            <ChoiceField
              label="Age division"
              ariaLabel="Result age division"
              value={form.ageDivision}
              options={AGE_DIVISIONS}
              onChange={(ageDivision) => patch({ ageDivision })}
            />
            <ChoiceField
              label="Competition division"
              ariaLabel="Result competition division"
              value={form.competitionDivision}
              options={COMPETITION_DIVISIONS}
              onChange={(competitionDivision) => patch({ competitionDivision })}
            />
            <ChoiceField
              label="Weight class"
              ariaLabel="Result weight class"
              value={form.weightClass}
              options={WEIGHT_CLASSES}
              onChange={(weightClass) => patch({ weightClass })}
            />
            <ChoiceField
              label="Belt rank"
              ariaLabel="Result belt rank"
              value={form.belt}
              options={COMPETITION_BELTS}
              onChange={(belt) => patch({ belt })}
            />
            {mode === 'quick' ? (
              <div className="student-games" role="group" aria-label="Quick result place">
                {PLACES.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    className={form.place === choice.id ? 'student-choice is-on' : 'student-choice'}
                    aria-pressed={form.place === choice.id}
                    onClick={() => patch({ place: choice.id })}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
            ) : null}
            <label>
              <span className="ink__label">Notes</span>
              <input aria-label="Result notes" value={form.note} onChange={(event) => patch({ note: event.target.value })} />
            </label>
            {editingId && mode === 'full' ? (
              <section aria-label="Edit matches">
                {editMatches.map((match, index) => (
                  <div key={match.id ?? `new-${index}`} className="comp-form">
                    <p className="ink__label">{`Match ${index + 1}`}</p>
                    <label>
                      <span className="ink__label">Date</span>
                      <input
                        type="date"
                        autoComplete="off"
                        aria-label={`Edit match date ${index + 1}`}
                        value={match.date ?? ''}
                        onChange={(event) =>
                          setEditMatches((rows) => rows.map((row, i) => (i === index ? { ...row, date: event.target.value } : row)))
                        }
                      />
                    </label>
                    <label>
                      <span className="ink__label">Opponent</span>
                      <input
                        aria-label={`Edit opponent ${index + 1}`}
                        value={match.opponent}
                        onChange={(event) =>
                          setEditMatches((rows) => rows.map((row, i) => (i === index ? { ...row, opponent: event.target.value } : row)))
                        }
                      />
                    </label>
                    <div className="student-games" role="group" aria-label={`Edit result ${index + 1}`}>
                      {RESULTS.map((choice) => (
                        <button
                          key={choice.id}
                          type="button"
                          className={match.result === choice.id ? 'student-choice is-on' : 'student-choice'}
                          aria-pressed={match.result === choice.id}
                          onClick={() => setEditMatches((rows) => rows.map((row, i) => (i === index ? { ...row, result: choice.id } : row)))}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                    <div className="student-games" role="group" aria-label={`Edit method ${index + 1}`}>
                      {METHODS.map((choice) => (
                        <button
                          key={choice.id}
                          type="button"
                          className={match.method === choice.id ? 'student-choice is-on' : 'student-choice'}
                          aria-pressed={match.method === choice.id}
                          onClick={() => setEditMatches((rows) => rows.map((row, i) => (i === index ? { ...row, method: choice.id } : row)))}
                        >
                          {choice.label}
                        </button>
                      ))}
                    </div>
                    <label>
                      <span className="ink__label">Match notes</span>
                      <input
                        aria-label={`Edit match notes ${index + 1}`}
                        value={match.note}
                        onChange={(event) =>
                          setEditMatches((rows) => rows.map((row, i) => (i === index ? { ...row, note: event.target.value } : row)))
                        }
                      />
                    </label>
                  </div>
                ))}
              </section>
            ) : null}
            {error ? <p role="alert">{error}</p> : null}
            <button type="submit" className="ink-btn ink-btn--save">
              {editingId ? 'Save' : mode === 'quick' ? 'Save quick result' : 'Add result'}
            </button>
            {editingId ? (
              <button type="button" className="ink-btn" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </form>
          {competition.results.length === 0 ? <p className="student-quiet">No results yet.</p> : null}
          <ul className="comp-list">
            {competition.results.map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                report={report}
                commit={commit}
                onEdit={() => beginEdit(result)}
              />
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}

function ChoiceField({
  label,
  ariaLabel,
  value,
  options,
  onChange,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span className="ink__label">{label}</span>
      <select aria-label={ariaLabel} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select…</option>
        {pickerOptions(options, value).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResultCard({
  result,
  report,
  commit,
  onEdit,
}: {
  result: CompetitionResult;
  report: ReturnType<typeof useStudentFile>['report'];
  commit: ReturnType<typeof useStudentFile>['commit'];
  onEdit: () => void;
}) {
  const [opponent, setOpponent] = useState('');
  const [outcome, setOutcome] = useState<MatchResult>('win');
  const [method, setMethod] = useState<MatchMethod>('points');
  const [matchDate, setMatchDate] = useState(todayIso);
  const [matchDateKey, setMatchDateKey] = useState(0);
  const [note, setNote] = useState('');
  const [round, setRound] = useState('');
  const [bracketName, setBracketName] = useState('');
  const [error, setError] = useState('');
  const [photo, setPhoto] = useState(() => (result.bracketPhoto ? loadBracketPhoto(result.id) : ''));
  const [confirming, setConfirming] = useState(false);
  const classLine = resultClassLine(result);
  const placeLabel = result.place ? COMPETITION_PLACE_LABELS[result.place] : '';

  return (
    <li id={result.id} className="ink tournament-card">
      <strong>{result.tournamentName}</strong>
      {result.date ? <span>{result.date}</span> : null}
      {classLine ? <span>{classLine}</span> : null}
      {placeLabel ? <span>{result.quick ? `Quick result · ${placeLabel}` : placeLabel}</span> : result.quick ? <span>Quick result</span> : null}
      {result.note ? <span>{result.note}</span> : null}
      <PodiumPhotoRow studentId={report.studentId} resultId={result.id} label={result.tournamentName} />
      {result.quick && result.matches.length === 0 ? null : (
        <ul className="comp-goals" aria-label={`Matches for ${result.tournamentName}`}>
          {result.matches.map((match) => (
            <li key={match.id}>
              <span className="match-line">
                {match.date ? <span className="match-line__date">{match.date}</span> : null}
                <span className="match-line__result">
                  {matchLabel(match.result)} · {match.opponent}
                  {match.method ? ` · ${methodLabel(match.method)}` : ''}
                  {match.note ? ` — ${match.note}` : ''}
                </span>
              </span>
              <button type="button" className="ink-btn ink-btn--small" onClick={() => commit(removeCompetitionMatch(report, result.id, match.id))}>
                {`Remove match ${match.opponent}`}
              </button>
            </li>
          ))}
        </ul>
      )}
      {result.quick ? null : (
        <form
          className="comp-form"
          onSubmit={(event) => {
            event.preventDefault();
            try {
              const picked = inputValue(event.currentTarget, 'match-date');
              const date = isIsoDate(picked) ? picked : matchDate;
              commit(addCompetitionMatch(report, result.id, { opponent, result: outcome, method, note, date }));
              setOpponent('');
              setNote('');
              setOutcome('win');
              setMethod('points');
              setMatchDate(todayIso());
              setMatchDateKey((value) => value + 1);
              setError('');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not add that match.');
            }
          }}
        >
          <p className="ink__label">Match</p>
          <label>
            <span className="ink__label">Date</span>
            <input
              key={matchDateKey}
              type="date"
              name="match-date"
              autoComplete="off"
              aria-label={`Match date for ${result.tournamentName}`}
              value={matchDate}
              onChange={(event) => setMatchDate(event.target.value)}
              required
            />
          </label>
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
      )}

      {result.quick ? null : (
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
      )}
      {error ? <p role="alert">{error}</p> : null}
      {confirming ? (
        <div className="student-confirm" role="group" aria-label={`Remove ${result.tournamentName} result`}>
          <span>Remove this result?</span>
          <button
            type="button"
            className="ink-btn"
            onClick={() => {
              deleteBracketPhoto(result.id);
              forgetPodiumPhotos(report.studentId, result.id);
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
        <div className="student-games">
          <button type="button" className="ink-btn" onClick={onEdit}>
            {`Edit ${result.tournamentName}`}
          </button>
          <button type="button" className="ink-btn" onClick={() => setConfirming(true)}>
            {`Remove ${result.tournamentName}`}
          </button>
        </div>
      )}
    </li>
  );
}

function inputValue(form: HTMLFormElement, name: string): string {
  const field = form.elements.namedItem(name);
  return field instanceof HTMLInputElement ? field.value : '';
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

