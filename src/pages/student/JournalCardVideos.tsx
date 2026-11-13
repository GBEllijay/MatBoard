import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { DeviceMediaInput } from '../../components/DeviceMediaInput';
import { useAdditions, useIndexCardFile } from '../../indexCards/store.ts';
import { myMoveNames } from '../../lib/glossaryAdditions.ts';
import { GLOSSARY_MIN_CHARS, hiddenGlossaryTerms, myGlossaryNames } from '../../lib/glossaryMatch.ts';
import {
  CARD_VIDEO_TERM_ERROR,
  addCardVideo,
  cardVideoBlobId,
  cardVideoDraftError,
  cardVideoLinkError,
  cardVideoPlace,
  cardVideoQuickTerms,
  cardVideoTerm,
  cardVideoTermFrom,
  cardVideoTermKnown,
  cardVideoTermSuggestions,
  draftFromClip,
  draftFromFilm,
  draftFromOlder,
  journalCardVideos,
  newCardVideoId,
  olderCardVideos,
  removeCardVideoFully,
  savedVideoChoices,
  type CardVideoDraft,
  type OlderCardVideo,
} from '../../lib/journalCardVideos';
import { VIDEO_CAPTURE } from '../../lib/mediaPicker';
import type { JournalCardVideo, JournalVideoTerm } from '../../lib/progress/types';
import { deleteFilmBlob, filmFileError, getFilmBlob, loadFilms, putFilmBlob, writeFilms, type StudentFilm } from '../../lib/studentFilm';
import { originCanStore } from '../../lib/storageQuota';
import { clearClipJournal, clearFilmJournal, type CardTechnique, type TechniqueAnchor } from '../../lib/videoAssociation';
import { useStudentFile, useStudentPath } from './chrome';
import { TechniquePractice } from './TechniquePractice';

type Mode =
  | { kind: 'closed' }
  | { kind: 'phone' }
  | { kind: 'link' }
  | { kind: 'saved' }
  | { kind: 'older'; older: OlderCardVideo };

/**
 * Class videos on one journal card (this class, this date). The one video section on the card.
 * Add a video by filming a move, picking one from the phone's gallery, pasting a link, or choosing a saved video.
 * Every video is tagged with the glossary term it shows. Phone videos stay on this phone.
 * Nothing here uploads to Advantage Cloud. Videos the older Videos section attached still show, with "Tag this".
 */
/** Where phone videos are kept. This phone's film store (IndexedDB). Tests pass a memory store. */
export type CardVideoStore = {
  put: (id: string, blob: Blob) => Promise<void>;
  remove: (id: string) => Promise<void>;
  get?: (id: string) => Promise<Blob | null>;
};
const PHONE_STORE: CardVideoStore = { put: (id, blob) => putFilmBlob(id, blob), remove: (id) => deleteFilmBlob(id), get: (id) => getFilmBlob(id) };
/** The public demo keeps filmed videos in memory for this visit only. Nothing is written to the phone. */
const demoBlobs = new Map<string, Blob>();
const DEMO_STORE: CardVideoStore = {
  put: async (id, blob) => void demoBlobs.set(id, blob),
  remove: async (id) => void demoBlobs.delete(id),
  get: async (id) => demoBlobs.get(id) ?? null,
};

