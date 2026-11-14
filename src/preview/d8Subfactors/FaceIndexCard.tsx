/**
 * Index card for one D8 line. Journal, video, and rating stay in memory.
 * The tree field is not drawn. A later pass can attach branches to the card.
 */
import type { FormEvent, KeyboardEvent } from 'react';
import { EMPTY_JOURNAL, EMPTY_VIDEOS, ratingNote, shownRating } from '../termCard/model.ts';
import type { AssessmentScore } from '../../lib/studentAssessment.ts';
import type { CardNote, CardVideo } from './cards.ts';

const SCORES = [1, 2, 3, 4, 5] as const;

export function FaceIndexCard({
  faceId,
  faceLabel,
  name,
  rating,
  journal,
  video,
  draft,
  error,
  showBranches,
  layout,
  onName,
  onSave,
  onClose,
  onRate,
  onAddNote,
  onAddVideo,
  onBranches,
}: {
  faceId: string;
  faceLabel: string;
  name: string;
  rating: AssessmentScore;
  journal: readonly CardNote[];
  video: CardVideo | null;
  draft: boolean;
  error: string | null;
  showBranches: boolean;
  layout: 'sheet' | 'flow';
  onName: (value: string) => void;
  onSave: () => void;
  onClose: () => void;
  onRate: (value: AssessmentScore) => void;
  onAddNote: (text: string) => void;
  onAddVideo: (title: string, href: string) => void;
  onBranches?: () => void;
}) {
  const shown = shownRating(rating);
  const body = (
    <article className="d8sf-index" data-face={faceId} data-term={draft ? 'draft' : name} aria-label={draft ? `${faceLabel} new card` : `${name} index card`}>
      <p className="d8sf-sample">Sample scores</p>
      {draft ? (
        <form
          className="d8sf-add"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label className="d8sf-field">
            <span className="d8sf-kicker">Name</span>
            <input
              aria-label="New sub-factor name"
              value={name}
              autoFocus
              autoComplete="off"
              onChange={(event) => onName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
            />
          </label>
          <div className="d8sf-add-actions">
            <button type="submit" className="d8sf-add-submit">Add</button>
            <button type="button" className="d8sf-add-cancel" onClick={onClose}>
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
        <header className="d8sf-index-head">
          <h2 className="d8sf-index-title">{name}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
      )}
      <p className="d8sf-index-face">
        <span className="d8sf-kicker">D8 face</span>
        <span>{faceLabel}</span>
      </p>
      <section className="d8sf-index-block" aria-label="Journal">
        <h3>Your journal</h3>
        {journal.length === 0 ? (
          <p className="d8sf-index-empty">{EMPTY_JOURNAL}</p>
        ) : (
          <ul className="d8sf-notes">
            {journal.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        )}
        <NoteForm onAdd={onAddNote} />
      </section>
      <section className="d8sf-index-block" aria-label="Videos">
        <h3>Videos</h3>
        {video ? (
          <a className="d8sf-video" href={video.href}>
            <span>{video.title || video.href}</span>
            <span>{video.href}</span>
          </a>
        ) : (
          <p className="d8sf-index-empty">{EMPTY_VIDEOS}</p>
        )}
        <VideoForm onAdd={onAddVideo} />
      </section>
      <section className="d8sf-index-block" aria-label="Rating">
        <h3>Rate it</h3>
        <div className="d8sf-rates" role="group" aria-label={draft ? 'Rate new sub-factor' : `Rate ${name}`}>
          {SCORES.map((value) => (
            <button
              key={value}
              type="button"
              className="d8sf-rate"
              aria-pressed={shown === value}
              aria-label={draft ? `New sub-factor ${value}` : `${name} ${value}`}
              onClick={() => onRate(value)}
            >
              {value}
            </button>
          ))}
        </div>
        <p className="d8sf-index-hint">{ratingNote(rating)}</p>
      </section>
      {showBranches && onBranches ? (
        <button type="button" data-branches="true" onClick={onBranches}>
          Branches
        </button>
      ) : null}
    </article>
  );
  if (layout === 'flow') return body;
  return (
    <div className="d8sf-sheet" role="dialog" aria-modal="true" aria-label={draft ? `${faceLabel} new card` : `${name} index card`} data-face={faceId} data-term={draft ? 'draft' : name}>
      <button type="button" className="d8sf-scrim" aria-label="Close card" onClick={onClose} />
      {body}
    </div>
  );
}

function NoteForm({ onAdd }: { onAdd: (text: string) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    onAdd(String(new FormData(form).get('note') ?? ''));
    form.reset();
  };
  return (
    <form className="d8sf-mini" onSubmit={submit}>
      <input name="note" aria-label="Journal note" autoComplete="off" />
      <button type="submit">Add note</button>
    </form>
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

