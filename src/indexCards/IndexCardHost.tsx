/**
 * The one index card. Every screen opens it through openTerm or IndexTermLink.
 * Journal lines and videos are read from the records already on this phone.
 */
import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatJournalDate } from '../lib/journalCopy.ts';
import {
  DUPLICATE_NAME,
  EMPTY_JOURNAL,
  EMPTY_VIDEOS,
  NEUTRAL_RATING,
  journalMentions,
  ratingNote,
  shownRating,
  termIdFor,
  videosForTerm,
  withCardEdit,
  withCardReset,
  withCustomCard,
  withRating,
  withVideo,
  type IndexFaceId,
  type LiveCard,
} from '../lib/indexCards.ts';
import { GLOSSARY_FACE_LABELS, glossaryTag, glossaryTerm, searchGlossary } from '../lib/glossary.ts';
import { myMoveNames } from '../lib/glossaryAdditions.ts';
import { FacePicker } from './FacePicker.tsx';
import type { AssessmentScore } from '../lib/studentAssessment.ts';
import { loadFilms } from '../lib/studentFilm.ts';
import { useStudentFile, useStudentPath } from '../pages/student/chrome.tsx';
import {
  catalogLines,
  closeIndexCard,
  commitIndexCards,
  getIndexCardFile,
  noteAddition,
  openTerm,
  useAdditions,
  useLiveCards,
  useOpenState,
} from './store.ts';
import './glossary.css';
import '../preview/d8Subfactors/d8Subfactors.css';
import './indexTerm.css';
import './liveD8.css';

const SCORES = [1, 2, 3, 4, 5] as const;

/** App-wide opener. One host, so every screen shows the same card for a term. */
export function IndexCardProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <IndexCardHost />
    </>
  );
}

