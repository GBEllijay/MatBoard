import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DeviceMediaInput } from '../../components/DeviceMediaInput';
import { useAdditions, useIndexCardFile } from '../../indexCards/store.ts';
import { myMoveNames } from '../../lib/glossaryAdditions.ts';
import { GLOSSARY_MIN_CHARS, hiddenGlossaryTerms, myGlossaryNames } from '../../lib/glossaryMatch.ts';
import {
  CARD_VIDEO_TERM_ERROR,
  addCardVideo,
  cardVideoDraftError,
  cardVideoPlace,
  cardVideoLinkError,
  cardVideoQuickTerms,
  cardVideoTerm,
  cardVideoTermFrom,
  cardVideoTermKnown,
  cardVideoTermSuggestions,
  journalCardVideos,
  newCardVideoId,
  removeCardVideo,
  type CardVideoDraft,
} from '../../lib/journalCardVideos';
import type { JournalCardVideo, JournalVideoTerm } from '../../lib/progress/types';
import { deleteFilmBlob, filmFileError, getFilmBlob, putFilmBlob } from '../../lib/studentFilm';
import { originCanStore } from '../../lib/storageQuota';
import { useStudentFile } from './chrome';

type Mode = 'closed' | 'link' | 'phone';

/**
 * Class videos on one journal card (this class, this date).
 * Each video is a file from this phone or a pasted link, tagged with the glossary term it shows.
 * Phone files stay on this phone. Nothing here uploads to Advantage Cloud.
 */
