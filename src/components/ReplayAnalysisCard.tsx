import { useEffect, useRef, useState } from 'react';
import { CLOUD_MEDIA_EVENT } from '../lib/advantageCloudMedia';
import { VIDEO_CAPTURE, VIDEO_PICKER_ACCEPT, VIDEO_RECORD_ACCEPT } from '../lib/mediaPicker';
import {
  REPLAY_NOTES_MAX,
  REPLAY_SAVED_LABELS,
  REPLAY_SAVE_LABELS,
  REPLAY_TITLE_MAX,
  replayFileName,
  type ReplayBlock,
  type ReplayClipRef,
  type ReplaySaveKind,
} from '../lib/replayAnalysis';
import { newReplayClipId, putReplayClip, readReplayClip } from '../lib/replayClipStore';
import { REPLAY_PENDING_MESSAGE, availableReplaySaveTargets, plainVideoMime, saveReplayClip } from '../lib/replaySave';
import { DeviceMediaInput } from './DeviceMediaInput';
import { ReplayPlayer } from './ReplayPlayer';
import { VideoSourceSheet } from './VideoSourceSheet';

export const REPLAY_STAY_COPY = 'Clips stay on this device until you save a copy to Advantage Cloud, Google Drive, or OneDrive.';

type Props = {
  replay: ReplayBlock;
  heading: string;
  dateKey: string;
  readOnly: boolean;
  /** Existing seat rule: owner, or a seat with "Upload for instructor distribution". */
  canCapture: boolean;
  onChange: (patch: Partial<Omit<ReplayBlock, 'id'>>) => void;
  /**
   * Inside another block (Competition "Record for replay" / "Record for Review").
   * The host block keeps its own heading and notes, so only the clip, player and save show.
   */
  embedded?: boolean;
};

type ClipState = { status: 'none' } | { status: 'loading' } | { status: 'ready'; url: string; blob: Blob } | { status: 'missing' };

/**
 * Video replay analysis card. Record or pick a clip with the same popup the
 * looping videos use, review it in the replay player, and save a copy through
 * Advantage Cloud, Google Drive, or OneDrive when those are already set up.
 */
