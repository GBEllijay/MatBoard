/**
 * The instructor D12 card sheet. Same cream index card as the student D8
 * (IndexCardHost + CardTreeNotes): title and Close, D12 face, glossary,
 * Rename or move, Path to Mastery connections, Your notes, Videos, Rate it.
 * The glossary is the instructor glossary, not the BJJ technique glossary.
 *
 * Cards write only through onCommitCards (the D12 cards key); connections
 * only through onCommitLinks (the Path to Mastery key). The daily check-in is
 * never written here.
 */
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import { INSTRUCTOR_D12_FACES, type InstructorD12FaceId } from '../lib/instructorD12';
import {
  D12_CARD_NOTES_MAX,
  D12_CONFIRM_DELETE_CARD,
  D12_DELETE_CARD,
  D12_DELETE_PROMPT,
  D12_KEEP_CARD,
  DUPLICATE_NAME,
  addInstructorD12Card,
  cleanD12Notes,
  d12CardRatingNote,
  editInstructorD12Card,
  rateInstructorD12Card,
  removeInstructorD12Card,
  shownD12CardRating,
  withD12CardNotes,
  withD12CardVideo,
  withoutD12CardVideo,
  type InstructorD12Card,
} from '../lib/instructorD12Cards';
import { instructorGlossaryTerm } from '../lib/instructorGlossary';
import {
  D12_RELATION_CHOICES,
  PATH_TO_MASTERY,
  PATH_TO_MASTERY_EMPTY,
  VIEW_ON_PATH_TO_MASTERY,
  d12CardMastery,
  d12ConnectionOptions,
  d12MasteryEmpty,
  withD12Link,
  withoutD12Link,
  type D12AddRelation,
  type D12ConnectionOption,
  type D12Link,
  type D12Neighbor,
} from '../lib/instructorD12Mastery';
import type { AssessmentScore } from '../lib/studentAssessment';
import '../indexCards/glossary.css';
import '../indexCards/liveD8.css';

const SCALE = [1, 2, 3, 4, 5] as const;

export type D12SheetOpen = { kind: 'draft'; faceId: InstructorD12FaceId | null } | { kind: 'card'; id: string };

function faceLabelOf(faceId: InstructorD12FaceId | null): string {
  return faceId ? INSTRUCTOR_D12_FACES.find((face) => face.id === faceId)?.label ?? faceId : 'Pick a face';
}

