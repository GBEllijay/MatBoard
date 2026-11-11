import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ScoutCage } from '../../components/CleanCage';
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
import { ASSESSMENT_FORM_AREAS, loadAssessments, type AssessmentScores } from '../../lib/studentAssessment';
import { subscribeStudentJournal } from '../../lib/studentDemo';
import {
  SCOUTING_GYM_LABEL,
  addScoutBout,
  addScoutingCard,
  emptyScoutingDraft,
  exportScoutingCsv,
  importScoutingCsvFile,
  pastMatchesFor,
  removeScoutBout,
  removeScoutingCard,
  saveScouting,
  scoutGroupLabel,
  scoutRecord,
  scoutingCsvTemplate,
  scoutingDownload,
  scoutingExportFileName,
  scoutingImportSummary,
  scoutingTemplateFileName,
  searchScoutingCards,
  seedSampleScouting,
  updateScoutBout,
  updateScoutingCard,
  type ScoutBout,
  type ScoutBoutDraft,
  type ScoutResult,
  type ScoutingCard,
  type ScoutingDraft,
} from '../../lib/studentScouting';
import { todayIso } from '../../lib/studentEdition';
import { factorsFromRatings } from '../../preview/crystallineSweeps/overlay';
import { TopoStage } from '../../preview/crystallineSweeps/TopoStage';
import { buildTopo } from '../../preview/crystallineSweeps/topo';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';
import { SuggestField } from './SuggestField';
import '../../preview/crystallineSweeps/crystallineSweeps.css';
import './archive.css';

const CARD_DIAMOND = buildTopo(() => null);

export function ScoutingPage() {
  const to = useStudentPath();
  const location = useLocation();
  const { report } = useStudentFile();
  const results = competitionOf(report).results;
  const [cards, setCards] = useState(() => seedSampleScouting(localStorage, location.search));
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<ScoutingDraft>(emptyScoutingDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [csvNote, setCsvNote] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const csvRef = useRef<HTMLInputElement>(null);
  const [selfScores, setSelfScores] = useState(() => loadAssessments(localStorage).entries[0]?.scores ?? null);
  useEffect(() => {
    return subscribeStudentJournal(() => {
      const latest = loadAssessments(localStorage).entries[0]?.scores ?? null;
      setSelfScores(latest);
    });
  }, []);
  const shown = useMemo(() => searchScoutingCards(cards, results, query), [cards, results, query]);
  const weight = shown.filter((card) => card.group !== 'open');
  const open = shown.filter((card) => card.group === 'open');
  const sample = cards.some((card) => card.name.includes('(sample)'));
  const sampleQuery = location.search.includes('sample=1');

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
            bouts: current?.bouts,
          }),
        );
        setFocusId(null);
      } else {
        const next = addScoutingCard(cards, draft);
        const added = next.find((card) => !cards.some((item) => item.id === card.id));
        commit(next);
        setQuery('');
        setFocusId(added?.id ?? null);
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

  const saveBouts = (card: ScoutingCard, bouts: ScoutBout[]) => {
    commit(updateScoutingCard(cards, card.id, { ...draftFromCard(card), bouts }));
  };

  return (
    <main className="student student-frame student--arena student--archive">
      <StudentMarks />
      <LeatherHeader title="Opponent card archive" />
      <div className="student-paper">
        <div className="student-sheet">
          <p className="archive-help">Every saved opponent stays on this phone. Search, edit, and remove a card any time.</p>
          {sample ? <p className="archive-help">Sample opponents are labeled sample. They are not real students.</p> : null}
          <div className="student-actions">
            <button type="button" className="ink-btn" onClick={() => scoutingDownload(scoutingTemplateFileName(), scoutingCsvTemplate())}>
              Download template
            </button>
            <button type="button" className="ink-btn" onClick={() => csvRef.current?.click()}>
              Import CSV
            </button>
            <button type="button" className="ink-btn" onClick={() => scoutingDownload(scoutingExportFileName(todayIso()), exportScoutingCsv(cards))}>
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

          <section className="archive-panel" aria-label="Opponent card archive">
            <p className="archive-kicker">Archive</p>
            <h2>Opponent card archive</h2>
            <p className="archive-help">Rate each opponent on the eight areas. The record is wins, losses, and draws.</p>
          </section>

          <ScoutList
            title="Weight class"
            help="Opponents in your weight class."
            cards={weight}
            results={results}
            to={to}
            confirming={confirming}
            selfScores={selfScores}
            focusId={focusId}
            sampleQuery={sampleQuery}
            onEdit={(card) => {
              setEditing(card.id);
              setDraft(draftFromCard(card));
              setConfirming(null);
              setError('');
            }}
            onAskRemove={setConfirming}
            onKeep={() => setConfirming(null)}
            onTracker={saveTracker}
            onBouts={saveBouts}
            onRemove={(id) => {
              commit(removeScoutingCard(cards, id));
              setConfirming(null);
              if (editing === id) {
                setEditing(null);
                setDraft(emptyScoutingDraft());
              }
              if (focusId === id) setFocusId(null);
            }}
          />
          <ScoutList
            title="Open class"
            help="Opponents in open class."
            cards={open}
            results={results}
            to={to}
            confirming={confirming}
            selfScores={selfScores}
            focusId={focusId}
            sampleQuery={sampleQuery}
            onEdit={(card) => {
              setEditing(card.id);
              setDraft(draftFromCard(card));
              setConfirming(null);
              setError('');
            }}
            onAskRemove={setConfirming}
            onKeep={() => setConfirming(null)}
            onTracker={saveTracker}
            onBouts={saveBouts}
            onRemove={(id) => {
              commit(removeScoutingCard(cards, id));
              setConfirming(null);
              if (editing === id) {
                setEditing(null);
                setDraft(emptyScoutingDraft());
              }
              if (focusId === id) setFocusId(null);
            }}
          />

          <form
            className="comp-form archive-panel"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <p className="archive-kicker">{editing ? 'Edit' : 'New card'}</p>
            <p className="ink__label">{editing ? 'Edit opponent' : 'Add an opponent'}</p>
            <p className="archive-help">Name and belt start the card.</p>
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
            <SuggestField
              label="Weight class"
              ariaLabel="Opponent weight class"
              kind="weight"
              value={draft.weightClass}
              used={cards.map((card) => card.weightClass)}
              onChange={(weightClass) => setDraft({ ...draft, weightClass })}
            />
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
    bouts: card.bouts,
  };
}

