import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { DeviceMediaInput } from '../../components/DeviceMediaInput';
import { loadAcademyLink, loadPersonalDrive, providerLabel, type StudentDriveLink } from '../../lib/academyPathway';
import { formatVideoSize } from '../../lib/driveVideoNames';
import type { JournalClip } from '../../lib/progress/types';
import { PROGRESS_NOTE_MAX } from '../../lib/progress/types';
import {
  addJournalClip,
  deleteJournalClip,
  searchStudentClips,
  setClipNote,
  todayIso,
  updateJournalClip,
} from '../../lib/studentEdition';
import { downloadStudentFilm, studentDriveTarget, uploadStudentFilm } from '../../lib/studentDriveCopy';
import {
  FILM_LARGE_NOTE,
  FILM_PLAY_MISSING,
  commitStudentFilm,
  deleteFilmBlob,
  filmFileError,
  filmIsLarge,
  getFilmBlob,
  loadFilms,
  putFilmBlob,
  searchStudentFilms,
  setFilmNote,
  studentFilmLabel,
  updateFilmTechnique,
  writeFilms,
  type FilmWhere,
  type StudentFilm,
} from '../../lib/studentFilm';
import { originCanStore } from '../../lib/storageQuota';
import { LeatherHeader, StudentMarks, useStudentFile, useStudentPath } from './chrome';