export function JournalCardVideos({
  entryId,
  date,
  techniques,
  store: storeProp,
}: {
  entryId: string;
  date: string;
  techniques: readonly CardTechnique[];
  store?: CardVideoStore;
}) {
  const { report, commit } = useStudentFile();
  const to = useStudentPath();
  const [params] = useSearchParams();
  const demo = params.get('student') === '1' || params.has('demo');
  const store = storeProp ?? (demo ? DEMO_STORE : PHONE_STORE);
  const entry = report.journal.find((row) => row.id === entryId);
  const videos = journalCardVideos(entry);
  const [films, setFilms] = useState<StudentFilm[]>(() => loadFilms(localStorage));
  const additions = useAdditions();
  const indexFile = useIndexCardFile();
  const mine = useMemo(() => myGlossaryNames(myMoveNames(additions), indexFile), [additions, indexFile]);
  const hidden = useMemo(() => hiddenGlossaryTerms(report), [report]);
  const techniqueNames = useMemo(() => techniques.map((row) => row.name), [techniques]);
  const quick = useMemo(() => cardVideoQuickTerms(techniqueNames, mine), [techniqueNames, mine]);
  const older = olderCardVideos(report, report.clips ?? [], films, entryId, mine);
  const choices = savedVideoChoices(report, report.clips ?? [], films, entryId);
  const anchors = techniques.flatMap((row) => {
    const anchor = anchorForLine(row);
    return anchor ? [{ name: row.name, anchor }] : [];
  });
  const [mode, setMode] = useState<Mode>({ kind: 'closed' });
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [savedPick, setSavedPick] = useState('');
  const [term, setTerm] = useState<JournalVideoTerm | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const recordId = `journal-card-video-record-${entryId}`;
  const galleryId = `journal-card-video-gallery-${entryId}`;
  const recordRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFilms(loadFilms(localStorage));
  }, [report.updatedAt, entryId]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const reset = () => {
    setMode({ kind: 'closed' });
    setUrl('');
    setPicked(null);
    setPreview('');
    setSavedPick('');
    setTerm(null);
    setNote('');
    setError('');
  };

  const open = (next: Mode, initial: JournalVideoTerm | null = null) => {
    reset();
    setStatus('');
    setTerm(initial);
    setMode(next);
  };

  const take = (files: readonly File[]) => {
    const chosen = files[0];
    if (!chosen) return;
    const problem = filmFileError(chosen);
    if (problem) {
      setError(problem);
      return;
    }
    const keepTerm = mode.kind === 'phone' ? term : quick.length === 1 ? quick[0] : null;
    const keepNote = mode.kind === 'phone' ? note : '';
    reset();
    setStatus('');
    setMode({ kind: 'phone' });
    setPicked(chosen);
    setPreview(URL.createObjectURL(chosen));
    setTerm(keepTerm);
    setNote(keepNote);
  };

  const pickSaved = (key: string) => {
    setSavedPick(key);
    const [kind, ...rest] = key.split(':');
    const id = rest.join(':');
    if (term) return;
    if (kind === 'film') {
      const film = films.find((row) => row.id === id);
      setTerm(cardVideoTerm(film?.techniqueAnchor?.name ?? film?.technique ?? '', mine));
    } else {
      const clip = report.clips?.find((row) => row.id === id);
      setTerm(cardVideoTerm(clip?.techniqueAnchor?.name ?? '', mine));
    }
  };

  const draftNow = (): CardVideoDraft | string => {
    if (mode.kind === 'link') return { source: 'link', url, term, note };
    if (mode.kind === 'phone') {
      if (!picked) return 'Film a move or pick a video first.';
      return { source: 'phone', fileName: picked.name, mime: picked.type, size: picked.size, term, note };
    }
    if (mode.kind === 'older') return draftFromOlder(mode.older, term, note);
    if (mode.kind === 'saved') {
      const [kind, ...rest] = savedPick.split(':');
      const id = rest.join(':');
      const film = kind === 'film' ? films.find((row) => row.id === id) : undefined;
      const clip = kind === 'link' ? report.clips?.find((row) => row.id === id) : undefined;
      if (film) return draftFromFilm(film, term, note);
      if (clip) return draftFromClip(clip, term, note);
      return 'Choose a saved video first.';
    }
    return '';
  };

  const save = async () => {
    if (busy) return;
    const draft = draftNow();
    if (typeof draft === 'string') {
      setError(draft || 'Nothing to save.');
      return;
    }
    const problem = cardVideoDraftError(draft, videos);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const id = newCardVideoId();
      if (mode.kind === 'phone' && picked) {
        if ((await originCanStore(picked.size)) === false) throw new Error('This phone is out of room for that video. Free some space, or paste a link instead.');
        await store.put(id, picked);
      }
      const result = addCardVideo(report, entryId, draft, { id });
      commit(result.report);
      reset();
      setStatus(`Saved ${result.video.term.name} video to this card.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that video.');
    } finally {
      setBusy(false);
    }
  };

  const remove = (video: JournalCardVideo) => {
    try {
      const result = removeCardVideoFully(report, films, entryId, video.id);
      if (result.filmsChanged) setFilms(writeFilms(localStorage, result.films));
      commit(result.report);
      if (result.deleteBlobId) void store.remove(result.deleteBlobId).catch(() => undefined);
      setConfirmRemove(null);
      setStatus(`Removed ${video.term.name} video from this card.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that video.');
    }
  };

  const removeOlder = (row: OlderCardVideo) => {
    if (row.kind === 'film') setFilms(writeFilms(localStorage, clearFilmJournal(films, row.id)));
    else commit(clearClipJournal(report, row.id));
    setConfirmRemove(null);
    setStatus(`Removed ${row.label} from this card. It stays in the Video library.`);
  };

  const form =
    mode.kind === 'closed' ? null : (
      <div className="journal-card-videos__form" role="group" aria-label={formLabel(mode)}>
        {mode.kind === 'phone' ? (
          <div className="journal-card-videos__review">
            {preview ? <video className="journal-card-videos__player" controls playsInline src={preview} aria-label="Preview filmed move" /> : null}
            <p className="journal-card-videos__file">{picked ? picked.name : 'No video yet.'}</p>
            <div className="journal-videos__actions">
              <label className="ink-btn" htmlFor={recordId}>
                Retry
              </label>
              <label className="ink-btn" htmlFor={galleryId}>
                Pick a different video
              </label>
            </div>
          </div>
        ) : null}
        {mode.kind === 'link' ? (
          <label className="ink">
            <span className="ink__label">Video link</span>
            <input
              type="url"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              aria-label="Video link"
              placeholder="https://"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
            />
            {url.trim() && cardVideoLinkError(url) ? <span className="student-quiet">{cardVideoLinkError(url)}</span> : null}
          </label>
        ) : null}
        {mode.kind === 'saved' ? (
          <fieldset className="journal-card-videos__saved">
            <legend>Saved videos</legend>
            {choices.length === 0 ? <p className="student-quiet">The Video library has no other videos to add.</p> : null}
            {choices.map((row) => (
              <label key={`${row.kind}-${row.id}`} className="journal-card-videos__choice">
                <input type="radio" name={`saved-${entryId}`} checked={savedPick === `${row.kind}:${row.id}`} onChange={() => pickSaved(`${row.kind}:${row.id}`)} />
                <span>{row.label}</span>
                <small>{row.kind === 'film' ? 'Video library' : 'Link'}</small>
              </label>
            ))}
          </fieldset>
        ) : null}
        {mode.kind === 'older' ? <p className="journal-card-videos__file">{`Tag “${mode.older.label}”`}</p> : null}
        <TermPicker key={`${mode.kind}-${mode.kind === 'older' ? `${mode.older.kind}-${mode.older.id}` : ''}-${savedPick}`} value={term} onChange={setTerm} quick={quick} mine={mine} blockedIds={hidden.ids} blockedNames={hidden.names} />
        <label className="ink">
          <span className="ink__label">Note · optional</span>
          <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label="Video note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="journal-videos__actions">
          <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving video…' : mode.kind === 'older' ? 'Save tag' : 'Save video to card'}
          </button>
          <button type="button" className="ink-btn" disabled={busy} onClick={reset}>
            Cancel
          </button>
        </div>
      </div>
    );

  return (
    <section id="class-videos" className="ink adv-card adv-card--wide journal-card-videos" aria-label="Class videos for this card" data-testid="journal-card-videos">
      <h2 className="ink__label">{`Class videos · ${date}`}</h2>
      <p className="student-quiet">
        Film a move, pick one from your gallery, paste a link, or choose a saved video. Tag each one with the glossary term it shows. Phone videos stay on this phone. Nothing uploads to Advantage Cloud.
      </p>
      {videos.length === 0 && older.here.length === 0 ? <p className="student-quiet">No class videos on this card yet.</p> : null}
      <ul className="journal-card-videos__list">
        {videos.map((video) => (
          <li key={video.id} className="journal-card-videos__item" data-testid="journal-card-video">
            <div className="journal-card-videos__head">
              <span className={cardVideoTermKnown(video.term) ? 'journal-card-videos__tag' : 'journal-card-videos__tag journal-card-videos__tag--free'} title={video.term.id || 'Not in the glossary'}>
                {video.term.name}
              </span>
              <span className="student-quiet">{`${cardVideoPlace(video)} · saved ${savedDay(video.createdAt)}`}</span>
            </div>
            {video.note ? <p className="journal-card-videos__note">{video.note}</p> : null}
            {video.source === 'link' ? (
              <a className="ink-btn" href={video.url} target="_blank" rel="noopener noreferrer">
                {`Open ${video.term.name} link`}
              </a>
            ) : (
              <PhoneVideo blobId={cardVideoBlobId(video)} label={video.term.name} libraryId={video.filmId ?? ''} read={video.filmId ? getFilmBlob : store.get ?? getFilmBlob} />
            )}
            {confirmRemove === video.id ? (
              <div className="student-card__confirm" role="group" aria-label={`Remove ${video.term.name} video`}>
                <p>
                  Remove this video from the card?
                  {video.source === 'phone' && !video.filmId ? ' The copy saved for this card is deleted from this phone.' : video.filmId || video.clipId ? ' It stays in the Video library.' : ''}
                </p>
                <button type="button" className="ink-btn" onClick={() => remove(video)}>
                  Confirm remove
                </button>
                <button type="button" className="ink-btn" onClick={() => setConfirmRemove(null)}>
                  Keep video
                </button>
              </div>
            ) : (
              <button type="button" className="ink-btn" onClick={() => setConfirmRemove(video.id)}>
                {`Remove ${video.term.name} video`}
              </button>
            )}
          </li>
        ))}
        {older.here.map((row) => (
          <li key={`older-${row.kind}-${row.id}`} className="journal-card-videos__item journal-card-videos__item--untagged" data-testid="journal-card-video-untagged">
            <div className="journal-card-videos__head">
              <span className="journal-card-videos__tag journal-card-videos__tag--untagged">Not tagged</span>
              <span>{row.label}</span>
            </div>
            <p className="student-quiet">{row.kind === 'link' ? 'Link · saved on this card earlier' : 'Video library · saved on this card earlier'}</p>
            <OlderOpen row={row} />
            {mode.kind === 'older' && mode.older.id === row.id && mode.older.kind === row.kind ? (
              form
            ) : (
              <button type="button" className="ink-btn ink-btn--save" onClick={() => open({ kind: 'older', older: row }, row.suggested)}>
                {`Tag this: ${row.label}`}
              </button>
            )}
            {confirmRemove === `older-${row.id}` ? (
              <div className="student-card__confirm" role="group" aria-label={`Remove ${row.label}`}>
                <p>Remove this video from the card? It stays in the Video library.</p>
                <button type="button" className="ink-btn" onClick={() => removeOlder(row)}>
                  Confirm remove
                </button>
                <button type="button" className="ink-btn" onClick={() => setConfirmRemove(null)}>
                  Keep video
                </button>
              </div>
            ) : (
              <button type="button" className="ink-btn" onClick={() => setConfirmRemove(`older-${row.id}`)}>
                {`Remove ${row.label} from card`}
              </button>
            )}
          </li>
        ))}
      </ul>
      {mode.kind === 'closed' || mode.kind === 'older' ? (
        <div className="journal-videos__actions journal-card-videos__add" aria-label="Add a class video">
          <label className="ink-btn ink-btn--save" htmlFor={recordId}>
            Film a move
          </label>
          <label className="ink-btn" htmlFor={galleryId}>
            Pick from gallery
          </label>
          <button type="button" className="ink-btn" onClick={() => open({ kind: 'link' }, quick.length === 1 ? quick[0] : null)}>
            Paste a video link
          </button>
          <button type="button" className="ink-btn" onClick={() => open({ kind: 'saved' })}>
            Choose a saved video
          </button>
        </div>
      ) : null}
      {mode.kind !== 'closed' && mode.kind !== 'older' ? form : null}
      <p className="student-quiet">Film a move opens this phone&apos;s camera when the browser allows it. Some phones open the gallery instead. Nothing is saved until you tap Save.</p>
      <DeviceMediaInput id={recordId} inputRef={recordRef} accept="video/*" capture={VIDEO_CAPTURE} onFiles={take} />
      <DeviceMediaInput id={galleryId} inputRef={galleryRef} accept="video/*" onFiles={take} />
      {demo ? <p className="student-quiet">Demo: filmed videos play during this visit only and are not saved to this phone.</p> : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {older.elsewhere.length || anchors.length ? (
        <div className="journal-card-videos__elsewhere">
          <h3 className="ink__label">Same technique, other classes</h3>
          {older.elsewhere.map((row) => (
            <div key={`else-${row.kind}-${row.id}`} className="journal-card-videos__item">
              <div className="journal-card-videos__head">
                <span>{row.label}</span>
                {row.originDate ? <span className="student-quiet">{`From ${row.originDate}`}</span> : null}
              </div>
              <OlderOpen row={row} />
              {row.originId ? (
                <Link className="ink-btn" to={to(`/student/cards/${row.originId}#class-videos`)}>
                  {`Original class · ${row.originDate}`}
                </Link>
              ) : null}
              {mode.kind === 'older' && mode.older.id === row.id && mode.older.kind === row.kind ? (
                form
              ) : (
                <button type="button" className="ink-btn" onClick={() => open({ kind: 'older', older: row }, row.suggested)}>
                  {`Add ${row.label} to this card`}
                </button>
              )}
            </div>
          ))}
          {anchors.map((row) => (
            <div key={row.anchor.id} className="journal-card-videos__item">
              <h4>{row.name}</h4>
              <TechniquePractice report={report} anchor={row.anchor} currentId={entryId} />
            </div>
          ))}
        </div>
      ) : null}
      <div className="journal-videos__actions">
        <Link className="ink-btn" to={to('/student/videos')}>
          Video library
        </Link>
      </div>
    </section>
  );
}

