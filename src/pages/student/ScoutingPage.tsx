import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RadarChart, type RadarSeries } from '../../components/RadarChart';
import { competitionOf } from '../../lib/progress/competition';
import type { CompetitionResult } from '../../lib/progress/types';
import {
  compareToOpponent,
  isCompleteRatings,
  matchupLabels,
  matchupLine,
  type AreaRatings,
} from '../../lib/opponentAssessment';
import { BELT_CHOICES, NOTE_MAX } from '../../lib/rosterStore';
import { ASSESSMENT_AREAS, loadAssessments, type AssessmentScores } from '../../lib/studentAssessment';
import {
  SCOUTING_GYM_LABEL,
  addScoutingCard,
  emptyScoutingDraft,
  exportScoutingCsv,
  importScoutingCsvFile,
  loadScouting,
  pastMatchesFor,
  removeScoutingCard,
  saveScouting,
  scoutingCsvTemplate,
  scoutingDownload,
  scoutingImportSummary,
  searchScoutingCards,
  scoutGroupLabel,
  updateScoutingCard,
  type ScoutingCard,
  type ScoutingDraft,
} from '../../lib/studentScouting';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';

export function ScoutingPage() {
  const to = useStudentPath();
  const { report } = useStudentFile();
  const results = competitionOf(report).results;
  const [cards, setCards] = useState(() => loadScouting(localStorage));
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ScoutingDraft>(emptyScoutingDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [csvNote, setCsvNote] = useState('');
  const csvRef = useRef<HTMLInputElement>(null);
  const [selfScores] = useState(() => loadAssessments(localStorage).entries[0]?.scores ?? null);
  const shown = useMemo(() => searchScoutingCards(cards, results, query), [cards, results, query]);
  const weight = shown.filter((card) => card.group !== 'open');
  const open = shown.filter((card) => card.group === 'open');

  const commit = (next: ScoutingCard[]) => {
    setCards(saveScouting(localStorage, next));
  };

  const save = () => {
    try {
      if (editing) {
        const current = cards.find((card) => card.id === editing);
        commit(
          updateScoutingCard(cards, editing, {
            ...draft,
            ratings: current?.ratings ?? draft.ratings,
            strengths: current?.strengths ?? draft.strengths,
            weaknesses: current?.weaknesses ?? draft.weaknesses,
          }),
        );
      } else {
        commit(addScoutingCard(cards, draft));
      }
      setDraft(emptyScoutingDraft());
      setEditing(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that opponent.');
    }
  };

  const saveTracker = (card: ScoutingCard, patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => {
    commit(updateScoutingCard(cards, card.id, { ...draftFromCard(card), ...patch }));
  };

  return (
    <main className="student student-frame student--arena">
      <StudentMarks />
      <LeatherHeader title="Scouting-Opponent Research" />
      <div className="student-paper">
        <div className="student-sheet">
          <p className="student-quiet">
            Cards for opponents in your weight class and in open class stay on this phone. A past match appears when that name is in Competition results.
          </p>
          <div className="student-actions">
            <button type="button" className="ink-btn" onClick={() => scoutingDownload('advantage-roster-template.csv', scoutingCsvTemplate())}>
              Download template
            </button>
            <button type="button" className="ink-btn" onClick={() => csvRef.current?.click()}>
              Import CSV
            </button>
            <button type="button" className="ink-btn" onClick={() => scoutingDownload('advantage-roster.csv', exportScoutingCsv(cards))}>
              Export CSV
            </button>
            <input
              ref={csvRef}
              className="student-file"
              type="file"
              accept=".csv,text/csv"
              aria-label="Import opponent CSV"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                void importScoutingCsvFile(file).then((result) => {
                  if (result.error) {
                    setCsvNote(result.error);
                    return;
                  }
                  commit([...cards, ...result.cards]);
                  setCsvNote(scoutingImportSummary(result));
                });
              }}
            />
          </div>
          {csvNote ? <p role="status">{csvNote}</p> : null}
          <label className="ink student-search">
            <span className="ink__label">Search</span>
            <input
              aria-label="Search opponents"
              value={query}
              placeholder="Name, gym, style, or match"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <section className="ink" aria-label="Scouting-Opponent Tracker">
            <h2 className="ink__label">Scouting-Opponent Tracker</h2>
            <p className="student-quiet">
              Rate an opponent on the same seven areas as your self-assessment. Strengths, weaknesses, and the me versus them chart stay on this phone with the card.
            </p>
          </section>

          <ScoutList
            title="Weight class"
            cards={weight}
            results={results}
            to={to}
            confirming={confirming}
            selfScores={selfScores}
            onEdit={(card) => {
              setEditing(card.id);
              setDraft(draftFromCard(card));
              setConfirming(null);
              setError('');
            }}
            onAskRemove={setConfirming}
            onKeep={() => setConfirming(null)}
            onTracker={saveTracker}
            onRemove={(id) => {
              commit(removeScoutingCard(cards, id));
              setConfirming(null);
              if (editing === id) {
                setEditing(null);
                setDraft(emptyScoutingDraft());
              }
            }}
          />
          <ScoutList
            title="Open class"
            cards={open}
            results={results}
            to={to}
            confirming={confirming}
            selfScores={selfScores}
            onEdit={(card) => {
              setEditing(card.id);
              setDraft(draftFromCard(card));
              setConfirming(null);
              setError('');
            }}
            onAskRemove={setConfirming}
            onKeep={() => setConfirming(null)}
            onTracker={saveTracker}
            onRemove={(id) => {
              commit(removeScoutingCard(cards, id));
              setConfirming(null);
              if (editing === id) {
                setEditing(null);
                setDraft(emptyScoutingDraft());
              }
            }}
          />

          <form
            className="comp-form"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <p className="ink__label">{editing ? 'Edit opponent' : 'Add an opponent'}</p>
            <div className="student-games" role="group" aria-label="Opponent class">
              {(['weight', 'open'] as const).map((group) => (
                <button
                  key={group}
                  type="button"
                  className={draft.group === group ? 'student-choice is-on' : 'student-choice'}
                  aria-pressed={draft.group === group}
                  onClick={() => setDraft({ ...draft, group })}
                >
                  {scoutGroupLabel(group)}
                </button>
              ))}
            </div>
            <label>
              <span className="ink__label">Name</span>
              <input aria-label="Opponent name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
            </label>
            <label>
              <span className="ink__label">{SCOUTING_GYM_LABEL}</span>
              <input aria-label="Opponent gym" value={draft.gym} onChange={(event) => setDraft({ ...draft, gym: event.target.value })} />
            </label>
            <label>
              <span className="ink__label">Belt</span>
              <select aria-label="Opponent belt" value={draft.belt} onChange={(event) => setDraft({ ...draft, belt: event.target.value })} required>
                <option value="">Choose a belt</option>
                {BELT_CHOICES.map((belt) => (
                  <option key={belt} value={belt}>
                    {belt}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="ink__label">Weight class</span>
              <input
                aria-label="Opponent weight class"
                value={draft.weightClass}
                onChange={(event) => setDraft({ ...draft, weightClass: event.target.value })}
              />
            </label>
            <label>
              <span className="ink__label">Style and tendencies</span>
              <textarea
                aria-label="Opponent style"
                rows={3}
                value={draft.style}
                onChange={(event) => setDraft({ ...draft, style: event.target.value })}
              />
            </label>
            <label>
              <span className="ink__label">Notes</span>
              <textarea
                aria-label="Opponent notes"
                rows={3}
                value={draft.notes}
                onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
              />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="student-actions">
              <button type="submit" className="ink-btn ink-btn--save">
                {editing ? 'Save opponent' : 'Add opponent'}
              </button>
              {editing ? (
                <button
                  type="button"
                  className="ink-btn"
                  onClick={() => {
                    setEditing(null);
                    setDraft(emptyScoutingDraft());
                    setError('');
                  }}
                >
                  Cancel opponent edit
                </button>
              ) : null}
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

function draftFromCard(card: ScoutingCard): ScoutingDraft {
  return {
    name: card.name,
    gym: card.gym,
    belt: card.belt,
    weightClass: card.weightClass,
    group: card.group,
    style: card.style,
    notes: card.notes,
    ratings: card.ratings,
    strengths: card.strengths,
    weaknesses: card.weaknesses,
  };
}

function ScoutList({
  title,
  cards,
  results,
  to,
  confirming,
  selfScores,
  onEdit,
  onAskRemove,
  onKeep,
  onTracker,
  onRemove,
}: {
  title: string;
  cards: ScoutingCard[];
  results: CompetitionResult[];
  to: (path: string) => string;
  confirming: string | null;
  selfScores: AssessmentScores | null;
  onEdit: (card: ScoutingCard) => void;
  onAskRemove: (id: string) => void;
  onKeep: () => void;
  onTracker: (card: ScoutingCard, patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="ink" aria-label={title}>
      <h2 className="ink__label">{title}</h2>
      {cards.length === 0 ? <p className="student-quiet">No opponents in this class yet.</p> : null}
      <ul className="comp-list">
        {cards.map((card) => {
          const matches = pastMatchesFor(card.name, results);
          return (
            <li key={card.id} className="ink">
              <strong>{card.name}</strong>
              <span>
                {[card.belt, card.weightClass, card.gym].filter(Boolean).join(' · ')}
              </span>
              {card.style ? <span>{card.style}</span> : null}
              {card.notes ? <span>{card.notes}</span> : null}
              <div aria-label={`Past matches for ${card.name}`}>
                {matches.length === 0 ? <p className="student-quiet">No recorded matches yet.</p> : null}
                {matches.map((hit) => (
                  <p key={hit.match.id}>
                    <Link to={to(`/student/results#${hit.result.id}`)}>
                      {`${hit.result.tournamentName} · ${matchWord(hit.match.result)}${hit.match.method ? ` · ${hit.match.method}` : ''}`}
                    </Link>
                  </p>
                ))}
              </div>
              <OpponentTracker card={card} selfScores={selfScores} to={to} onSave={(patch) => onTracker(card, patch)} />
              {confirming === card.id ? (
                <div className="student-confirm" role="group" aria-label={`Remove ${card.name}`}>
                  <button type="button" className="ink-btn" onClick={() => onRemove(card.id)}>
                    {`Confirm remove ${card.name}`}
                  </button>
                  <button type="button" className="ink-btn" onClick={onKeep}>
                    Keep opponent
                  </button>
                </div>
              ) : (
                <div className="student-clip__actions">
                  <button type="button" className="ink-btn ink-btn--small" onClick={() => onEdit(card)}>
                    {`Edit ${card.name}`}
                  </button>
                  <button type="button" className="ink-btn ink-btn--small" onClick={() => onAskRemove(card.id)}>
                    {`Remove ${card.name}`}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function matchWord(result: CompetitionResult['matches'][number]['result']): string {
  if (result === 'win') return 'Win';
  if (result === 'draw') return 'Draw';
  return 'Loss';
}

function chartSeries(name: string, mine: AssessmentScores | null, theirs: AssessmentScores | null): RadarSeries[] {
  const series: RadarSeries[] = [];
  if (mine) series.push({ name: 'Me', scores: mine, tone: 'me' });
  if (theirs) series.push({ name, scores: theirs, tone: 'opponent' });
  if (!series.length) series.push({ name, scores: null, tone: 'opponent' });
  return series;
}

function OpponentTracker({
  card,
  selfScores,
  to,
  onSave,
}: {
  card: ScoutingCard;
  selfScores: AssessmentScores | null;
  to: (path: string) => string;
  onSave: (patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => void;
}) {
  const theirs = isCompleteRatings(card.ratings) ? card.ratings : null;
  const rows = compareToOpponent(selfScores, card.ratings);
  const groups = matchupLabels(rows);
  const save = (patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => onSave(patch);

  return (
    <section className="scout-tracker" aria-label={`Scouting-Opponent Tracker for ${card.name}`}>
      <div className="scout-rates" role="group" aria-label={`Ratings for ${card.name}`}>
        <h3>Scouting-Opponent Tracker</h3>
        <p className="student-quiet">{`Rate ${card.name}. 1 is early. 5 is ready to rely on.`}</p>
        {ASSESSMENT_AREAS.map((area) => (
          <fieldset key={area.id} className="assess-area">
            <legend>{area.label}</legend>
            <div className="assess-scale" role="group" aria-label={`${card.name} ${area.label} rating`}>
              {([1, 2, 3, 4, 5] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={card.ratings[area.id] === value ? 'assess-tap is-on' : 'assess-tap'}
                  aria-pressed={card.ratings[area.id] === value}
                  aria-label={`${card.name} ${area.label} ${value}`}
                  onClick={() => save({ ratings: { ...card.ratings, [area.id]: value }, strengths: card.strengths, weaknesses: card.weaknesses })}
                >
                  {value}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
        <label>
          <span className="ink__label">Strengths</span>
          <textarea
            aria-label={`Strengths for ${card.name}`}
            rows={3}
            maxLength={NOTE_MAX}
            value={card.strengths}
            onChange={(event) => save({ ratings: card.ratings, strengths: event.target.value, weaknesses: card.weaknesses })}
          />
        </label>
        <label>
          <span className="ink__label">Weaknesses</span>
          <textarea
            aria-label={`Weaknesses for ${card.name}`}
            rows={3}
            maxLength={NOTE_MAX}
            value={card.weaknesses}
            onChange={(event) => save({ ratings: card.ratings, strengths: card.strengths, weaknesses: event.target.value })}
          />
        </label>
        <div className="student-actions">
          <button
            type="button"
            className="ink-btn ink-btn--save"
            onClick={() => save({ ratings: card.ratings, strengths: card.strengths, weaknesses: card.weaknesses })}
          >
            {`Save notes for ${card.name}`}
          </button>
        </div>
      </div>
      <div className="scout-overlay" role="region" aria-label={`Me versus ${card.name}`}>
        <RadarChart
          series={chartSeries(card.name, selfScores, theirs)}
          title={selfScores && theirs ? 'Me vs them' : 'Shape'}
          empty="Rate this opponent to see their shape."
        />
        {selfScores && rows.length ? (
          <ul className="scout-matchup" aria-label={`Comparison with ${card.name}`}>
            <li>{`Favored: ${matchupLine(groups.favored)}`}</li>
            <li>{`Even: ${matchupLine(groups.even)}`}</li>
            <li>{`At a disadvantage: ${matchupLine(groups.disadvantage)}`}</li>
          </ul>
        ) : null}
        {selfScores && rows.length === 0 ? <p className="student-quiet">Rate this opponent to compare.</p> : null}
        {selfScores ? null : (
          <Link className="assess-link" to={to('/student/competitor#self-assessment')}>
            Do your self-assessment
          </Link>
        )}
      </div>
    </section>
  );
}
