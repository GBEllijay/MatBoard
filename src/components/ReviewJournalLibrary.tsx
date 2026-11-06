import { useEffect, useState } from 'react';
import { ReplayPlayer } from './ReplayPlayer';
import {
  FILM_PLAY_MISSING,
  getFilmBlob,
  loadFilms,
  searchStudentFilms,
  studentFilmLabel,
  type StudentFilm,
} from '../lib/studentFilm';

/**
 * Journal video library on Record for Review.
 * Same filmed-move store and search as Student Edition "Film a move".
 * Review opens the clip in the replay player so the coach can draw on it.
 */
export function ReviewJournalLibrary({ tick }: { tick: number }) {
  const [query, setQuery] = useState('');
  const [films, setFilms] = useState<StudentFilm[]>(() => loadFilms(localStorage));
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setFilms(loadFilms(localStorage));
  }, [tick]);

  const shown = searchStudentFilms(films, query);

  return (
    <section className="notes__card review-library" aria-label="Journal video library">
      <h2 className="replay-card__heading">Journal video library</h2>
      <p className="replay-card__note">
        Clips you add from this review land here, in the same library as Film a move. Search by technique or title.
        Review opens the clip so you can draw on it.
      </p>
      <div className="notes__field">
        <label className="replay-card__label">
          Search
          <input
            type="search"
            aria-label="Search journal video library"
            placeholder="Technique, title, or note"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {shown.length === 0 ? (
        <p className="replay-card__note">{query.trim() ? 'No videos match.' : 'No videos in the journal library yet.'}</p>
      ) : (
        <ul className="review-library__list">
          {shown.map((film) => {
            const label = studentFilmLabel(film);
            const open = openId === film.id;
            return (
              <li key={film.id} className="review-library__item">
                <p className="review-library__title">{label}</p>
                {film.note ? <p className="replay-card__note">{film.note}</p> : null}
                <div className="replay-card__actions">
                  <button
                    type="button"
                    className={open ? 'btn' : 'btn btn--ghost'}
                    aria-pressed={open}
                    onClick={() => setOpenId(open ? null : film.id)}
                  >
                    {open ? 'Close review' : `Review ${label}`}
                  </button>
                </div>
                {open ? <LibraryReview film={film} label={label} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LibraryReview({ film, label }: { film: StudentFilm; label: string }) {
  const [src, setSrc] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    let url = '';
    getFilmBlob(film.id)
      .then((found) => {
        if (!alive) return;
        if (!found) {
          setError(FILM_PLAY_MISSING);
          return;
        }
        url = URL.createObjectURL(found);
        setBlob(found);
        setSrc(url);
      })
      .catch(() => {
        if (alive) setError(FILM_PLAY_MISSING);
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [film.id]);

  if (error) {
    return (
      <p className="replay-card__note" role="alert">
        {error}
      </p>
    );
  }
  if (!src) return <p className="replay-card__note">Opening clip…</p>;
  return (
    <ReplayPlayer
      src={src}
      label={label}
      frameName={`${label}.png`}
      dateKey={film.date}
      clipBlob={blob}
      clipMime={film.mime}
    />
  );
}