/** All twelve faces as large chips, like the D8's FacePicker. Readable on the navy add form and the cream sheet. */
export function D12FacePicker({
  value,
  onChange,
  label = 'D12 face',
  prompt = false,
}: {
  value: InstructorD12FaceId | null;
  onChange: (faceId: InstructorD12FaceId) => void;
  label?: string;
  prompt?: boolean;
}) {
  return (
    <fieldset className="gl-faces d12-face-picker" data-testid="d12-face-picker" data-prompt={prompt ? 'true' : 'false'}>
      <legend className="d8sf-kicker d12-face-picker__legend">{label}</legend>
      <div className="gl-face-chips d12-face-chips" role="group" aria-label={label}>
        {INSTRUCTOR_D12_FACES.map((face) => (
          <button
            key={face.id}
            type="button"
            className="gl-face-chip d12-face-chip"
            data-face-pick={face.id}
            aria-pressed={value === face.id}
            onClick={() => onChange(face.id)}
          >
            {face.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function D12CardSheet({
  open,
  cards,
  links,
  readOnly,
  onClose,
  onCommitCards,
  onCommitLinks,
  onViewOnPath,
}: {
  open: D12SheetOpen;
  cards: readonly InstructorD12Card[];
  links: readonly D12Link[];
  readOnly: boolean;
  onClose: () => void;
  onCommitCards: (cards: InstructorD12Card[]) => void;
  onCommitLinks: (links: D12Link[]) => void;
  onViewOnPath: (cardId: string) => void;
}) {
  const existing = open.kind === 'card' ? cards.find((item) => item.id === open.id) ?? null : null;
  const [draftName, setDraftName] = useState('');
  const [draftFace, setDraftFace] = useState<InstructorD12FaceId | null>(open.kind === 'draft' ? open.faceId : null);
  const [draftRating, setDraftRating] = useState<AssessmentScore>(3);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
    if (open.kind !== 'draft') return;
    setDraftName('');
    setDraftFace(open.faceId);
    setDraftRating(3);
    setDraftError(null);
  }, [open]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = window.setTimeout(() => setSavedAt(0), 2000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (open.kind === 'card' && !existing) return null;
  const faceId = open.kind === 'draft' ? draftFace : existing!.faceId;
  const faceLabel = faceLabelOf(faceId);
  const rating = existing ? shownD12CardRating(existing.rating) : draftRating;
  const draftKnown = open.kind === 'draft' ? instructorGlossaryTerm(draftName) : null;

  const saveDraft = (event?: FormEvent) => {
    event?.preventDefault();
    if (readOnly) return;
    if (!faceId) {
      setDraftError('Pick a D12 face for this card.');
      return;
    }
    const added = addInstructorD12Card(cards, faceId, draftName, draftRating);
    if ('error' in added) {
      setDraftError(added.error === 'duplicate' ? DUPLICATE_NAME : 'Enter a name.');
      return;
    }
    onCommitCards(added.cards);
    onClose();
  };

  const title = existing ? `${existing.name} card` : `${faceLabel} new card`;

  return (
    <div className="d8sf-sheet d8-live-sheet d12-live-sheet" role="dialog" aria-modal="true" aria-label={title} data-testid="instructor-d12-card-dialog" data-face={faceId ?? 'none'}>
      <button type="button" className="d8sf-scrim" aria-label="Close card" onClick={onClose} />
      <article className="d8sf-index" aria-label={title}>
        {existing ? (
          <header className="d8sf-index-head">
            <h2 className="d8sf-index-title">{existing.name}</h2>
            <button type="button" data-testid="d12-card-close" onClick={onClose}>
              Close
            </button>
          </header>
        ) : (
          <form className="d8sf-add d12-add" onSubmit={saveDraft}>
            <label className="d8sf-field">
              <span className="d8sf-kicker">Name</span>
              <input
                aria-label="New card name"
                data-testid="d12-new-card-name"
                value={draftName}
                autoFocus
                autoComplete="off"
                placeholder="Name this card"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftError(null);
                }}
              />
            </label>
            {draftKnown ? (
              <p className="gl-note" data-testid="d12-draft-glossary-note">{`In the instructor glossary under ${faceLabelOf(draftKnown.faceId)}.`}</p>
            ) : null}
            <D12FacePicker
              value={draftFace}
              prompt={!draftFace}
              onChange={(next) => {
                setDraftFace(next);
                setDraftError(null);
              }}
            />
            <div className="d8sf-add-actions">
              <button type="submit" className="d8sf-add-submit" data-testid="d12-new-card-save">
                Add
              </button>
              <button type="button" className="d8sf-add-cancel" onClick={onClose}>
                Cancel
              </button>
            </div>
            {draftError ? (
              <p className="d8sf-add-error" role="alert">
                {draftError}
              </p>
            ) : null}
          </form>
        )}
        {existing ? <CardIdentity card={existing} cards={cards} readOnly={readOnly} onCommitCards={onCommitCards} /> : null}
        {existing ? (
          <CardPath card={existing} cards={cards} links={links} readOnly={readOnly} onCommitLinks={onCommitLinks} onView={() => onViewOnPath(existing.id)} />
        ) : null}
        {existing ? <CardNotes card={existing} cards={cards} readOnly={readOnly} onCommitCards={onCommitCards} /> : null}
        {existing ? <CardVideos card={existing} cards={cards} readOnly={readOnly} onCommitCards={onCommitCards} /> : null}
        <section className="d8sf-index-block" aria-label="Rating">
          <h3>Rate it</h3>
          <div className="d8sf-rates" role="group" aria-label={existing ? `Rate ${existing.name}` : 'Rate new card'}>
            {SCALE.map((value) => (
              <button
                key={value}
                type="button"
                className="d8sf-rate"
                aria-pressed={rating === value}
                aria-label={existing ? `${existing.name} ${value}` : `New card ${value}`}
                data-testid={existing ? `d12-card-rate-${value}` : `d12-new-card-rate-${value}`}
                disabled={readOnly}
                onClick={() => {
                  if (readOnly) return;
                  if (!existing) {
                    setDraftRating(value);
                    return;
                  }
                  onCommitCards(rateInstructorD12Card(cards, existing.id, value));
                  setSavedAt(Date.now());
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="d8sf-index-hint">{d12CardRatingNote(existing ? existing.rating : draftRating)}</p>
          <p className="d8-rate-saved" data-testid="d12-rating-saved" data-on={savedAt ? 'true' : 'false'} aria-live="polite">
            {savedAt ? 'Saved' : ''}
          </p>
        </section>
        {existing && !readOnly ? (
          confirmDelete ? (
            <div className="d12-card-delete" role="group" aria-label="Delete this card" data-testid="d12-card-delete-confirm-group">
              <p>{D12_DELETE_PROMPT}</p>
              <button
                type="button"
                data-testid="d12-card-delete-confirm"
                onClick={() => {
                  onCommitCards(removeInstructorD12Card(cards, existing.id));
                  onClose();
                }}
              >
                {D12_CONFIRM_DELETE_CARD}
              </button>
              <button type="button" data-testid="d12-card-delete-keep" onClick={() => setConfirmDelete(false)}>
                {D12_KEEP_CARD}
              </button>
            </div>
          ) : (
            <button type="button" data-testid="d12-card-delete" onClick={() => setConfirmDelete(true)}>
              {D12_DELETE_CARD}
            </button>
          )
        ) : null}
      </article>
    </div>
  );
}

/** D12 face, instructor glossary tag, and Rename or move. */
function CardIdentity({
  card,
  cards,
  readOnly,
  onCommitCards,
}: {
  card: InstructorD12Card;
  cards: readonly InstructorD12Card[];
  readOnly: boolean;
  onCommitCards: (cards: InstructorD12Card[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(card.name);
  const [face, setFace] = useState<InstructorD12FaceId>(card.faceId);
  const [error, setError] = useState<string | null>(null);
  const tag = instructorGlossaryTerm(card.name);

  useEffect(() => {
    setEditing(false);
    setName(card.name);
    setFace(card.faceId);
    setError(null);
  }, [card.id, card.name, card.faceId]);

  const save = () => {
    const result = editInstructorD12Card(cards, card.id, { name, faceId: face });
    if ('error' in result) {
      setError(result.error === 'blank' ? 'Give it a name.' : result.error === 'duplicate' ? `Already on ${faceLabelOf(face)}.` : 'Pick a D12 face.');
      return;
    }
    onCommitCards(result.cards);
    setEditing(false);
  };

  return (
    <>
      <p className="d8sf-index-face">
        <span className="d8sf-kicker">D12 face</span>
        <span data-testid="d12-card-face">{faceLabelOf(card.faceId)}</span>
      </p>
      {tag ? (
        <p className="gl-tag" data-testid="d12-glossary-tag" data-glossary={tag.key}>
          <span>
            <span className="d8sf-kicker">Glossary</span> <strong>{tag.term}</strong>
          </span>
          <span className="gl-note">{tag.definition}</span>
          {tag.faceId !== card.faceId ? (
            <span className="gl-note">{`The instructor glossary lists it under ${faceLabelOf(tag.faceId)}. Yours is on ${faceLabelOf(card.faceId)}.`}</span>
          ) : null}
        </p>
      ) : (
        <p className="gl-note" data-testid="d12-glossary-tag-none">
          Your own card. Not in the instructor glossary yet.
        </p>
      )}
      {readOnly ? null : editing ? (
        <form
          className="d8sf-add d12-add"
          data-testid="d12-card-edit"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="d8sf-field">
            <span className="d8sf-kicker">Your name for it</span>
            <input
              aria-label="Card name"
              data-testid="d12-card-edit-name"
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </label>
          <D12FacePicker
            value={face}
            label="Put it on"
            onChange={(next) => {
              setFace(next);
              setError(null);
            }}
          />
          <div className="d8sf-add-actions">
            <button type="submit" className="d8sf-add-submit" data-testid="d12-card-edit-save">
              Save
            </button>
            <button type="button" className="d8sf-add-cancel" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
          {error ? (
            <p className="d8sf-add-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : (
        <div className="gl-edit-row">
          <button type="button" data-testid="d12-card-edit-open" onClick={() => setEditing(true)}>
            Rename or move
          </button>
        </div>
      )}
    </>
  );
}

const SOURCE_NOTE: Record<'card' | 'face', string> = { card: 'Card', face: 'Whole face' };

function NeighborList({ title, rows, testId, readOnly, onRemove }: { title: string; rows: D12Neighbor[]; testId: string; readOnly: boolean; onRemove: (row: D12Neighbor) => void }) {
  if (!rows.length) return null;
  return (
    <div className="gl-tree-group" data-testid={testId}>
      <h4>{title}</h4>
      <ul className="d8sf-notes gl-tree-list">
        {rows.map((row) => (
          <li key={`${row.link.from}>${row.link.to}>${row.link.relation}`} data-path-neighbor={row.endpoint}>
            <strong>{row.name}</strong>
            <span className="gl-tree-source">{row.kind === 'face' ? SOURCE_NOTE.face : `${SOURCE_NOTE.card} · ${row.faceLabel}`}</span>
            {readOnly ? null : (
              <button type="button" className="gl-tree-remove" aria-label={`Remove ${row.name}`} onClick={() => onRemove(row)}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Path to Mastery block. Same layout as the D8's Technique Tree block. */
function CardPath({
  card,
  cards,
  links,
  readOnly,
  onCommitLinks,
  onView,
}: {
  card: InstructorD12Card;
  cards: readonly InstructorD12Card[];
  links: readonly D12Link[];
  readOnly: boolean;
  onCommitLinks: (links: D12Link[]) => void;
  onView: () => void;
}) {
  const view = useMemo(() => d12CardMastery(card, cards, links), [card, cards, links]);
  const [relation, setRelation] = useState<D12AddRelation>('connects');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const options = useMemo(() => d12ConnectionOptions(query, cards, card), [query, cards, card]);

  useEffect(() => {
    setQuery('');
    setStatus('');
    setRelation('connects');
  }, [card.id]);

  const relationLabel = D12_RELATION_CHOICES.find((choice) => choice.id === relation)?.label ?? '';

  const pick = (option: D12ConnectionOption) => {
    if (readOnly) return;
    const next = withD12Link(links, card.id, relation, option.endpoint);
    if (next === links) {
      setStatus(`Already connected to ${option.name}.`);
      return;
    }
    onCommitLinks([...next]);
    setQuery('');
    setStatus(
      relation === 'connects'
        ? `Added: ${card.name} → ${option.name}.`
        : relation === 'builds-on'
          ? `Added: ${option.name} → ${card.name}.`
          : `Added: ${card.name} supports ${option.name}.`,
    );
  };

  const remove = (row: D12Neighbor) => {
    if (readOnly) return;
    onCommitLinks(withoutD12Link(links, row.link));
    setStatus(`Removed ${row.name}.`);
  };

  return (
    <section className="d8sf-index-block gl-tree" aria-label={PATH_TO_MASTERY} data-testid="d12-card-path">
      <h3>{PATH_TO_MASTERY}</h3>
      {d12MasteryEmpty(view) ? (
        <p className="d8sf-index-empty" data-testid="d12-card-path-empty">
          {PATH_TO_MASTERY_EMPTY}
        </p>
      ) : null}
      <NeighborList title="Connects to" rows={view.connectsTo} testId="d12-path-connects" readOnly={readOnly} onRemove={remove} />
      <NeighborList title="Builds on" rows={view.buildsOn} testId="d12-path-builds-on" readOnly={readOnly} onRemove={remove} />
      <NeighborList title="Supports" rows={view.supports} testId="d12-path-supports" readOnly={readOnly} onRemove={remove} />
      <NeighborList title="Supported by" rows={view.supportedBy} testId="d12-path-supported-by" readOnly={readOnly} onRemove={remove} />
      {readOnly ? null : (
        <div className="gl-tree-add" data-testid="d12-card-path-add">
          <p className="d8sf-kicker">Add a connection</p>
          <div className="gl-tree-relations" role="radiogroup" aria-label="Connection type">
            {D12_RELATION_CHOICES.map((choice) => (
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
            aria-label="Find a card or face to connect"
            data-testid="d12-card-path-search"
            placeholder={`${card.name} ${relationLabel.toLowerCase()}…`}
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
              <ul className="gl-suggest gl-tree-options" role="listbox" aria-label="Cards and faces to connect" data-testid="d12-card-path-options">
                {options.map((option) => (
                  <li key={option.endpoint} role="option" aria-selected="false">
                    <button type="button" data-connect={option.endpoint} onClick={() => pick(option)}>
                      <span>{option.name}</span>
                      <small>{option.kind === 'face' ? 'Whole face' : `Card · ${option.faceLabel}`}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="gl-note">No card or face matches. Add the card to your D12 first.</p>
            )
          ) : null}
        </div>
      )}
      <p className="gl-edit-row">
        <button type="button" className="gl-tree-open" data-testid="d12-view-on-path" onClick={onView}>
          {VIEW_ON_PATH_TO_MASTERY}
        </button>
      </p>
      <p className="gl-note" aria-live="polite" data-testid="d12-card-path-status">
        {status}
      </p>
    </section>
  );
}

function CardNotes({
  card,
  cards,
  readOnly,
  onCommitCards,
}: {
  card: InstructorD12Card;
  cards: readonly InstructorD12Card[];
  readOnly: boolean;
  onCommitCards: (cards: InstructorD12Card[]) => void;
}) {
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

  const dirty = cleanD12Notes(draft) !== saved;
  const save = () => {
    if (!dirty || readOnly) return;
    onCommitCards(withD12CardNotes(cards, card.id, draft));
    setSavedAt(Date.now());
  };

  return (
    <section className="d8sf-index-block gl-card-notes" aria-label="Your notes" data-testid="d12-card-notes">
      <h3>Your notes</h3>
      <textarea
        aria-label={`Notes on ${card.name}`}
        data-testid="d12-card-notes-input"
        value={draft}
        maxLength={D12_CARD_NOTES_MAX}
        rows={3}
        readOnly={readOnly}
        placeholder="Cues, reminders, what worked in class…"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
      />
      {readOnly ? null : (
        <div className="gl-edit-row">
          <button type="button" data-testid="d12-card-notes-save" disabled={!dirty} onClick={save}>
            Save notes
          </button>
          <span className="d8-rate-saved" data-testid="d12-card-notes-saved" data-on={savedAt ? 'true' : 'false'} aria-live="polite">
            {savedAt ? 'Saved' : ''}
          </span>
        </div>
      )}
    </section>
  );
}

function CardVideos({
  card,
  cards,
  readOnly,
  onCommitCards,
}: {
  card: InstructorD12Card;
  cards: readonly InstructorD12Card[];
  readOnly: boolean;
  onCommitCards: (cards: InstructorD12Card[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const videos = card.videos ?? [];
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const result = withD12CardVideo(cards, card.id, String(data.get('title') ?? ''), String(data.get('href') ?? ''));
    if ('error' in result) {
      setError(result.error === 'full' ? 'This card already has the most videos it can hold.' : 'Paste a link that starts with https://');
      return;
    }
    setError(null);
    onCommitCards(result.cards);
    form.reset();
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') event.currentTarget.form?.reset();
  };
  return (
    <section className="d8sf-index-block" aria-label="Videos" data-testid="d12-card-videos">
      <h3>Videos</h3>
      {videos.length === 0 ? (
        <p className="d8sf-index-empty">No videos on this card yet.</p>
      ) : (
        <ul className="d8sf-notes">
          {videos.map((video) => (
            <li key={video.href} data-d12-video={video.href}>
              <a className="d8sf-video" href={video.href} target="_blank" rel="noreferrer">
                {video.title}
              </a>
              {readOnly ? null : (
                <button type="button" className="gl-tree-remove" aria-label={`Remove ${video.title}`} onClick={() => onCommitCards(withoutD12CardVideo(cards, card.id, video.href))}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {readOnly ? null : (
        <form className="d8sf-mini" data-testid="d12-card-video-form" onSubmit={submit}>
          <input name="title" aria-label="Video title" autoComplete="off" onKeyDown={onKey} />
          <input name="href" aria-label="Video link" autoComplete="off" placeholder="https://" onKeyDown={onKey} />
          <button type="submit">Add video</button>
        </form>
      )}
      {error ? (
        <p className="d8sf-add-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
