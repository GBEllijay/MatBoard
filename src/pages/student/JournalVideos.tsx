import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { JournalClip } from '../../lib/progress/types';
import { loadFilms, writeFilms, type StudentFilm } from '../../lib/studentFilm';
import {
  clearClipJournal,
  clearFilmJournal,
  journalFilmHref,
  setClipAnchor,
  setClipJournal,
  setFilmAnchor,
  setFilmJournal,
  videosForCard,
  type CardTechnique,
  type TechniqueAnchor,
} from '../../lib/videoAssociation';
import { useStudentFile, useStudentPath } from './chrome';
import { TechniquePractice } from './TechniquePractice';

/**
 * Videos for this journal card.
 * A video keeps the card it was first saved with. Later sessions see it because they name the same technique.
 */
export function JournalVideos({
  entryId,
  date,
  techniques,
}: {
  entryId: string;
  date: string;
  techniques: readonly CardTechnique[];
}) {
  const { report, commit } = useStudentFile();
  const to = useStudentPath();
  const [films, setFilms] = useState<StudentFilm[]>(() => loadFilms(localStorage));
  const [choosing, setChoosing] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const technique = techniques.find((row) => row.name.trim())?.name ?? '';

  useEffect(() => {
    setFilms(loadFilms(localStorage));
  }, [report.updatedAt, entryId]);

  const shown = videosForCard(report, report.clips ?? [], films, entryId);
  const back = to(`/student/cards/${entryId}#journal-videos`);
  const filmHref = to(journalFilmHref({ entryId, date, technique, back }));
  const anchors = techniques.flatMap((row) => {
    const anchor = anchorForLine(row);
    return anchor ? [{ ...row, anchor }] : [];
  });

  const confirm = () => {
    if (!pending) return;
    if (pending.kind === 'film') {
      let next = setFilmJournal(films, pending.id, entryId);
      if (pending.anchor) next = setFilmAnchor(next, pending.id, pending.anchor);
      setFilms(writeFilms(localStorage, next));
    } else {
      let next = setClipJournal(report, pending.id, entryId);
      if (pending.anchor) next = setClipAnchor(next, pending.id, pending.anchor);
      if (next !== report) commit(next);
    }
    setPending(null);
    setChoosing(false);
  };

  return (
    <section id="journal-videos" className="ink adv-card adv-card--wide journal-videos" aria-label="Videos for this card">
      <h2 className="ink__label">Videos</h2>
      <p className="student-quiet">
        A video belongs to the technique. This card keeps the original class it was saved with. Later practice does not replace that class.
      </p>
      {anchors.map((row) => (
        <div key={row.anchor.id} className="journal-videos__item">
          <h3>{row.name}</h3>
          <TechniquePractice report={report} anchor={row.anchor} currentId={entryId} />
        </div>
      ))}
      {shown.length === 0 ? <p className="student-quiet">No videos for this card yet.</p> : null}
      {shown.map((video) => (
        <article key={`${video.kind}-${video.id}`} className="journal-videos__item">
          {video.kind === 'link' ? (
            <a href={video.url} target="_blank" rel="noopener noreferrer">
              {video.label}
            </a>
          ) : (
            <p>{video.label}</p>
          )}
          <p className="student-quiet">{video.place}</p>
          {video.originMissing ? <p className="student-quiet">Original class card is no longer on this device.</p> : null}
          {video.originHere ? <p>Original class for this video.</p> : null}
          {video.originId && !video.originHere && !video.originMissing ? (
            <Link className="ink-btn" to={to(`/student/cards/${video.originId}#journal-videos`)}>
              {`Original class · ${video.originDate}`}
            </Link>
          ) : null}
          {video.kind === 'film' ? (
            <Link className="ink-btn" to={to(`/student/videos#film-${video.id}`)}>
              {`Open ${video.label} in Video library`}
            </Link>
          ) : null}
          {video.originHere ? (
            <button
              type="button"
              className="ink-btn"
              onClick={() => {
                if (video.kind === 'film') setFilms(writeFilms(localStorage, clearFilmJournal(films, video.id)));
                else commit(clearClipJournal(report, video.id));
              }}
            >
              {`Clear original class for ${video.label}`}
            </button>
          ) : null}
        </article>
      ))}
      <div className="journal-videos__actions">
        <Link className="ink-btn" to={to('/student/videos')}>
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
          shownIds={new Set(shown.map((video) => `${video.kind}-${video.id}`))}
          techniques={anchors}
          pending={pending}
          onPick={setPending}
          onConfirm={confirm}
          onCancel={() => { setPending(null); setChoosing(false); }}
        />
      ) : null}
    </section>
  );
}

type Pending = { kind: 'film' | 'link'; id: string; anchor?: TechniqueAnchor };

function anchorForLine(row: CardTechnique): TechniqueAnchor | null {
  const name = row.name.trim();
  if (!name) return null;
  if (row.workingId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(row.workingId)) return { kind: 'working', id: row.workingId, name };
  if (row.id && !row.id.startsWith('free.') && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(row.id)) return { kind: 'fundamental', id: row.id, name };
  return null;
}

function ChooseSaved({
  clips,
  films,
  shownIds,
  techniques,
  pending,
  onPick,
  onConfirm,
  onCancel,
}: {
  clips: readonly JournalClip[];
  films: readonly StudentFilm[];
  shownIds: Set<string>;
  techniques: readonly { name: string; anchor: TechniqueAnchor }[];
  pending: Pending | null;
  onPick: (row: Pending) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const choices = [
    ...films.filter((film) => !shownIds.has(`film-${film.id}`)).map((film) => ({
      kind: 'film' as const,
      id: film.id,
      label: film.technique,
      hasAnchor: Boolean(film.techniqueAnchor),
    })),
    ...clips.filter((clip) => !shownIds.has(`link-${clip.id}`)).map((clip) => ({
      kind: 'link' as const,
      id: clip.id,
      label: clip.description || clip.url,
      hasAnchor: Boolean(clip.techniqueAnchor),
    })),
  ];
  return (
    <div className="video-link__list" role="group" aria-label="Choose a saved video">
      {choices.length === 0 ? <p className="student-quiet">The video library has no other videos to add.</p> : null}
      {choices.map((row) => (
        <div key={`${row.kind}-${row.id}`}>
          <p>{row.label}</p>
          {row.hasAnchor || techniques.length === 0 ? (
            <button type="button" className="ink-btn" aria-pressed={pending?.id === row.id && !pending.anchor} onClick={() => onPick({ kind: row.kind, id: row.id })}>
              Remember this card as the original class
            </button>
          ) : (
            techniques.map((technique) => (
              <button
                key={technique.anchor.id}
                type="button"
                className="ink-btn"
                aria-pressed={pending?.id === row.id && pending.anchor?.id === technique.anchor.id}
                onClick={() => onPick({ kind: row.kind, id: row.id, anchor: technique.anchor })}
              >
                {`Link “${row.label}” to ${technique.name}`}
              </button>
            ))
          )}
        </div>
      ))}
      <div className="journal-videos__actions">
        <button type="button" className="ink-btn ink-btn--save" disabled={!pending} onClick={onConfirm}>
          Add to this card
        </button>
        <button type="button" className="ink-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
