/**
 * The one index card. Every screen opens it through openTerm or IndexTermLink.
 * Journal lines and videos are read from the records already on this phone.
 */
import { useEffect, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
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
  videosForTerm,
  withCustomCard,
  withRating,
  withVideo,
  type IndexFaceId,
} from '../lib/indexCards.ts';
import type { AssessmentScore } from '../lib/studentAssessment.ts';
import { loadFilms } from '../lib/studentFilm.ts';
import { useStudentFile, useStudentPath } from '../pages/student/chrome.tsx';
import { catalogLines, closeIndexCard, commitIndexCards, getIndexCardFile, useLiveCards, useOpenState } from './store.ts';
import '../preview/d8Subfactors/d8Subfactors.css';
import './indexTerm.css';

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
  const draftFace = open?.kind === 'draft' ? open.faceId : '';

  useEffect(() => {
    if (!draftFace) return;
    setDraftName('');
    setDraftRating(NEUTRAL_RATING);
    setDraftError(null);
  }, [draftFace]);

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
  const faceId: IndexFaceId = open.kind === 'draft' ? open.faceId : card!.faceId;
  const faceLabel = cards.find((item) => item.faceId === faceId)?.faceLabel ?? faceId;
  const names = card ? [card.name, card.tile] : [];
  const journal = card ? journalMentions(report.journal, names) : [];
  const videos = card ? videosForTerm(names, report.clips ?? [], loadFilms(localStorage), card.video) : [];
  const rating = card ? card.rating : draftRating;

  const saveDraft = () => {
    const saved = withCustomCard(catalogLines(), getIndexCardFile(), faceId, draftName, draftRating);
    if ('error' in saved) {
      const other = saved.faceLabel && saved.faceLabel !== faceLabel ? `Already on ${saved.faceLabel}.` : DUPLICATE_NAME;
      setDraftError(saved.error === 'duplicate' ? other : null);
      return;
    }
    commitIndexCards(saved.file);
    closeIndexCard();
  };

  return (
    <div
      className="d8sf-sheet"
      role="dialog"
      aria-modal="true"
      aria-label={card ? `${card.name} index card` : `${faceLabel} new card`}
      data-face={faceId}
      data-term={card ? card.id : 'draft'}
      data-testid="live-index-card"
    >
      <button type="button" className="d8sf-scrim" aria-label="Close card" onClick={closeIndexCard} />
      <article className="d8sf-index" data-face={faceId} data-term={card ? card.id : 'draft'} aria-label={card ? `${card.name} index card` : `${faceLabel} new card`}>
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
                onChange={(event) => {
                  setDraftName(event.target.value);
                  setDraftError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    closeIndexCard();
                  }
                }}
              />
            </label>
            <div className="d8sf-add-actions">
              <button type="submit">Add</button>
              <button type="button" onClick={closeIndexCard}>
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
        <p className="d8sf-index-face">
          <span className="d8sf-kicker">D8 face</span>
          <span>{faceLabel}</span>
        </p>
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
                }}
              >
                {value}
              </button>
            ))}
          </div>
          <p className="d8sf-index-hint">{ratingNote(rating)}</p>
        </section>
      </article>
    </div>
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