function formLabel(mode: Mode): string {
  switch (mode.kind) {
    case 'phone':
      return 'Review filmed move';
    case 'link':
      return 'Add a video link';
    case 'saved':
      return 'Choose a saved video';
    case 'older':
      return 'Tag this video';
    default:
      return 'Add a class video';
  }
}

function savedDay(time: number): string {
  if (!time) return 'earlier';
  const day = new Date(time);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
}

function anchorForLine(row: CardTechnique): TechniqueAnchor | null {
  const name = row.name.trim();
  if (!name) return null;
  if (row.workingId && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(row.workingId)) return { kind: 'working', id: row.workingId, name };
  if (row.id && !row.id.startsWith('free.') && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(row.id)) return { kind: 'fundamental', id: row.id, name };
  return null;
}

/** Open an older video: a link opens in a new tab, a phone film plays here, a drive or academy film opens in the Video library. */
function OlderOpen({ row }: { row: OlderCardVideo }) {
  if (row.kind === 'link') {
    return (
      <a className="ink-btn" href={row.url} target="_blank" rel="noopener noreferrer">
        {`Open ${row.label} link`}
      </a>
    );
  }
  if (row.where === 'phone') return <PhoneVideo blobId={row.id} label={row.label} libraryId={row.id} />;
  return <LibraryLink id={row.id} label={row.label} />;
}