export function ReplayAnalysisCard({ replay, heading, dateKey, readOnly, canCapture, onChange, embedded = false }: Props) {
  const recordRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [clip, setClip] = useState<ClipState>({ status: 'none' });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState<{ kind: ReplaySaveKind; pct: number } | null>(null);
  const [targets, setTargets] = useState<ReplaySaveKind[]>(() => availableReplaySaveTargets());
  const localId = replay.clip?.localId ?? '';
  /** Async saves finish after more typing; always patch the newest plan. */
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const inputBase = `replay-${replay.id}`;

  useEffect(() => {
    const refresh = () => setTargets(availableReplaySaveTargets());
    refresh();
    window.addEventListener(CLOUD_MEDIA_EVENT, refresh);
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(CLOUD_MEDIA_EVENT, refresh);
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  useEffect(() => {
    if (!localId) {
      setClip({ status: 'none' });
      return;
    }
    let alive = true;
    let url = '';
    setClip({ status: 'loading' });
    readReplayClip(localId)
      .then((record) => {
        if (!alive) return;
        if (!record) {
          setClip({ status: 'missing' });
          return;
        }
        url = URL.createObjectURL(record.blob);
        setClip({ status: 'ready', url, blob: record.blob });
      })
      .catch(() => {
        if (alive) setClip({ status: 'missing' });
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [localId]);

  const onFiles = async (files: readonly File[], source: ReplayClipRef['source']) => {
    setSheetOpen(false);
    const file = files[0];
    if (!file) return;
    if (file.type && !file.type.startsWith('video/')) {
      setMessage('Choose a video clip.');
      return;
    }
    const id = newReplayClipId();
    const mime = plainVideoMime(file.type || 'video/mp4');
    try {
      await putReplayClip({ id, name: file.name || 'Replay clip', mime, blob: file, addedAt: Date.now() });
    } catch {
      setMessage('This device could not keep that clip. Free some space and try again.');
      return;
    }
    setMessage(null);
    onChangeRef.current({ clip: { localId: id, name: (file.name || 'Replay clip').slice(0, 160), mime, size: file.size, source } });
  };

  const save = async (kind: ReplaySaveKind) => {
    if (clip.status !== 'ready' || !replay.clip || saving) return;
    setSaving({ kind, pct: 0 });
    setMessage(null);
    const result = await saveReplayClip({
      kind,
      dateKey,
      fileName: replayFileName(dateKey, replay.title, replay.clip.mime, replay.id),
      blob: clip.blob,
      mime: replay.clip.mime,
      replayId: replay.id,
      onProgress: (sent, total) => setSaving({ kind, pct: total > 0 ? Math.round((sent / total) * 100) : 0 }),
    });
    setSaving(null);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    const latest = replayRef.current.clip;
    // A clip replaced during the upload keeps its own (unsaved) state.
    if (result.pending) {
      // Not lesson media yet: the head coach approves or declines it.
      setMessage(`${REPLAY_PENDING_MESSAGE} This device keeps a copy.`);
      return;
    }
    if (latest && latest.localId === replay.clip.localId) {
      onChangeRef.current({ clip: { ...latest, saved: { kind: result.kind, ref: result.ref } } });
    }
    setMessage(`${REPLAY_SAVED_LABELS[result.kind]}. This device keeps a copy.`);
  };

  const editable = !readOnly;
  const titleId = `${inputBase}-title`;
  const notesId = `${inputBase}-notes`;
  const showCapture = editable && canCapture;

  return (
    <section
      className={embedded ? 'replay-card replay-card--embedded' : 'notes__card replay-card'}
      id={embedded ? undefined : `lesson-block-${replay.id}`}
      data-lesson-block={embedded ? undefined : heading}
      aria-label={embedded ? `Replay for ${heading}` : undefined}
    >
      <div className="notes__field">
        {embedded ? null : (
          <>
            <div className="notes__section-head">
              <h2 className="replay-card__heading">{heading}</h2>
            </div>
            <label htmlFor={titleId} className="replay-card__label">
              What are we reviewing?
            </label>
            <input
              id={titleId}
              type="text"
              value={replay.title}
              maxLength={REPLAY_TITLE_MAX}
              placeholder="e.g. Saturday tournament, round 2"
              readOnly={!editable}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          </>
        )}

        {clip.status === 'ready' ? (
          <ReplayPlayer
            src={clip.url}
            label={heading}
            frameName={replayFileName(dateKey, replay.title, 'image/png', replay.id).replace(/\.mp4$/, '.png')}
            dateKey={dateKey}
            replayId={replay.id}
          />
        ) : null}
        {clip.status === 'loading' ? <p className="replay-card__note">Opening clip…</p> : null}
        {clip.status === 'missing' ? (
          <p className="replay-card__note">
            This clip is not on this device.
            {replay.clip?.saved ? ` A copy was ${REPLAY_SAVED_LABELS[replay.clip.saved.kind].toLowerCase()}.` : ''}
          </p>
        ) : null}
        {clip.status === 'none' && !showCapture ? <p className="replay-card__note">No clip yet.</p> : null}

        {showCapture ? (
          <div className="replay-card__actions">
            <button type="button" className="btn" onClick={() => setSheetOpen(true)}>
              {replay.clip ? 'Replace video' : 'Record or pick video'}
            </button>
            {clip.status === 'ready'
              ? targets.map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className="btn btn--ghost"
                    disabled={Boolean(saving)}
                    onClick={() => void save(kind)}
                  >
                    {saving?.kind === kind ? `Saving… ${saving.pct}%` : REPLAY_SAVE_LABELS[kind]}
                  </button>
                ))
              : null}
          </div>
        ) : null}
        {replay.clip?.saved && clip.status === 'ready' ? (
          <p className="replay-card__note">{REPLAY_SAVED_LABELS[replay.clip.saved.kind]}.</p>
        ) : null}
        {showCapture && clip.status === 'ready' && targets.length === 0 ? (
          <p className="replay-card__note">{REPLAY_STAY_COPY}</p>
        ) : null}
        {message ? (
          <p className="replay-card__note" role="status">
            {message}
          </p>
        ) : null}

        {embedded ? null : (
          <>
            <label htmlFor={notesId} className="replay-card__label">
              Notes
            </label>
            <textarea
              id={notesId}
              value={replay.notes}
              rows={3}
              maxLength={REPLAY_NOTES_MAX}
              readOnly={!editable}
              onChange={(event) => onChange({ notes: event.target.value })}
            />
          </>
        )}
      </div>
      {showCapture ? (
        <>
          <VideoSourceSheet
            open={sheetOpen}
            title={replay.clip ? 'Replace video' : 'Add video'}
            recordInputId={`${inputBase}-record`}
            libraryInputId={`${inputBase}-library`}
            stay={REPLAY_STAY_COPY}
            onClose={() => setSheetOpen(false)}
          />
          <DeviceMediaInput
            id={`${inputBase}-record`}
            inputRef={recordRef}
            accept={VIDEO_RECORD_ACCEPT}
            capture={VIDEO_CAPTURE}
            onFiles={(files) => onFiles(files, 'record')}
          />
          <DeviceMediaInput
            id={`${inputBase}-library`}
            inputRef={libraryRef}
            accept={VIDEO_PICKER_ACCEPT}
            onFiles={(files) => onFiles(files, 'gallery')}
          />
        </>
      ) : null}
    </section>
  );
}