export function IndexCardHost() {
  const open = useOpenState();
  const cards = useLiveCards();
  const { report } = useStudentFile();
  const to = useStudentPath();
  const [draftName, setDraftName] = useState('');
  const [draftRating, setDraftRating] = useState<AssessmentScore>(NEUTRAL_RATING);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftDup, setDraftDup] = useState<string | null>(null);
  const [draftFace, setDraftFace] = useState<IndexFaceId | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const additions = useAdditions();
  const draftKey = open?.kind === 'draft' ? `draft:${open.faceId ?? 'none'}` : '';
  const mine = useMemo(() => myMoveNames(additions), [additions]);
  const suggestions = useMemo(() => (open?.kind === 'draft' ? searchGlossary(draftName, mine) : []), [open, draftName, mine]);

  useEffect(() => {
    if (!draftKey || open?.kind !== 'draft') return;
    setDraftName('');
    setDraftRating(NEUTRAL_RATING);
    setDraftError(null);
    setDraftDup(null);
    setDraftFace(open.faceId);
  }, [draftKey]);

  useEffect(() => {
    if (!savedAt) return;
    const timer = window.setTimeout(() => setSavedAt(0), 2000);
    return () => window.clearTimeout(timer);
  }, [savedAt]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') closeIndexCard();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;
  const card = open.kind === 'card' ? cards.find((item) => item.id === open.id) ?? null : null;
  if (open.kind === 'card' && !card) return null;
  const faceId: IndexFaceId | null = open.kind === 'draft' ? draftFace : card!.faceId;
  const faceLabel = faceId ? (cards.find((item) => item.faceId === faceId)?.faceLabel ?? GLOSSARY_FACE_LABELS[faceId]) : 'Pick a face';
  const draftKnown = open.kind === 'draft' ? glossaryTerm(draftName) : null;
  const draftMine = open.kind === 'draft' && !draftKnown ? mine.find((row) => row.name.toLocaleLowerCase() === draftName.trim().toLocaleLowerCase()) ?? null : null;
  const draftNew = open.kind === 'draft' && draftName.trim().length > 0 && !draftKnown && !draftMine;
  const exactSuggestion = suggestions.length === 1 && suggestions[0].name.toLocaleLowerCase() === draftName.trim().toLocaleLowerCase();
  const names = card ? [card.name, card.tile] : [];
  const journal = card ? journalMentions(report.journal, names) : [];
  const videos = card ? videosForTerm(names, report.clips ?? [], loadFilms(localStorage), card.video) : [];
  const rating = card ? card.rating : draftRating;

  const saveDraft = () => {
    if (!draftName.trim()) return;
    if (!faceId) {
      setDraftError('Pick a D8 face for this move.');
      return;
    }
    const saved = withCustomCard(catalogLines(), getIndexCardFile(), faceId, draftName, draftRating);
    if ('error' in saved) {
      const other = saved.faceLabel && saved.faceLabel !== faceLabel ? `Already on ${saved.faceLabel}.` : DUPLICATE_NAME;
      setDraftError(saved.error === 'duplicate' ? other : null);
      setDraftDup(saved.error === 'duplicate' ? termIdFor(catalogLines(), getIndexCardFile(), draftName) : null);
      return;
    }
    commitIndexCards(saved.file);
    noteAddition({ name: draftName, faceId });
    closeIndexCard();
  };

  const pickSuggestion = (name: string, face: IndexFaceId) => {
    setDraftName(name);
    setDraftFace(face);
    setDraftError(null);
    setDraftDup(null);
  };

  return (
    <div
      className="d8sf-sheet d8-live-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={card ? `${card.name} index card` : `${faceLabel} new card`}
      data-face={faceId ?? 'none'}
      data-term={card ? card.id : 'draft'}
      data-testid="live-index-card"
    >
      <button type="button" className="d8sf-scrim" aria-label="Close card" onClick={closeIndexCard} />
      <article className="d8sf-index" data-face={faceId ?? 'none'} data-term={card ? card.id : 'draft'} aria-label={card ? `${card.name} index card` : `${faceLabel} new card`}>
        {card ? (
          <header className="d8sf-index-head">
            <h2 className="d8sf-index-title">{card.name}</h2>
            <button type="button" onClick={closeIndexCard}>
              Close
            </button>
          </header>
        ) : (
          <form
            className="d8sf-add"
            onSubmit={(event) => {
              event.preventDefault();
              saveDraft();
            }}
          >
            <label className="d8sf-field">
              <span className="d8sf-kicker">Name</span>
              <input
                aria-label="New card name"
                value={draftName}
                autoFocus
                autoComplete="off"
                aria-autocomplete="list"
                aria-controls="gl-suggest"
                placeholder="Type a move, e.g. Kimura"
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftError(null);
                  setDraftDup(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeIndexCard();
                  }
                }}
              />
            </label>
            {suggestions.length > 0 && !exactSuggestion ? (
              <ul className="gl-suggest" id="gl-suggest" role="listbox" aria-label="Glossary matches" data-testid="glossary-suggest">
                {suggestions.map((item) => (
                  <li key={`${item.source}:${item.name}`} role="option" aria-selected="false">
                    <button type="button" data-suggest={item.name} onClick={() => pickSuggestion(item.name, item.faceId)}>
                      <span>
                        {item.name}
                        {item.matched ? <small>{` · also ${item.matched}`}</small> : null}
                      </span>
                      <small>{item.source === 'mine' ? `Yours · ${GLOSSARY_FACE_LABELS[item.faceId]}` : GLOSSARY_FACE_LABELS[item.faceId]}</small>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {draftKnown ? (
              <p className="gl-note" data-testid="draft-glossary-note">
                {draftKnown.faceId === faceId || !faceId
                  ? `In the glossary under ${GLOSSARY_FACE_LABELS[draftKnown.faceId]}.`
                  : `The glossary lists this under ${GLOSSARY_FACE_LABELS[draftKnown.faceId]}. It goes on ${GLOSSARY_FACE_LABELS[faceId]} on your D8 — your choice.`}
              </p>
            ) : draftNew ? (
              <p className="gl-note" data-tone="new" role="status" data-testid="draft-new-note">
                {faceId
                  ? `Not in the glossary yet. Check the face — it goes on ${GLOSSARY_FACE_LABELS[faceId]} and into your additions.`
                  : 'Not in the glossary yet. Which face does it go on?'}
              </p>
            ) : null}
            <FacePicker
              value={draftFace}
              prompt={draftNew || !draftFace}
              onChange={(face) => {
                setDraftFace(face);
                setDraftError(null);
                setDraftDup(null);
              }}
            />
            <div className="d8sf-add-actions">
              <button type="submit">{draftNew ? 'Add new move' : 'Add'}</button>
              <button type="button" onClick={closeIndexCard}>
                Cancel
              </button>
            </div>
            {draftError ? (
              <p className="d8sf-add-error" role="alert">
                {draftError}
                {draftDup ? (
                  <>
                    {' '}
                    <button type="button" data-testid="open-existing" onClick={() => openTerm(draftDup)}>
                      Open it
                    </button>
                  </>
                ) : null}
              </p>
            ) : null}
          </form>
        )}
        {card ? <CardIdentity card={card} /> : null}
        {card ? (
          <section className="d8sf-index-block" aria-label="Journal">
            <h3>Your journal</h3>
            {journal.length === 0 ? (
              <p className="d8sf-index-empty">{EMPTY_JOURNAL}</p>
            ) : (
              <ul className="d8sf-notes">
                {journal.map((entry) => (
                  <li key={entry.id}>
                    <Link to={to(`/student/cards/${entry.id}`)}>{formatJournalDate(entry.date)}</Link>
                    {` · ${entry.line}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : null}
        {card ? (
          <section className="d8sf-index-block" aria-label="Videos">
            <h3>Videos</h3>
            {videos.length === 0 ? (
              <p className="d8sf-index-empty">{EMPTY_VIDEOS}</p>
            ) : (
              <ul className="d8sf-notes">
                {videos.map((video) => (
                  <li key={`${video.where}-${video.id}`}>
                    {video.href ? (
                      <a className="d8sf-video" href={video.href} target="_blank" rel="noreferrer">
                        {video.title}
                      </a>
                    ) : (
                      <span>
                        {video.title}
                        <span className="d8sf-kicker">On this phone</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <VideoForm
              onAdd={(videoTitle, href) => {
                commitIndexCards(withVideo(catalogLines(), getIndexCardFile(), card.id, { title: videoTitle, href }));
              }}
            />
          </section>
        ) : null}
        <section className="d8sf-index-block" aria-label="Rating">
          <h3>Rate it</h3>
          <div className="d8sf-rates" role="group" aria-label={card ? `Rate ${card.name}` : 'Rate new card'}>
            {SCORES.map((value) => (
              <button
                key={value}
                type="button"
                className="d8sf-rate"
                aria-pressed={shownRating(rating) === value}
                aria-label={card ? `${card.name} ${value}` : `New card ${value}`}
                onClick={() => {
                  if (!card) {
                    setDraftRating(value);
                    return;
                  }
                  commitIndexCards(withRating(catalogLines(), getIndexCardFile(), card.id, value));
                  setSavedAt(Date.now());
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="d8sf-index-hint">{ratingNote(rating)}</p>
          <p className="d8-rate-saved" data-testid="rating-saved" data-on={savedAt ? 'true' : 'false'} aria-live="polite">
            {savedAt ? 'Saved' : ''}
          </p>
        </section>
      </article>
    </div>
  );
}

/** Face, glossary tag, and the student's own name and face for this move. */
function CardIdentity({ card }: { card: LiveCard }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(card.name);
  const [face, setFace] = useState<IndexFaceId>(card.faceId);
  const [error, setError] = useState<string | null>(null);
  const tag = glossaryTag([card.name, card.tile, card.baseName], card.faceId);

  useEffect(() => {
    setEditing(false);
    setName(card.name);
    setFace(card.faceId);
    setError(null);
  }, [card.id, card.name, card.faceId]);

  const save = () => {
    const result = withCardEdit(catalogLines(), getIndexCardFile(), card.id, { name, faceId: face });
    if ('error' in result) {
      setError(
        result.error === 'blank'
          ? 'Give it a name.'
          : result.error === 'duplicate'
            ? `Already on ${result.faceLabel ?? 'your D8'}.`
            : 'Pick a D8 face.',
      );
      return;
    }
    commitIndexCards(result.file);
    noteAddition({ name, faceId: face, from: card.custom ? null : card.baseName });
    setEditing(false);
  };

  return (
    <>
      <p className="d8sf-index-face">
        <span className="d8sf-kicker">D8 face</span>
        <span data-testid="card-face">{card.faceLabel}</span>
      </p>
      {tag ? (
        <p className="gl-tag" data-testid="glossary-tag" data-glossary={tag.term.key}>
          <span>
            <span className="d8sf-kicker">Glossary</span> <strong>{tag.term.term}</strong>
          </span>
          {tag.term.definition ? <span className="gl-note">{tag.term.definition}</span> : null}
          {!tag.sameFace ? (
            <span className="gl-note">{`Glossary lists it under ${GLOSSARY_FACE_LABELS[tag.term.faceId]}. Yours is on ${card.faceLabel}.`}</span>
          ) : null}
        </p>
      ) : (
        <p className="gl-note" data-testid="glossary-tag-none">
          Your own move. Not in the glossary yet.
        </p>
      )}
      {card.edited ? (
        <p className="gl-note" data-testid="card-edited">{`Your name and face. The glossary still has ${card.baseName} on ${GLOSSARY_FACE_LABELS[card.baseFaceId]}.`}</p>
      ) : null}
      {editing ? (
        <form
          className="d8sf-add"
          data-testid="card-edit"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <label className="d8sf-field">
            <span className="d8sf-kicker">Your name for it</span>
            <input
              aria-label="Card name"
              value={name}
              autoComplete="off"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
            />
          </label>
          <FacePicker value={face} onChange={(next) => { setFace(next); setError(null); }} label="Put it on" />
          <div className="d8sf-add-actions">
            <button type="submit" data-testid="card-edit-save">Save</button>
            <button type="button" onClick={() => setEditing(false)}>
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
          <button type="button" data-testid="card-edit-open" onClick={() => setEditing(true)}>
            Rename or move
          </button>
          {card.edited ? (
            <button type="button" data-testid="card-reset" onClick={() => commitIndexCards(withCardReset(getIndexCardFile(), card.id))}>
              Use glossary name and face
            </button>
          ) : null}
        </div>
      )}
    </>
  );
}

function VideoForm({ onAdd }: { onAdd: (title: string, href: string) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    onAdd(String(data.get('title') ?? ''), String(data.get('href') ?? ''));
    form.reset();
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') event.currentTarget.form?.reset();
  };
  return (
    <form className="d8sf-mini" onSubmit={submit}>
      <input name="title" aria-label="Video title" autoComplete="off" onKeyDown={onKey} />
      <input name="href" aria-label="Video link" autoComplete="off" placeholder="https://" onKeyDown={onKey} />
      <button type="submit">Add video</button>
    </form>
  );
}