function LibraryLink({ id, label }: { id: string; label: string }) {
  const to = useStudentPath();
  return (
    <Link className="ink-btn" to={to(`/student/videos#film-${id}`)}>
      {`Open ${label} in Video library`}
    </Link>
  );
}

/** A phone video plays here, from this phone's film store. */
function PhoneVideo({
  blobId,
  label,
  libraryId,
  read = getFilmBlob,
}: {
  blobId: string;
  label: string;
  libraryId: string;
  read?: (id: string) => Promise<Blob | null>;
}) {
  const [src, setSrc] = useState('');
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made = '';
    void read(blobId)
      .then((blob) => {
        if (!alive) return;
        if (!blob) {
          setMissing(true);
          return;
        }
        made = URL.createObjectURL(blob);
        setSrc(made);
      })
      .catch(() => {
        if (alive) setMissing(true);
      });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [open, blobId, read]);
  if (!open) {
    return (
      <button type="button" className="ink-btn" onClick={() => setOpen(true)}>
        {`Play ${label} video`}
      </button>
    );
  }
  if (missing) {
    return (
      <>
        <p className="student-quiet">This video is not on this phone. It stays on the phone that saved it.</p>
        {libraryId ? <LibraryLink id={libraryId} label={label} /> : null}
      </>
    );
  }
  if (!src) return <p className="student-quiet">Loading video…</p>;
  return <video className="journal-card-videos__player" controls playsInline preload="metadata" src={src} aria-label={`${label} video`} />;
}

