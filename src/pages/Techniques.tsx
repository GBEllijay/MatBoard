import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderItemList } from '../components/FolderItemList';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { TvTip } from '../components/TvTip';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import {
  DEFAULT_MUTE_VIDEO,
  getSaverPrefs,
  setSaverMuteVideo,
} from '../lib/photoStore';
import {
  addTechniqueFiles,
  clearTechniqueClips,
  clipSlotsLeft,
  getTechniquePrefs,
  listTechniqueClips,
  MAX_TECHNIQUE_CLIPS,
  removeTechniqueClip,
  renameTechniqueClip,
  reorderTechniqueClips,
  resolveSelectedId,
  setTechniqueSelectedId,
  TECHNIQUE_FOLDER,
  withTechniqueOrder,
  type TechniqueClip,
} from '../lib/techniqueStore';

export function TechniquesPage() {
  const [clips, setClips] = useState<TechniqueClip[]>([]);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muteVideo, setMuteVideo] = useState(DEFAULT_MUTE_VIDEO);
  const [unlockSound, setUnlockSound] = useState(false);
  const [pickerNote, setPickerNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();

  useVisibleViewportHeight();
  useWakeLock(playing);

  const refresh = async () => {
    const [rows, prefs] = await Promise.all([listTechniqueClips(), getTechniquePrefs()]);
    const ids = rows.map((clip) => clip.id);
    const nextSelected = resolveSelectedId(prefs.selectedId, ids);
    setClips(rows);
    setSelectedId(nextSelected);
    if (prefs.selectedId !== nextSelected) void setTechniqueSelectedId(nextSelected);
  };

  useEffect(() => {
    void refresh();
    void getSaverPrefs().then((prefs) => setMuteVideo(prefs.muteVideo));
  }, []);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const clipIdsKey = clips.map((clip) => clip.id).join('|');

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const clip of clipsRef.current) {
      next[clip.id] = URL.createObjectURL(clip.blob);
    }
    setUrlById(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [clipIdsKey]);

  const selected = useMemo(
    () => clips.find((clip) => clip.id === selectedId) ?? null,
    [clips, selectedId],
  );
  const selectedSrc = selected ? urlById[selected.id] : undefined;
  const slotsLeft = clipSlotsLeft(clips.length);

  const selectClip = (id: string) => {
    setSelectedId(id);
    void setTechniqueSelectedId(id);
  };

  const commitMute = (next: boolean) => {
    setMuteVideo(next);
    void setSaverMuteVideo(next);
    if (!next) setUnlockSound(true);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const before = clips.length;
    const result = await addTechniqueFiles([...files]);
    if (result.added) {
      setPickerNote(
        result.atCap && before + result.added >= MAX_TECHNIQUE_CLIPS
          ? `Added ${result.added}. You can keep ${MAX_TECHNIQUE_CLIPS} clips on this device.`
          : '',
      );
      const rows = await listTechniqueClips();
      setClips(rows);
      if (!selectedId) {
        const first = rows[0];
        if (first) selectClip(first.id);
      }
    } else {
      setPickerNote(
        result.atCap
          ? `You can keep ${MAX_TECHNIQUE_CLIPS} clips on this device. Remove one to add another.`
          : 'That file cannot play here. Try MP4 or WebM from this device.',
      );
    }
  };

  const persistOrder = async (orderedIds: string[]) => {
    setClips((rows) => withTechniqueOrder(rows, orderedIds));
    try {
      await reorderTechniqueClips(orderedIds);
    } catch {
      await refresh();
    }
  };

  const exitBoard = () => {
    setPlaying(false);
    void fs.exit().finally(() => {
      navigate('/');
    });
  };

  const canStart = Boolean(selected && selectedSrc);

  return (
    <main className={`techniques${playing ? ' techniques--play' : ''}${fs.className ? ` ${fs.className}` : ''}`}>
      <PlayExitMark onExit={exitBoard} />
      <header className="techniques__bar">
        <div className="techniques__brand">
          <p className="techniques__eyebrow">Owner’s Toolbox</p>
          <h1>Daily Techniques</h1>
        </div>
        <div className="techniques__actions">
          <button
            type="button"
            className="btn"
            disabled={!canStart || playing}
            onClick={() => {
              if (!muteVideo) setUnlockSound(true);
              setPlaying(true);
            }}
          >
            Start
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!playing}
            onClick={() => setPlaying(false)}
          >
            Stop
          </button>
          <FullscreenChip
            supported={fs.supported}
            active={fs.active}
            nudge={fs.showFallback}
            shortcut={fs.tvStation}
            onToggle={() => void fs.toggle()}
          />
        </div>
      </header>

      <p className="techniques__hint">
        Pick 1 to 10 clips on this phone or computer. They stay here — nothing is uploaded. Select
        one, tap <strong>Start</strong>, and it loops until <strong>Stop</strong>.
      </p>

      <div className="techniques__layout">
        <section className="techniques__stage" aria-label="Technique player">
          {selected && selectedSrc ? (
            <LoopClip
              key={selected.id}
              src={selectedSrc}
              label={selected.label}
              playing={playing}
              muted={muteVideo}
              unlockSound={unlockSound}
            />
          ) : (
            <div className="techniques__empty">
              <p>Add a clip, then tap Play on that row and Start.</p>
              <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                Add clips
              </button>
            </div>
          )}
          {selected ? <p className="techniques__now">{selected.label}</p> : null}
        </section>

        <section className="techniques__manage" aria-label="Clip list">
          <div className="techniques__manage-head">
            <button
              type="button"
              className="btn"
              disabled={slotsLeft === 0}
              onClick={() => fileRef.current?.click()}
            >
              Add clips
            </button>
            {clips.length ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  void clearTechniqueClips().then(() => {
                    setClips([]);
                    setSelectedId(null);
                    setPlaying(false);
                    setPickerNote('');
                  });
                }}
              >
                Clear clips
              </button>
            ) : null}
          </div>
          <fieldset>
            <legend>Video sound</legend>
            <p className="saver-sound-hint">
              Same as Owner’s Toolbox videos. Mute clips so gym-floor music keeps playing.
            </p>
            <div className="presets presets--split" role="radiogroup" aria-label="Video sound">
              <button
                type="button"
                role="radio"
                aria-checked={muteVideo}
                className={`preset${muteVideo ? ' preset--on' : ''}`}
                onClick={() => commitMute(true)}
              >
                Mute clips
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!muteVideo}
                className={`preset${!muteVideo ? ' preset--on' : ''}`}
                onClick={() => commitMute(false)}
              >
                Play video sound
              </button>
            </div>
          </fieldset>
          {pickerNote ? <p className="saver-folder__empty">{pickerNote}</p> : null}
          <p className="techniques__count">
            {clips.length} of {MAX_TECHNIQUE_CLIPS} clips
          </p>
          <FolderItemList
            folder={TECHNIQUE_FOLDER}
            items={clips}
            thumbById={urlById}
            selectedId={selectedId}
            onSelect={selectClip}
            onRename={async (id, label) => {
              await renameTechniqueClip(id, label);
              setClips((rows) => rows.map((row) => (row.id === id ? { ...row, label } : row)));
            }}
            onRemove={async (id) => {
              await removeTechniqueClip(id);
              const rows = clips.filter((clip) => clip.id !== id);
              const nextSelected = resolveSelectedId(selectedId === id ? null : selectedId, rows.map((clip) => clip.id));
              setClips(rows);
              setSelectedId(nextSelected);
              if (selectedId === id && !nextSelected) setPlaying(false);
            }}
            onReorder={persistOrder}
          />
        </section>
      </div>

      <TvTip onFullscreen={() => void fs.enter()} />
      <input
        ref={fileRef}
        type="file"
        accept={TECHNIQUE_FOLDER.accept}
        multiple
        hidden
        onChange={(e) => {
          void onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </main>
  );
}

