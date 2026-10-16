import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { competitionOf } from '../../lib/progress/competition';
import type { CompetitionResult } from '../../lib/progress/types';
import { BELT_CHOICES } from '../../lib/rosterStore';
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
  const shown = useMemo(() => searchScoutingCards(cards, results, query), [cards, results, query]);
  const weight = shown.filter((card) => card.group !== 'open');
  const open = shown.filter((card) => card.group === 'open');

  const commit = (next: ScoutingCard[]) => {
    setCards(saveScouting(localStorage, next));
  };

  const save = () => {
    try {
      commit(editing ? updateScoutingCard(cards, editing, draft) : addScoutingCard(cards, draft));
      setDraft(emptyScoutingDraft());
      setEditing(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that opponent.');
    }
  };

  return (
    <main className="student student-frame student--arena">
      <StudentMarks />
      <LeatherHeader title="Scouting" />
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

          <ScoutList
            title="Weight class"
            cards={weight}
            results={results}
            to={to}
            confirming={confirming}
            onEdit={(card) => {
              setEditing(card.id);
              setDraft(draftFromCard(card));
              setConfirming(null);
              setError('');
            }}
            onAskRemove={setConfirming}
            onKeep={() => setConfirming(null)}
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
            onEdit={(card) => {
              setEditing(card.id);
              setDraft(draftFromCard(card));
              setConfirming(null);
              setError('');
            }}
            onAskRemove={setConfirming}
            onKeep={() => setConfirming(null)}
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
  };
}

function ScoutList({
  title,
  cards,
  results,
  to,
  confirming,
  onEdit,
  onAskRemove,
  onKeep,
  onRemove,
}: {
  title: string;
  cards: ScoutingCard[];
  results: CompetitionResult[];
  to: (path: string) => string;
  confirming: string | null;
  onEdit: (card: ScoutingCard) => void;
  onAskRemove: (id: string) => void;
  onKeep: () => void;
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
