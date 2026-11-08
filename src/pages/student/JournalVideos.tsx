import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { JournalClip } from '../../lib/progress/types';
import { loadFilms, studentFilmLabel, writeFilms, type StudentFilm } from '../../lib/studentFilm';
import {
  clearClipJournal,
  clearFilmJournal,
  clipsForJournal,
  filmsForJournal,
  journalFilmHref,
  setClipJournal,
  setFilmJournal,
} from '../../lib/videoAssociation';
import { useStudentFile, useStudentPath } from './chrome';

/**
 * Videos associated with one journal card.
 * Choosing or filming does not write until the library save, or an explicit Add, succeeds.
 */
export function JournalVideos({ entryId, date, technique }: { entryId: string; date: string; technique: string }) {
  const { report, commit } = useStudentFile();
  const to = useStudentPath();
  const [films, setFilms] = useState<StudentFilm[]>(() => loadFilms(localStorage));
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<{ kind: 'film' | 'link'; id: string; label: string; elsewhere: boolean } | null>(null);

  useEffect(() => {
    setFilms(loadFilms(localStorage));
  }, [report.updatedAt, entryId]);

  const clips = clipsForJournal(report.clips ?? [], entryId);
  const mine = filmsForJournal(films, entryId);
  const back = to(`/student/cards/${entryId}#journal-videos`);
  const filmHref = to(journalFilmHref({ entryId, date, technique, back }));
  const libraryHref = to('/student/videos');

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'film') {
      setFilms(writeFilms(localStorage, setFilmJournal(films, pending.id, entryId)));
    } else {
      commit(setClipJournal(report, pending.id, entryId));
    }
    setPending(null);
    setChoosing(false);
  };

  return (
    <section id="journal-videos" className="ink adv-card adv-card--wide journal-videos" aria-label="Videos for this card">
      <h2 className="ink__label">Videos</h2>
      <p className="student-quiet">
        Clips you add here stay in the video library. A link opens in a new tab and is not a video file on this phone. A filmed move stays in the library, not inside this card.
      </p>
      {clips.length === 0 && mine.length === 0 ? <p className="student-quiet">No videos for this card yet.</p> : null}
      {clips.map((clip) => (
        <article key={clip.id} className="journal-videos__item">
          <a href={clip.url} target="_blank" rel="noopener noreferrer">
            {clip.description || clip.url}
          </a>
          <p className="student-quiet">Link. Opens in a new tab. Not saved as a video file on this phone.</p>
          <button type="button" className="ink-btn" onClick={() => commit(clearClipJournal(report, clip.id))}>
            {`Remove ${clip.description || 'link'} from this card`}
          </button>
        </article>
      ))}
      {mine.map((film) => {
        const label = studentFilmLabel(film);
        return (
          <article key={film.id} className="journal-videos__item">
            <p>{label}</p>
            <p className="student-quiet">
              {film.where === 'phone' ? 'On this phone.' : film.where === 'academy' ? 'In the academy folder.' : 'On your drive.'} The file is in the video library.
            </p>
            <Link className="ink-btn" to={to(`/student/videos#film-${film.id}`)}>
              {`Open ${label} in Video library`}
            </Link>
            <button
              type="button"
              className="ink-btn"
              onClick={() => setFilms(writeFilms(localStorage, clearFilmJournal(films, film.id)))}
            >
              {`Remove ${label} from this card`}
            </button>
          </article>
        );
      })}
      <div className="journal-videos__actions">
        <Link className="ink-btn" to={libraryHref}>
          Video library
        </Link>
        <button type="button" className="ink-btn" onClick={() => { setChoosing((open) => !open); setPending(null); }}>
          {choosing ? 'Cancel choose' : 'Choose a saved video'}
        </button>
        <Link className="ink-btn" to={filmHref}>
          Film a move
        </Link>
      </div>
      {choosing ? (
        <ChooseSaved
          clips={report.clips ?? []}
          films={films}
          entryId={entryId}
          pending={pending}
          onPick={setPending}
          onConfirm={confirm}
          onCancel={() => { setPending(null); setChoosing(false); }}
        />
      ) : null}
    </section>
  );
}

function ChooseSaved({
  clips,
  films,
  entryId,
  pending,
  onPick,
  onConfirm,
  onCancel,
}: {
  clips: readonly JournalClip[];
  films: readonly StudentFilm[];
  entryId: string;
  pending: { kind: 'film' | 'link'; id: string; label: string; elsewhere: boolean } | null;
  onPick: (row: { kind: 'film' | 'link'; id: string; label: string; elsewhere: boolean }) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const choices = [
    ...films
      .filter((film) => film.journalEntryId !== entryId)
      .map((film) => ({
        kind: 'film' as const,
        id: film.id,
        label: studentFilmLabel(film),
        elsewhere: Boolean(film.journalEntryId),
      })),
    ...clips
      .filter((clip) => clip.journalEntryId !== entryId)
      .map((clip) => ({
        kind: 'link' as const,
        id: clip.id,
        label: clip.description || clip.url,
        elsewhere: Boolean(clip.journalEntryId),
      })),
  ];
  return (
    <div className="video-link__list" role="group" aria-label="Choose a saved video">
      {choices.length === 0 ? <p className="student-quiet">The video library has no other videos to add.</p> : null}
      {choices.map((row) => (
        <button key={`${row.kind}-${row.id}`} type="button" className="ink-btn" aria-pressed={pending?.id === row.id && pending.kind === row.kind} onClick={() => onPick(row)}>
          {row.elsewhere ? `Move “${row.label}” to this card` : row.label}
        </button>
      ))}
      <div className="journal-videos__actions">
        <button type="button" className="ink-btn ink-btn--save" disabled={!pending} onClick={onConfirm}>
          {pending?.elsewhere ? 'Move to this card' : 'Add to this card'}
        </button>
        <button type="button" className="ink-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