function LoopClip({
  src,
  label,
  playing,
  muted,
  unlockSound,
}: {
  src: string;
  label: string;
  playing: boolean;
  muted: boolean;
  unlockSound: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.loop = true;
    el.defaultMuted = muted;
    el.muted = muted;
    if (muted) setNeedsUnmute(false);
    if (!playing) {
      el.pause();
      return;
    }
    let cancelled = false;
    const start = async () => {
      try {
        el.currentTime = 0;
        el.muted = muted;
        if (!muted && unlockSound) el.muted = false;
        await el.play();
        if (cancelled) return;
        if (muted) {
          setNeedsUnmute(false);
          try {
            if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
          } catch {
            /* ignore */
          }
        } else if (!el.muted) {
          setNeedsUnmute(false);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        el.muted = true;
        if (!muted) setNeedsUnmute(true);
        try {
          await el.play();
        } catch {
          /* wait for another Start tap */
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      el.pause();
    };
  }, [playing, src, muted, unlockSound]);

  return (
    <div className="techniques__frame">
      <video
        ref={videoRef}
        className="techniques__video"
        src={src}
        muted={muted}
        playsInline
        loop
        disableRemotePlayback
        aria-label={label}
      />
      {!muted && needsUnmute ? (
        <button
          type="button"
          className="saver__unmute"
          onClick={(event) => {
            event.stopPropagation();
            const el = videoRef.current;
            if (!el) return;
            el.muted = false;
            setNeedsUnmute(false);
            void el.play();
          }}
        >
          Tap for sound
        </button>
      ) : null}
    </div>
  );
}