function ScoutList({
  title,
  help,
  cards,
  results,
  to,
  confirming,
  selfScores,
  focusId,
  sampleQuery,
  onEdit,
  onAskRemove,
  onKeep,
  onTracker,
  onBouts,
  onRemove,
}: {
  title: string;
  help: string;
  cards: ScoutingCard[];
  results: CompetitionResult[];
  to: (path: string) => string;
  confirming: string | null;
  selfScores: AssessmentScores | null;
  focusId: string | null;
  sampleQuery: boolean;
  onEdit: (card: ScoutingCard) => void;
  onAskRemove: (id: string) => void;
  onKeep: () => void;
  onTracker: (card: ScoutingCard, patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => void;
  onBouts: (card: ScoutingCard, bouts: ScoutBout[]) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="archive-panel" aria-label={title}>
      <h2 className="ink__label">{title}</h2>
      <p className="archive-help">{help}</p>
      {cards.length === 0 ? <p className="student-quiet">No opponents in this class yet.</p> : null}
      <ul className="comp-list">
        {cards.map((card) => {
          const matches = pastMatchesFor(card.name, results);
          const record = scoutRecord(card, results);
          const crystal = `/preview/crystalline-sweeps?opponent=${encodeURIComponent(card.id)}${sampleQuery ? '&sample=1' : ''}`;
          return (
            <li key={card.id} className="archive-card">
              <div className="archive-card__head">
                <strong>{card.name}</strong>
                <span className="archive-record" aria-label={`Record ${record.line}`}>
                  {record.line}
                </span>
              </div>
              <span>{[card.belt, card.weightClass, card.gym].filter(Boolean).join(' · ')}</span>
              {card.style ? <span>{card.style}</span> : null}
              {card.notes ? <span>{card.notes}</span> : null}
              <div aria-label={`Past matches for ${card.name}`}>
                {matches.length === 0 ? <p className="student-quiet">No competition results for this name yet.</p> : null}
                {matches.map((hit) => (
                  <p key={hit.match.id}>
                    <Link to={to(`/student/results#${hit.result.id}`)}>
                      {`${hit.result.tournamentName} · ${matchWord(hit.match.result)}${hit.match.method ? ` · ${hit.match.method}` : ''}`}
                    </Link>
                  </p>
                ))}
              </div>
              <RecordEditor card={card} recordLine={record.line} onChange={(bouts) => onBouts(card, bouts)} />
              <OpponentTracker
                card={card}
                selfScores={selfScores}
                to={to}
                focus={focusId === card.id}
                onSave={(patch) => onTracker(card, patch)}
              />
              <div className="archive-actions">
                <Link className="ink-btn ink-btn--small" to={crystal}>
                  Open in D8 assessment
                </Link>
              </div>
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

function RecordEditor({
  card,
  recordLine,
  onChange,
}: {
  card: ScoutingCard;
  recordLine: string;
  onChange: (bouts: ScoutBout[]) => void;
}) {
  const [draft, setDraft] = useState<ScoutBoutDraft>({ result: 'win', date: '', event: '', method: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const save = (event: FormEvent) => {
    event.preventDefault();
    try {
      const next = editingId ? updateScoutBout(card.bouts, editingId, draft) : addScoutBout(card.bouts, draft);
      onChange(next);
      setEditingId(null);
      setDraft({ result: 'win', date: '', event: '', method: '' });
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that result.');
    }
  };

  return (
    <section aria-label={`Record for ${card.name}`}>
      <h3>Record {recordLine}</h3>
      <p className="archive-help">Wins, losses, and draws. Competition results with the same event count once.</p>
      <form onSubmit={save}>
        <div className="student-games" role="group" aria-label={`Result against ${card.name}`}>
          {(['win', 'loss', 'draw'] as const).map((result) => (
            <button
              key={result}
              type="button"
              className={draft.result === result ? 'student-choice is-on' : 'student-choice'}
              aria-pressed={draft.result === result}
              aria-label={`${card.name} result ${resultWord(result)}`}
              onClick={() => setDraft({ ...draft, result })}
            >
              {resultWord(result)}
            </button>
          ))}
        </div>
        <label>
          <span className="ink__label">Date</span>
          <input
            type="date"
            aria-label={`Date against ${card.name}`}
            value={draft.date ?? ''}
            onChange={(event) => setDraft({ ...draft, date: event.target.value })}
          />
        </label>
        <label>
          <span className="ink__label">Event</span>
          <input
            aria-label={`Event against ${card.name}`}
            value={draft.event ?? ''}
            onChange={(event) => setDraft({ ...draft, event: event.target.value })}
          />
        </label>
        <label>
          <span className="ink__label">Method</span>
          <input
            aria-label={`Method against ${card.name}`}
            value={draft.method ?? ''}
            onChange={(event) => setDraft({ ...draft, method: event.target.value })}
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="student-actions">
          <button type="submit" className="ink-btn ink-btn--save">
            {editingId ? `Save result for ${card.name}` : `Add result for ${card.name}`}
          </button>
          {editingId ? (
            <button
              type="button"
              className="ink-btn"
              onClick={() => {
                setEditingId(null);
                setDraft({ result: 'win', date: '', event: '', method: '' });
                setError('');
              }}
            >
              {`Cancel result for ${card.name}`}
            </button>
          ) : null}
        </div>
      </form>
      {card.bouts.length ? (
        <ul className="archive-results">
          {card.bouts.map((bout, index) => (
            <li key={bout.id}>
              <span>{boutLine(bout)}</span>
              <button
                type="button"
                className="ink-btn ink-btn--small"
                onClick={() => {
                  setEditingId(bout.id);
                  setDraft({ result: bout.result, date: bout.date, event: bout.event, method: bout.method });
                  setError('');
                }}
              >
                {`Edit result ${index + 1} for ${card.name}`}
              </button>
              <button type="button" className="ink-btn ink-btn--small" onClick={() => onChange(removeScoutBout(card.bouts, bout.id))}>
                {`Remove result ${index + 1} for ${card.name}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function boutLine(bout: ScoutBout): string {
  return [resultWord(bout.result), bout.date, bout.event, bout.method].filter(Boolean).join(' · ');
}

function resultWord(result: ScoutResult): string {
  if (result === 'win') return 'Win';
  if (result === 'draw') return 'Draw';
  return 'Loss';
}

function matchWord(result: CompetitionResult['matches'][number]['result']): string {
  if (result === 'win') return 'Win';
  if (result === 'draw') return 'Draw';
  return 'Loss';
}

function OpponentTracker({
  card,
  selfScores,
  to,
  focus,
  onSave,
}: {
  card: ScoutingCard;
  selfScores: AssessmentScores | null;
  to: (path: string) => string;
  focus: boolean;
  onSave: (patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => void;
}) {
  const rateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focus) return;
    const node = rateRef.current;
    if (!node) return;
    if (typeof node.scrollIntoView === 'function') {
      try {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch {
        /* The rating section is still focused when scrolling is unavailable. */
      }
    }
    node.focus();
  }, [focus]);
  const [graph, setGraph] = useState<'diamond' | 'spider'>('diamond');
  const theirs = isCompleteRatings(card.ratings) ? card.ratings : null;
  const rows = compareToOpponent(selfScores, card.ratings);
  const groups = matchupLabels(rows);
  const save = (patch: { ratings: AreaRatings; strengths: string; weaknesses: string }) => onSave(patch);
  const factors = useMemo(
    () => ({ self: factorsFromRatings(selfScores), opponent: factorsFromRatings(card.ratings) }),
    [selfScores, card.ratings],
  );
  const comparing = Object.keys(factors.self).length + Object.keys(factors.opponent).length > 0;

  return (
    <section className="scout-tracker" aria-label={`Opponent card for ${card.name}`}>
      <div ref={rateRef} className="scout-rates archive-ratings" role="group" tabIndex={-1} aria-label={`Ratings for ${card.name}`}>
        <h3>Ratings</h3>
        <p className="archive-help">{`Rate ${card.name}. 1 is early. 5 is ready to rely on.`}</p>
        {/* Same eight faces as the daily check-in. No sub-item ratings. Sweeps stays optional. */}
        {ASSESSMENT_FORM_AREAS.map((area) => (
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
      <div className="scout-overlay" role="region" aria-label={`Me versus ${card.name}`} data-graph={graph}>
        <div className="archive-graph" role="group" aria-label={`Graph for ${card.name}`}>
          <button
            type="button"
            className={graph === 'diamond' ? 'student-choice is-on' : 'student-choice'}
            aria-pressed={graph === 'diamond'}
            aria-label={`Diamond for ${card.name}`}
            onClick={() => setGraph('diamond')}
          >
            Diamond
          </button>
          <button
            type="button"
            className={graph === 'spider' ? 'student-choice is-on' : 'student-choice'}
            aria-pressed={graph === 'spider'}
            aria-label={`Spider for ${card.name}`}
            onClick={() => setGraph('spider')}
          >
            Spider
          </button>
        </div>
        <p className="archive-help">
          {graph === 'diamond' ? 'Eight areas on one shape. Peaks are stronger. Dips need work.' : 'The same areas as a spider graph.'}
        </p>
        {graph === 'diamond' ? (
          <div className="archive-diamond">
            <TopoStage
              model={CARD_DIAMOND}
              style="pyramid"
              focus={-1}
              selected={-1}
              comparison={comparing}
              pair={false}
              compareFactors={comparing ? factors : null}
              links={[]}
              drillPath={[]}
              relief={1}
              hue={1}
              chrome="bare"
              spin={false}
              onFocus={() => {}}
              onSelect={() => {}}
              onDrill={() => {}}
            />
          </div>
        ) : (
          <ScoutCage
            mine={selfScores}
            theirs={theirs}
            opponentName={card.name}
            title={selfScores && theirs ? 'Me vs them' : 'Shape'}
            empty="Rate this opponent to see their shape."
          />
        )}
        {selfScores && rows.length ? (
          <ul className="scout-matchup" aria-label={`Comparison with ${card.name}`}>
            <li>{`Favored: ${matchupLine(groups.favored)}`}</li>
            <li>{`Even: ${matchupLine(groups.even)}`}</li>
            <li>{`At a disadvantage: ${matchupLine(groups.disadvantage)}`}</li>
          </ul>
        ) : null}
        {selfScores && rows.length === 0 ? <p className="student-quiet">Rate this opponent to compare.</p> : null}
        {selfScores ? null : (
          <Link className="assess-link" to={to('/student/self-assessment?from=scouting')}>
            Do your self-assessment
          </Link>
        )}
      </div>
    </section>
  );
}