/** Pick the glossary term a video shows: one tap from this card's techniques, or type three letters. */
function TermPicker({
  value,
  onChange,
  quick,
  mine,
  blockedIds,
  blockedNames,
}: {
  value: JournalVideoTerm | null;
  onChange: (term: JournalVideoTerm | null) => void;
  quick: readonly JournalVideoTerm[];
  mine: ReturnType<typeof myGlossaryNames>;
  blockedIds: readonly string[];
  blockedNames: readonly string[];
}) {
  const [query, setQuery] = useState(value?.name ?? '');
  const matches = useMemo(
    () =>
      query.trim().length >= GLOSSARY_MIN_CHARS && !(value && cardVideoTermKnown(value) && value.name === query.trim())
        ? cardVideoTermSuggestions(query, { mine, blockedIds, blockedNames })
        : [],
    [query, value, mine, blockedIds, blockedNames],
  );
  return (
    <div className="journal-card-videos__term" role="group" aria-label="Glossary term">
      <span className="ink__label">Glossary term · what this video shows</span>
      {quick.length ? (
        <div className="journal-card-videos__chips" aria-label="Techniques on this card">
          {quick.map((term) => (
            <button
              key={term.id}
              type="button"
              className="glossary-chip"
              aria-pressed={value?.id === term.id}
              onClick={() => {
                onChange(term);
                setQuery(term.name);
              }}
            >
              {term.name}
            </button>
          ))}
        </div>
      ) : null}
      <input
        aria-label="Glossary term"
        placeholder="Type 3 letters: kimura, armbar, hip bump…"
        autoCapitalize="none"
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          onChange(cardVideoTerm(next, mine));
        }}
      />
      {matches.length ? (
        <div className="glossary-suggest" role="listbox" aria-label="Matching glossary terms">
          {matches.map((match) => (
            <button
              key={match.id}
              type="button"
              className="glossary-chip"
              role="option"
              aria-selected={value?.id === match.id}
              onClick={() => {
                onChange(cardVideoTermFrom(match));
                setQuery(match.name);
              }}
            >
              <span>{match.name}</span>
              {match.source === 'mine' ? <small>My move</small> : null}
            </button>
          ))}
        </div>
      ) : null}
      {value ? (
        <p className="student-quiet" data-testid="journal-card-video-term">
          {cardVideoTermKnown(value) ? `Tagged: ${value.name}` : `“${value.name}” is not in the glossary yet. It saves as typed.`}
        </p>
      ) : (
        <p className="student-quiet">{CARD_VIDEO_TERM_ERROR}</p>
      )}
    </div>
  );
}
