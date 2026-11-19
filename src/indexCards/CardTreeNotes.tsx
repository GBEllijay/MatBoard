/**
 * Two blocks on the index (glossary) card:
 * - Technique Tree: what this move leads to, its defenses, and what leads into it,
 *   from the student's saved links. Add a connection from here; open the full tree.
 * - Your notes: the student's own notes on the card, saved with the card.
 * Both write only the student's own card file, which syncs with their login.
 * Nothing from an instructor's roster is read or written.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CARD_NOTES_MAX, cleanNotes, withCardLink, withCardNotes, withoutCardLink, type CardLink, type LiveCard } from '../lib/indexCards.ts';
import {
  cardTree,
  connectionOptions,
  glossaryCardIdFor,
  techniqueTreeHref,
  treeStepFor,
  type ConnectionOption,
  type LinkSource,
  type Neighbor,
} from '../lib/d8TreeLinks.ts';
import { coachDoorOpen } from '../lib/productNames.ts';
import { useCoachUnlocked } from '../hooks/useCoachUnlocked';
import { useProUnlocked } from '../hooks/useProUnlocked';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { IndexTermLink } from './IndexTermLink.tsx';
import { catalogLines, closeIndexCard, commitIndexCards, getIndexCardFile } from './store.ts';
import { useTreeEdges } from './treeLinks.ts';

const SOURCE_LABEL: Record<LinkSource, string> = { tree: 'Tree', glossary: 'Tree card', card: 'Yours' };

export const CARD_TREE_EMPTY = 'No Technique Tree connections for this move yet.';
export const NOTES_SAVED = 'Saved';

function NeighborList({ title, rows, testId, onRemove }: { title: string; rows: Neighbor[]; testId: string; onRemove: (row: Neighbor) => void }) {
  if (!rows.length) return null;
  return (
    <div className="gl-tree-group" data-testid={testId}>
      <h4>{title}</h4>
      <ul className="d8sf-notes gl-tree-list">
        {rows.map((row) => (
          <li key={row.cardId ?? row.name} data-tree-neighbor={row.cardId ?? row.name}>
            {row.cardId ? <IndexTermLink name={row.cardId}>{row.name}</IndexTermLink> : <span>{row.name}</span>}
            <span className="gl-tree-source">{row.sources.map((source) => SOURCE_LABEL[source]).join(' · ')}</span>
            {row.removable ? (
              <button type="button" className="gl-tree-remove" aria-label={`Remove ${row.name}`} onClick={() => onRemove(row)}>
                Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AddRelation = 'leads' | 'defense' | 'from';

const RELATION_CHOICES: { id: AddRelation; label: string }[] = [
  { id: 'leads', label: 'Leads to' },
  { id: 'defense', label: 'Defended by' },
  { id: 'from', label: 'Comes from' },
];

export function CardTechniqueTree({ card, cards }: { card: LiveCard; cards: readonly LiveCard[] }) {
  const { edges, tree: device } = useTreeEdges(cards);
  const view = useMemo(() => cardTree(card, cards, edges), [card, cards, edges]);
  const coachOpen = coachDoorOpen(useProUnlocked(), useCoachUnlocked(), useCurrentSeat() !== null);
  const [relation, setRelation] = useState<AddRelation>('leads');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const options = useMemo(() => connectionOptions(query, cards, card.id), [query, cards, card.id]);

  useEffect(() => {
    setQuery('');
    setStatus('');
    setRelation('leads');
  }, [card.id]);

  const step = view.treeStep ?? treeStepFor(card, cards, device.archive);
  const href = techniqueTreeHref(step, glossaryCardIdFor(card));
  const empty = !view.leadsTo.length && !view.defenses.length && !view.comesFrom.length && !view.counters.length;

  const remove = (row: Neighbor) => {
    if (!row.removable) return;
    commitIndexCards(withoutCardLink(catalogLines(), getIndexCardFile(), row.removable.from, { to: row.removable.to, relation: row.removable.relation }));
    setStatus(`Removed ${row.name}.`);
  };

  /** One tap saves: the link goes on the student's card file and shows here and on the D8 right away. */
  const pick = (option: ConnectionOption) => {
    const before = getIndexCardFile();
    let next = before;
    if (relation === 'from') {
      if (option.kind === 'glossary') {
        setStatus(`${option.name} is not on your D8 yet. Add it as a move first, or pick Leads to.`);
        return;
      }
      next = withCardLink(catalogLines(), before, option.id, { to: card.id, relation: 'leads' });
    } else {
      const link: CardLink = option.kind === 'glossary' ? { to: option.id, relation, name: option.name } : { to: option.id, relation };
      next = withCardLink(catalogLines(), before, card.id, link);
    }
    if (next === before) {
      setStatus(`Already connected to ${option.name}.`);
      return;
    }
    commitIndexCards(next);
    setQuery('');
    setStatus(
      relation === 'leads' ? `Added: ${card.name} → ${option.name}.` : relation === 'from' ? `Added: ${option.name} → ${card.name}.` : `Added defense: ${option.name}.`,
    );
  };

  return (
    <section className="d8sf-index-block gl-tree" aria-label="Technique Tree" data-testid="card-tree">
      <h3>Technique Tree</h3>
      {empty ? <p className="d8sf-index-empty" data-testid="card-tree-empty">{CARD_TREE_EMPTY}</p> : null}
      <NeighborList title="Leads to" rows={view.leadsTo} testId="card-tree-leads" onRemove={remove} />
      <NeighborList title="Defenses and counters" rows={view.defenses} testId="card-tree-defenses" onRemove={remove} />
      <NeighborList title="Comes from" rows={view.comesFrom} testId="card-tree-from" onRemove={remove} />
      <NeighborList title="Defends against" rows={view.counters} testId="card-tree-counters" onRemove={remove} />
      <div className="gl-tree-add" data-testid="card-tree-add">
        <p className="d8sf-kicker">Add a connection</p>
        <div className="gl-tree-relations" role="radiogroup" aria-label="Connection type">
          {RELATION_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={relation === choice.id}
              data-relation={choice.id}
              onClick={() => setRelation(choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Find a move to connect"
          data-testid="card-tree-search"
          placeholder={`${card.name} ${RELATION_CHOICES.find((choice) => choice.id === relation)?.label.toLowerCase()}…`}
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && options[0]) {
              event.preventDefault();
              pick(options[0]);
            }
            if (event.key === 'Escape' && query) {
              event.preventDefault();
              event.stopPropagation();
              setQuery('');
            }
          }}
        />
        {query.trim() ? (
          options.length ? (
            <ul className="gl-suggest gl-tree-options" role="listbox" aria-label="Moves to connect" data-testid="card-tree-options">
              {options.map((option) => (
                <li key={option.id} role="option" aria-selected="false">
                  <button type="button" data-connect={option.id} onClick={() => pick(option)}>
                    <span>
                      {option.name}
                      {option.matched ? <small>{` · also ${option.matched}`}</small> : null}
                    </span>
                    <small>{option.kind === 'mine' ? `Yours · ${option.faceLabel}` : option.kind === 'glossary' ? `Glossary · ${option.faceLabel}` : option.faceLabel}</small>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="gl-note">No move matches. Add it to your D8 first with Add a move.</p>
          )
        ) : null}
      </div>
      {coachOpen ? (
        <p className="gl-edit-row">
          <Link to={href} className="gl-tree-open" data-testid="card-tree-open" onClick={() => closeIndexCard()}>
            Open in Technique Tree
          </Link>
        </p>
      ) : null}
      <p className="gl-note" aria-live="polite" data-testid="card-tree-status">
        {status}
      </p>
    </section>
  );
}

export function CardNotes({ card }: { card: LiveCard }) {
  const saved = card.notes ?? '';
  const [draft, setDraft] = useState(saved);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    setDraft(card.notes ?? '');
    setSavedAt(0);
  }, [card.id]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = window.setTimeout(() => setSavedAt(0), 2000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  const dirty = cleanNotes(draft) !== saved;
  const save = () => {
    if (!dirty) return;
    commitIndexCards(withCardNotes(catalogLines(), getIndexCardFile(), card.id, draft));
    setSavedAt(Date.now());
  };

  return (
    <section className="d8sf-index-block gl-card-notes" aria-label="Your notes" data-testid="card-notes">
      <h3>Your notes</h3>
      <textarea
        aria-label={`Notes on ${card.name}`}
        data-testid="card-notes-input"
        value={draft}
        maxLength={CARD_NOTES_MAX}
        rows={3}
        placeholder={card.custom ? 'Details, setups, cues for your move…' : 'Your own cues and details…'}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
      />
      <div className="gl-edit-row">
        <button type="button" data-testid="card-notes-save" disabled={!dirty} onClick={save}>
          Save notes
        </button>
        <span className="d8-rate-saved" data-testid="card-notes-saved" data-on={savedAt ? 'true' : 'false'} aria-live="polite">
          {savedAt ? NOTES_SAVED : ''}
        </span>
      </div>
    </section>
  );
}