export function VideoLibraryPage() {
  const { report, commit } = useStudentFile();
  const to = useStudentPath();
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [filmTick, setFilmTick] = useState(0);
  const clips = report.clips ?? [];
  const matched = new Set(searchStudentClips(report, query).map((clip) => clip.id));
  const shown = clips.filter((clip) => !query.trim() || matched.has(clip.id) || clip.id === editing);

  const saveNew = () => {
    try {
      commit(addJournalClip(report, url, description));
      setUrl('');
      setDescription('');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that video.');
    }
  };

  const saveEdit = (clip: JournalClip) => {
    try {
      commit(updateJournalClip(report, clip.id, editUrl, editDescription));
      setEditing(null);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that video.');
    }
  };

  return (
    <main className="student student-frame">
      <StudentMarks />
      <LeatherHeader title="Video Library" />
      <div className="student-paper">
        <div className="student-sheet">
          <section className="student-clips" aria-label="Video Library">
            <p className="student-quiet">
              Each link opens in a new tab. Any http or https address is fine, including YouTube, Instagram, and Facebook.
            </p>
            <FilmAMove onSaved={() => setFilmTick((value) => value + 1)} />
            <label className="ink student-search">
              <span className="ink__label">Search</span>
              <input
                aria-label="Search videos"
                value={query}
                placeholder="Technique, drill, or link"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {shown.length === 0 && searchStudentFilms(loadFilms(localStorage), query).length === 0 ? (
              <p className="student-quiet">No videos yet.</p>
            ) : null}
            <FilmedList query={query} tick={filmTick} onChange={() => setFilmTick((value) => value + 1)} />
            {shown.map((clip) => (
              <article key={clip.id} id={`clip-${clip.id}`} className="ink student-clip">
                {editing === clip.id ? (
                  <>
                    <label className="ink__label">
                      Link
                      <input
                        aria-label={`Edit link for ${clip.description}`}
                        value={editUrl}
                        onChange={(event) => setEditUrl(event.target.value)}
                      />
                    </label>
                    <label className="ink__label">
                      Technique or drill
                      <input
                        aria-label={`Edit technique for ${clip.description}`}
                        value={editDescription}
                        onChange={(event) => setEditDescription(event.target.value)}
                      />
                    </label>
                    <div className="student-clip__actions">
                      <button type="button" className="ink-btn" onClick={() => saveEdit(clip)}>
                        Save video changes
                      </button>
                      <button type="button" className="ink-btn" onClick={() => setEditing(null)}>
                        Cancel video edit
                      </button>
                    </div>
                  </>
                ) : (
                  <a href={clip.url} target="_blank" rel="noopener noreferrer">
                    {clip.description}
                  </a>
                )}
                <VideoNote clip={clip} onSave={(note) => commit(setClipNote(report, clip.id, note))} />
                {editing === clip.id ? null : (
                  <div className="student-clip__actions">
                    <button
                      type="button"
                      className="ink-btn"
                      onClick={() => {
                        setEditing(clip.id);
                        setEditUrl(clip.url);
                        setEditDescription(clip.description);
                        setConfirming(null);
                        setError('');
                      }}
                    >
                      {`Edit ${clip.description}`}
                    </button>
                    {confirming === clip.id ? (
                      <div className="student-confirm" role="group" aria-label={`Delete ${clip.description}`}>
                        <span>Delete this video?</span>
                        <button
                          type="button"
                          className="ink-btn"
                          onClick={() => {
                            commit(deleteJournalClip(report, clip.id));
                            setConfirming(null);
                          }}
                        >
                          {`Confirm delete ${clip.description}`}
                        </button>
                        <button type="button" className="ink-btn" onClick={() => setConfirming(null)}>
                          Keep video
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="ink-btn" onClick={() => setConfirming(clip.id)}>
                        {`Delete ${clip.description}`}
                      </button>
                    )}
                  </div>
                )}
              </article>
            ))}
            <label className="ink">
              <span className="ink__label">Link</span>
              <input
                aria-label="Video link"
                inputMode="url"
                value={url}
                placeholder="https://"
                onChange={(event) => setUrl(event.target.value)}
              />
            </label>
            <label className="ink ink--wobble">
              <span className="ink__label">Technique or drill</span>
              <input
                aria-label="Technique or drill"
                value={description}
                placeholder="Armbar from closed guard"
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            {error ? <p role="alert">{error}</p> : null}
            <div className="student-clip__actions">
              <button type="button" className="ink-btn ink-btn--save" onClick={saveNew}>
                Add video
              </button>
            </div>
            <p className="student-quiet">
              <Link to={to('/student/connections')}>Connections</Link> links an academy folder or your own drive.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}

function FilmAMove({ onSaved }: { onSaved: () => void }) {
  const recordRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [technique, setTechnique] = useState('');
  const [date, setDate] = useState(todayIso);
  const [where, setWhere] = useState<FilmWhere>('phone');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [academy, setAcademy] = useState<StudentDriveLink | null>(() => loadAcademyLink(localStorage));
  const [personal, setPersonal] = useState<StudentDriveLink | null>(() => loadPersonalDrive(localStorage));

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const take = (files: readonly File[]) => {
    const next = files[0];
    if (!next) return;
    const problem = filmFileError(next);
    if (preview) URL.revokeObjectURL(preview);
    if (problem) {
      setFile(null);
      setPreview('');
      setError(problem);
      setNote('');
      return;
    }
    setFile(next);
    setPreview(URL.createObjectURL(next));
    setError('');
    setNote(filmIsLarge(next.size) ? FILM_LARGE_NOTE : '');
    setDate(todayIso());
  };

  const cancel = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview('');
    setTechnique('');
    setError('');
    setNote('');
    setWhere('phone');
  };

  const save = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    const link = where === 'phone' ? null : studentDriveTarget(localStorage, where);
    const result = await commitStudentFilm(
      {
        file: { name: file.name, type: file.type, size: file.size, blob: file },
        technique,
        date,
        where,
        provider: link?.provider ?? '',
        films: loadFilms(localStorage),
      },
      {
        canStore: originCanStore,
        putBlob: putFilmBlob,
        upload: link ? (film, blob) => uploadStudentFilm({ link, film, bytes: blob }) : undefined,
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    writeFilms(localStorage, [...loadFilms(localStorage), result.film]);
    setNote(result.largeNote);
    cancel();
    onSaved();
    setAcademy(loadAcademyLink(localStorage));
    setPersonal(loadPersonalDrive(localStorage));
  };

  return (
    <section className="student-film" aria-label="Film a move">
      <h2>Film a move</h2>
      <p className="student-quiet">
        Record a coach or partner showing the night&apos;s technique, or pick a video already on this phone. The name is the date plus the technique you type.
      </p>
      <DeviceMediaInput
        inputRef={recordRef}
        id="student-film-record"
        accept="video/*"
        capture="environment"
        onFiles={take}
      />
      <DeviceMediaInput inputRef={libraryRef} id="student-film-library" accept="video/*" onFiles={take} />
      <div className="student-clip__actions">
        <label className="ink-btn" htmlFor="student-film-record">
          Film a move
        </label>
        <label className="ink-btn" htmlFor="student-film-library">
          Pick from gallery
        </label>
      </div>
      {file ? (
        <div className="student-film__draft">
          {preview ? <video controls playsInline src={preview} aria-label="Preview filmed move" /> : null}
          <p>{formatVideoSize(file.size)}</p>
          <label className="ink">
            <span className="ink__label">Technique or title</span>
            <input aria-label="Filmed technique or title" value={technique} onChange={(event) => setTechnique(event.target.value)} />
          </label>
          <label className="ink">
            <span className="ink__label">Date</span>
            <input aria-label="Filmed move date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <fieldset className="student-film__where">
            <legend>Where to save</legend>
            <label>
              <input type="radio" name="film-where" checked={where === 'phone'} onChange={() => setWhere('phone')} />
              Keep on this phone
            </label>
            <label>
              <input
                type="radio"
                name="film-where"
                checked={where === 'academy'}
                disabled={!academy}
                onChange={() => setWhere('academy')}
              />
              {academy ? `Save to my academy (${providerLabel(academy.provider)})` : 'Save to my academy (connect it first)'}
            </label>
            <label>
              <input
                type="radio"
                name="film-where"
                checked={where === 'personal'}
                disabled={!personal}
                onChange={() => setWhere('personal')}
              />
              {personal ? `Save to my drive (${providerLabel(personal.provider)})` : 'Save to my drive (connect it first)'}
            </label>
          </fieldset>
          <div className="student-clip__actions">
            <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving filmed video…' : 'Save filmed video'}
            </button>
            <button type="button" className="ink-btn" disabled={busy} onClick={cancel}>
              Cancel filmed video
            </button>
          </div>
        </div>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

function FilmedList({ query, tick, onChange }: { query: string; tick: number; onChange: () => void }) {
  const [films, setFilms] = useState(() => loadFilms(localStorage));
  useEffect(() => {
    setFilms(loadFilms(localStorage));
  }, [tick]);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const visible = searchStudentFilms(films, query);

  const refresh = (next: StudentFilm[]) => {
    setFilms(writeFilms(localStorage, next));
    onChange();
  };

  return (
    <>
      {visible.map((film) => {
        const label = studentFilmLabel(film);
        return (
          <article key={film.id} id={`film-${film.id}`} className="ink student-clip student-film__card">
            {editing === film.id ? (
              <>
                <label className="ink__label">
                  Technique or title
                  <input aria-label={`Edit filmed technique for ${label}`} value={title} onChange={(event) => setTitle(event.target.value)} />
                </label>
                <div className="student-clip__actions">
                  <button
                    type="button"
                    className="ink-btn"
                    onClick={() => {
                      refresh(updateFilmTechnique(films, film.id, title));
                      setEditing(null);
                    }}
                  >
                    Save filmed changes
                  </button>
                  <button type="button" className="ink-btn" onClick={() => setEditing(null)}>
                    Cancel filmed edit
                  </button>
                </div>
              </>
            ) : (
              <h3>{label}</h3>
            )}
            <p className="student-quiet">
              {film.fileName}
              {film.where === 'phone' ? ' · On this phone' : ''}
              {film.where === 'academy' ? ' · Academy folder' : ''}
              {film.where === 'personal' ? ' · My drive' : ''}
            </p>
            <FilmedPlayer film={film} label={label} />
            <FilmNote
              film={film}
              onSave={(note) => refresh(setFilmNote(films, film.id, note))}
            />
            <div className="student-clip__actions">
              <button
                type="button"
                className="ink-btn"
                onClick={() => {
                  setEditing(film.id);
                  setTitle(film.technique);
                  setConfirming(null);
                }}
              >
                {`Edit filmed ${label}`}
              </button>
              {confirming === film.id ? (
                <div className="student-confirm" role="group" aria-label={`Delete filmed ${label}`}>
                  <span>
                    Delete this filmed move?
                    {film.where === 'phone' ? '' : ' The copy in the drive folder stays there.'}
                  </span>
                  <button
                    type="button"
                    className="ink-btn"
                    onClick={() => {
                      void deleteFilmBlob(film.id).catch(() => undefined);
                      refresh(films.filter((item) => item.id !== film.id));
                      setConfirming(null);
                    }}
                  >
                    {`Confirm delete filmed ${label}`}
                  </button>
                  <button type="button" className="ink-btn" onClick={() => setConfirming(null)}>
                    Keep filmed video
                  </button>
                </div>
              ) : (
                <button type="button" className="ink-btn" onClick={() => setConfirming(film.id)}>
                  {`Delete filmed ${label}`}
                </button>
              )}
            </div>
          </article>
        );
      })}
    </>
  );
}

function FilmedPlayer({ film, label }: { film: StudentFilm; label: string }) {
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return () => {
      if (src) URL.revokeObjectURL(src);
    };
  }, [src]);

  const play = async () => {
    setBusy(true);
    setError('');
    try {
      const local = film.where === 'phone' ? await getFilmBlob(film.id) : null;
      const blob = local ?? (film.driveFileId ? await downloadStudentFilm(film) : null);
      if (!blob) {
        setError(FILM_PLAY_MISSING);
        return;
      }
      if (src) URL.revokeObjectURL(src);
      setSrc(URL.createObjectURL(blob));
    } catch (err) {
      setError(err instanceof Error ? err.message : FILM_PLAY_MISSING);
    } finally {
      setBusy(false);
    }
  };

  if (src) return <video controls playsInline src={src} aria-label={`Play ${label}`} />;
  return (
    <>
      <button type="button" className="ink-btn" disabled={busy} onClick={() => void play()}>
        {busy ? `Loading ${label}…` : `Play ${label}`}
      </button>
      {filmIsLarge(film.size) ? <p className="student-quiet">{FILM_LARGE_NOTE}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}

function FilmNote({ film, onSave }: { film: StudentFilm; onSave: (note: string) => void }) {
  const [note, setNote] = useState(film.note);
  return (
    <label className="ink">
      <span className="ink__label">Notes</span>
      <textarea
        aria-label={`Notes for filmed ${studentFilmLabel(film)}`}
        rows={3}
        maxLength={PROGRESS_NOTE_MAX}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== film.note) onSave(note);
        }}
      />
    </label>
  );
}

function VideoNote({ clip, onSave }: { clip: JournalClip; onSave: (note: string) => void }) {
  const [note, setNote] = useState(clip.note ?? '');
  return (
    <label className="ink">
      <span className="ink__label">Notes</span>
      <textarea
        aria-label={`Notes for ${clip.description}`}
        rows={3}
        maxLength={PROGRESS_NOTE_MAX}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        onBlur={() => {
          if (note !== (clip.note ?? '')) onSave(note);
        }}
      />
    </label>
  );
}