export function JournalCardVideos({ entryId, date, techniqueNames }: { entryId: string; date: string; techniqueNames: readonly string[] }) {
  const { report, commit } = useStudentFile();
  const [params] = useSearchParams();
  const demo = params.get('student') === '1' || params.has('demo');
  const entry = report.journal.find((row) => row.id === entryId);
  const videos = journalCardVideos(entry);
  const additions = useAdditions();
  const file = useIndexCardFile();
  const mine = useMemo(() => myGlossaryNames(myMoveNames(additions), file), [additions, file]);
  const hidden = useMemo(() => hiddenGlossaryTerms(report), [report]);
  const quick = useMemo(() => cardVideoQuickTerms(techniqueNames, mine), [techniqueNames, mine]);
  const [mode, setMode] = useState<Mode>('closed');
  const [url, setUrl] = useState('');
  const [picked, setPicked] = useState<File | null>(null);
  const [term, setTerm] = useState<JournalVideoTerm | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const fileId = `journal-card-video-file-${entryId}`;
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setMode('closed');
    setUrl('');
    setPicked(null);
    setTerm(null);
    setNote('');
    setError('');
  };

  const open = (next: Mode) => {
    reset();
    setStatus('');
    setMode(next);
    if (next === 'phone') fileRef.current?.click();
  };

  const take = (files: readonly File[]) => {
    const chosen = files[0];
    if (!chosen) return;
    const problem = filmFileError(chosen);
    if (problem) {
      setPicked(null);
      setError(problem);
      return;
    }
    setMode('phone');
    setPicked(chosen);
    setError('');
  };

  const save = async () => {
    if (busy) return;
    const draft: CardVideoDraft =
      mode === 'link'
        ? { source: 'link', url, term, note }
        : { source: 'phone', fileName: picked?.name ?? '', mime: picked?.type ?? '', size: picked?.size ?? 0, term, note };
    if (mode === 'phone' && !picked) {
      setError('Pick a video from this phone first.');
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
      if (mode === 'phone' && picked) {
        if ((await originCanStore(picked.size)) === false) throw new Error('This phone is out of room for that video. Free some space, or paste a link instead.');
        await putFilmBlob(id, picked);
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
      commit(removeCardVideo(report, entryId, video.id));
      if (video.source === 'phone') void deleteFilmBlob(video.id).catch(() => undefined);
      setConfirmRemove(null);
      setStatus(`Removed ${video.term.name} video.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove that video.');
    }
  };

  return (
    <section id="class-videos" className="ink adv-card adv-card--wide journal-card-videos" aria-label="Class videos for this card" data-testid="journal-card-videos">
      <h2 className="ink__label">{`Class videos · ${date}`}</h2>
      <p className="student-quiet">
        Videos from this class. Tag each one with the glossary term it shows. Phone videos stay on this phone. Links open where they live. Nothing uploads to Advantage Cloud.
      </p>
      {videos.length === 0 ? <p className="student-quiet">No class videos on this card yet.</p> : null}
      <ul className="journal-card-videos__list">
        {videos.map((video) => (
          <li key={video.id} className="journal-card-videos__item" data-testid="journal-card-video">
            <div className="journal-card-videos__head">
              <span className={cardVideoTermKnown(video.term) ? 'journal-card-videos__tag' : 'journal-card-videos__tag journal-card-videos__tag--free'} title={video.term.id || 'Not in the glossary'}>
                {video.term.name}
              </span>
              <span className="student-quiet">{cardVideoPlace(video)}</span>
            </div>
            {video.note ? <p className="journal-card-videos__note">{video.note}</p> : null}
            {video.source === 'link' ? (
              <a className="ink-btn" href={video.url} target="_blank" rel="noopener noreferrer">
                {`Open ${video.term.name} link`}
              </a>
            ) : (
              <PhoneVideo video={video} />
            )}
            {confirmRemove === video.id ? (
              <div className="student-card__confirm" role="group" aria-label={`Remove ${video.term.name} video`}>
                <p>Remove this video from the card?{video.source === 'phone' ? ' The copy saved for this card is deleted from this phone.' : ''}</p>
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
      </ul>
      {mode === 'closed' ? (
        <div className="journal-videos__actions">
          <button type="button" className="ink-btn" onClick={() => open('link')}>
            Paste a video link
          </button>
          {demo ? null : (
            <button type="button" className="ink-btn" onClick={() => open('phone')}>
              Add a video from this phone
            </button>
          )}
        </div>
      ) : (
        <div className="journal-card-videos__form" role="group" aria-label={mode === 'link' ? 'Add a video link' : 'Add a phone video'}>
          {mode === 'link' ? (
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
          ) : (
            <div className="journal-card-videos__file">
              <p>{picked ? `${picked.name}` : 'No video picked yet.'}</p>
              <label className="ink-btn" htmlFor={fileId}>
                {picked ? 'Pick a different video' : 'Pick a video'}
              </label>
            </div>
          )}
          <TermPicker
            value={term}
            onChange={setTerm}
            quick={quick}
            mine={mine}
            blockedIds={hidden.ids}
            blockedNames={hidden.names}
          />
          <label className="ink">
            <span className="ink__label">Note · optional</span>
            <textarea spellCheck autoCorrect="on" autoCapitalize="sentences" aria-label="Video note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="journal-videos__actions">
            <button type="button" className="ink-btn ink-btn--save" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving video…' : 'Save video to card'}
            </button>
            <button type="button" className="ink-btn" disabled={busy} onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <DeviceMediaInput id={fileId} inputRef={fileRef} accept="video/*" onFiles={take} />
      {demo ? <p className="student-quiet">The demo keeps links only. Phone videos open on a Student Edition phone.</p> : null}
      {status ? <p role="status">{status}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

/** A phone video plays here, from this phone's store. */
function PhoneVideo({ video }: { video: JournalCardVideo }) {
  const [src, setSrc] = useState('');
  const [missing, setMissing] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    let made = '';
    void getFilmBlob(video.id)
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
  }, [open, video.id]);
  if (!open) {
    return (
      <button type="button" className="ink-btn" onClick={() => setOpen(true)}>
        {`Play ${video.term.name} video`}
      </button>
    );
  }
  if (missing) return <p className="student-quiet">This video is not on this phone. It stays on the phone that saved it.</p>;
  if (!src) return <p className="student-quiet">Loading video…</p>;
  return <video className="journal-card-videos__player" controls playsInline preload="metadata" src={src} aria-label={`${video.term.name} video`} />;
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
    () => (query.trim().length >= GLOSSARY_MIN_CHARS && !(value && cardVideoTermKnown(value) && value.name === query.trim()) ? cardVideoTermSuggestions(query, { mine, blockedIds, blockedNames }) : []),
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
