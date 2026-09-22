import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeviceMediaInput } from '../components/DeviceMediaInput';
import { FolderItemList } from '../components/FolderItemList';
import { FullscreenChip } from '../components/FullscreenChip';
import { EmptyHint } from '../components/EmptyHint';
import { PlayExitMark } from '../components/PlayExitMark';
import { TvTip } from '../components/TvTip';
import { VideoSourceSheet } from '../components/VideoSourceSheet';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { EMPTY_VIDEOS_BODY, EMPTY_VIDEOS_TITLE } from '../lib/coachCopy';
import { formatMmSs, formatMss, secondsToMs } from '../lib/format';
import { VIDEO_CAPTURE, VIDEO_PICKER_ACCEPT, VIDEO_RECORD_ACCEPT } from '../lib/mediaPicker';
import {
  DEFAULT_MUTE_VIDEO,
  getSaverPrefs,
  setSaverMuteVideo,
} from '../lib/photoStore';
import {
  clampDrillSec,
  DEFAULT_DRILL_SEC,
  DRILL_PRESETS_SEC,
  isDrillPreset,
  MAX_DRILL_SEC,
  MIN_DRILL_SEC,
  remainingOnStart,
  tickRemainingMs,
} from '../lib/techniqueLogic';
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
  setTechniqueDrillSec,
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
  const [addOpen, setAddOpen] = useState(false);
  const [drillSec, setDrillSec] = useState(DEFAULT_DRILL_SEC);
  const [remainingMs, setRemainingMs] = useState(secondsToMs(DEFAULT_DRILL_SEC));
  const [customOpen, setCustomOpen] = useState(false);
  const recordRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const parent = useToolboxParent();

  useVisibleViewportHeight();
  useWakeLock(playing);

  const refresh = async () => {
    const [rows, prefs] = await Promise.all([listTechniqueClips(), getTechniquePrefs()]);
    const ids = rows.map((clip) => clip.id);
    const nextSelected = resolveSelectedId(prefs.selectedId, ids);
    setClips(rows);
    setSelectedId(nextSelected);
    setDrillSec(prefs.drillSec);
    setRemainingMs(secondsToMs(prefs.drillSec));
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
  const canStart = Boolean(selected && selectedSrc);
  const drillDone = remainingMs === 0;
  const customDrill = customOpen || !isDrillPreset(drillSec);

  const selectClip = (id: string) => {
    setSelectedId(id);
    void setTechniqueSelectedId(id);
  };

  const commitMute = (next: boolean) => {
    setMuteVideo(next);
    void setSaverMuteVideo(next);
    if (!next) setUnlockSound(true);
  };

  const commitDrill = (next: number) => {
    const clamped = clampDrillSec(next);
    setDrillSec(clamped);
    setRemainingMs(secondsToMs(clamped));
    void setTechniqueDrillSec(clamped);
  };

  const startDrill = () => {
    if (!canStart) return;
    if (!muteVideo) setUnlockSound(true);
    setRemainingMs((ms) => remainingOnStart(ms, secondsToMs(drillSec)));
    setPlaying(true);
  };

  const stopDrill = () => setPlaying(false);

  useInterval(
    useCallback(() => {
      setRemainingMs((ms) => {
        const next = tickRemainingMs(ms, 100);
        if (next === 0) setPlaying(false);
        return next;
      });
    }, []),
    100,
    playing,
  );

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setAddOpen(false);
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
          : 'That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.',
      );
    }
  };

  const openChooser = () => {
    if (slotsLeft === 0) return;
    setAddOpen(true);
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
      navigate(parent.path);
    });
  };

  return (
    <main className={`techniques${playing ? ' techniques--play' : ''}${fs.className ? ` ${fs.className}` : ''}`}>
      <PlayExitMark to={parent.path} onExit={exitBoard} />
      <header className="techniques__bar">
        <div className="techniques__brand">
          <p className="techniques__eyebrow">{parent.eyebrow}</p>
          <h1>Daily Training Videos</h1>
        </div>
        <div className="techniques__actions">
          <button
            type="button"
            className="btn"
            disabled={!canStart || playing}
            onClick={startDrill}
          >
            Start
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            disabled={!playing}
            onClick={stopDrill}
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
        Film or pick up to 10 clips on this device. <strong>Add clips</strong> opens Record or Pick
        from gallery. <strong>Start</strong> loops the selected clip with the drill timer (2:30 /
        5:00 / 7:00). Mute is on so gym music can keep playing. <strong>Stop</strong> pauses both.
      </p>

      <div className="techniques__layout">
        <section className="techniques__stage" aria-label="Technique player">
          <div className="techniques__player">
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
                <EmptyHint
                  title={EMPTY_VIDEOS_TITLE}
                  body={EMPTY_VIDEOS_BODY}
                  action={
                    <button type="button" className="btn" onClick={openChooser}>
                      Add clips
                    </button>
                  }
                />
              </div>
            )}
            {selected && selectedSrc ? (
              <p
                className={`techniques__clock${playing ? ' techniques__clock--play' : ''}${drillDone ? ' techniques__clock--done' : ''}`}
                aria-live="polite"
              >
                {playing ? <span className="techniques__loop">Loop</span> : null}
                {formatMmSs(remainingMs)}
              </p>
            ) : null}
          </div>
          {selected ? <p className="techniques__now">{selected.label}</p> : null}
        </section>

        <section className="techniques__manage" aria-label="Clip list">
          <div className="techniques__manage-head">
            <button
              type="button"
              className="btn"
              disabled={slotsLeft === 0}
              onClick={openChooser}
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
            <legend>Drill length</legend>
            <p className="saver-sound-hint">
              Countdown on the video. Start runs the loop and the timer together.
            </p>
            <div className="presets presets--match-length" role="radiogroup" aria-label="Drill length">
              {DRILL_PRESETS_SEC.map((seconds) => (
                <button
                  key={seconds}
                  type="button"
                  role="radio"
                  aria-checked={drillSec === seconds && !customOpen}
                  className={`preset${drillSec === seconds && !customOpen ? ' preset--on' : ''}`}
                  disabled={playing}
                  onClick={() => {
                    setCustomOpen(false);
                    commitDrill(seconds);
                  }}
                >
                  {formatMss(seconds)}
                </button>
              ))}
              <button
                type="button"
                role="radio"
                aria-checked={customDrill}
                className={`preset${customDrill ? ' preset--on' : ''}`}
                disabled={playing}
                onClick={() => setCustomOpen(true)}
              >
                Custom
              </button>
            </div>
            {customDrill ? (
              <div className="interval-stepper" role="group" aria-label="Custom drill length">
                <button
                  type="button"
                  className="clock-nudge"
                  disabled={playing || drillSec <= MIN_DRILL_SEC}
                  aria-label="Subtract 15 seconds"
                  onClick={() => commitDrill(drillSec - 15)}
                >
                  −
                </button>
                <strong aria-live="polite">{formatMss(drillSec)}</strong>
                <button
                  type="button"
                  className="clock-nudge"
                  disabled={playing || drillSec >= MAX_DRILL_SEC}
                  aria-label="Add 15 seconds"
                  onClick={() => commitDrill(drillSec + 15)}
                >
                  +
                </button>
              </div>
            ) : null}
          </fieldset>
          <fieldset>
            <legend>Video sound</legend>
            <p className="saver-sound-hint">
              Mute clips so gym-floor music keeps playing. Mute is the default.
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
      <VideoSourceSheet
        open={addOpen}
        title="Add clips"
        recordInputId="techniques-video-record"
        libraryInputId="techniques-video-library"
        onClose={() => setAddOpen(false)}
      />
      <DeviceMediaInput
        id="techniques-video-record"
        inputRef={recordRef}
        accept={VIDEO_RECORD_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="techniques-video-library"
        inputRef={libraryRef}
        accept={VIDEO_PICKER_ACCEPT}
        onFiles={onFiles}
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
