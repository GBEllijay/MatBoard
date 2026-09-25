import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DeviceMediaInput } from '../components/DeviceMediaInput';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { TvTip } from '../components/TvTip';
import { VideoSourceSheet } from '../components/VideoSourceSheet';
import { useInterval } from '../hooks/useClock';
import { useCoachPageSwipe } from '../hooks/useCoachSwipe';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatMmSs, formatMss, secondsToMs } from '../lib/format';
import { VIDEO_CAPTURE, VIDEO_PICKER_ACCEPT, VIDEO_RECORD_ACCEPT } from '../lib/mediaPicker';
import { DEFAULT_MUTE_VIDEO, getSaverPrefs, setSaverMuteVideo } from '../lib/photoStore';
import { LARGE_MEDIA_BYTES, LARGE_MEDIA_NOTE, quotaAddNote } from '../lib/storageQuota';
import {
  canAssignClip,
  clipCount,
  DRILL_PRESETS_SEC,
  insertTechniqueSlot,
  isDrillPreset,
  isTimedSlot,
  MAX_DRILL_SEC,
  MAX_TECHNIQUE_SLOTS,
  MIN_DRILL_SEC,
  nextTechniqueSlotId,
  pickAddableVideos,
  remainingOnStart,
  selectSlot,
  setSlotDrill,
  slotTitle,
  tickRemainingMs,
  type VideoPlan,
  type VideoSlot,
} from '../lib/techniqueLogic';
import {
  attachClipToSlot,
  clearSlotClip,
  loadTechniqueBoard,
  saveTechniquePlan,
  type TechniqueClip,
} from '../lib/techniqueStore';

export function TechniquesPage() {
  const [clips, setClips] = useState<TechniqueClip[]>([]);
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muteVideo, setMuteVideo] = useState(DEFAULT_MUTE_VIDEO);
  const [unlockSound, setUnlockSound] = useState(false);
  const [pickerNote, setPickerNote] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [remainingMs, setRemainingMs] = useState(secondsToMs(300));
  const [customSlotId, setCustomSlotId] = useState<string | null>(null);
  const pickerSlotRef = useRef<string | null>(null);
  const planRef = useRef<VideoPlan | null>(null);
  const recordRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const fs = usePlayFullscreen({ auto: false });
  const [stage, setStage] = useState(false);
  const fsActiveRef = useRef(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const parent = useToolboxParent();
  useCoachPageSwipe();
  const launchStarted = useRef(false);
  const launchSlotId = searchParams.get('slot');
  const launchPlay = searchParams.get('play') === '1';

  useVisibleViewportHeight();
  useWakeLock(playing);

  const immersive = fs.active || stage;

  useEffect(() => {
    if (fsActiveRef.current && !fs.active) setStage(false);
    fsActiveRef.current = fs.active;
  }, [fs.active]);

  useEffect(() => {
    if (!playing) setStage(false);
  }, [playing]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setStage(false);
      void fs.exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fs.exit]);

  const requestPlaybackFullscreen = async () => {
    if (fs.active || stage) return;
    if (playing) setStage(true);
    await fs.enter();
  };

  const togglePlaybackFullscreen = async () => {
    if (fs.active || stage) {
      setStage(false);
      await fs.exit();
      return;
    }
    await requestPlaybackFullscreen();
  };

  const applyPlan = (next: VideoPlan) => {
    planRef.current = next;
    setPlan(next);
  };

  useEffect(() => {
    let cancelled = false;
    void loadTechniqueBoard()
      .then((board) => {
        if (cancelled) return;
        applyPlan(board.plan);
        setClips(board.clips);
        const selected = board.plan.slots.find((slot) => slot.slotId === board.plan.selectedSlotId);
        if (selected && isTimedSlot(selected)) setRemainingMs(secondsToMs(selected.drillSec));
      })
      .catch(() => {
        if (!cancelled) setPickerNote('Could not open clips on this device.');
      });
    void getSaverPrefs().then((prefs) => {
      if (!cancelled) setMuteVideo(prefs.muteVideo);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const clipsRef = useRef(clips);
  clipsRef.current = clips;
  const clipIdsKey = clips.map((clip) => `${clip.id}:${clip.addedAt}`).join('|');

  const [urlById, setUrlById] = useState<Record<string, string>>({});
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const clip of clipsRef.current) {
      next[clip.id] = URL.createObjectURL(clip.blob);
    }
    setUrlById(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [clipIdsKey]);

  const selected = useMemo(
    () => plan?.slots.find((slot) => slot.slotId === plan.selectedSlotId) ?? null,
    [plan],
  );
  const selectedClip = selected?.clipId ? clips.find((clip) => clip.id === selected.clipId) : null;
  const selectedSrc = selectedClip ? urlById[selectedClip.id] : undefined;
  const canStart = Boolean(selected?.clipId && selectedSrc && !playing);
  const count = plan ? clipCount(plan) : 0;
  const techniqueCount = plan ? plan.slots.filter((slot) => slot.kind === 'technique').length : 0;
  const atSlotMax = techniqueCount >= MAX_TECHNIQUE_SLOTS;

  const persistPlan = async (next: VideoPlan) => {
    applyPlan(next);
    try {
      await saveTechniquePlan(next);
    } catch {
      setPickerNote('Could not save this plan on this device.');
    }
  };

  const selectCard = (slotId: string) => {
    const current = planRef.current;
    if (!current || current.selectedSlotId === slotId) return;
    const next = selectSlot(current, slotId);
    const slot = next.slots.find((item) => item.slotId === slotId);
    setPlaying(false);
    if (slot && isTimedSlot(slot)) setRemainingMs(secondsToMs(slot.drillSec));
    void persistPlan(next);
  };

  const commitMute = (next: boolean) => {
    setMuteVideo(next);
    void setSaverMuteVideo(next);
    if (!next) setUnlockSound(true);
  };

  const commitDrill = (slotId: string, nextSec: number) => {
    const current = planRef.current;
    if (!current || playing) return;
    const base = current.selectedSlotId === slotId ? current : selectSlot(current, slotId);
    const next = setSlotDrill(base, slotId, nextSec);
    if (next === current) return;
    const slot = next.slots.find((item) => item.slotId === slotId);
    if (slot && isTimedSlot(slot)) setRemainingMs(secondsToMs(slot.drillSec));
    setPlaying(false);
    void persistPlan(next);
  };

  const startDrill = () => {
    if (!selected?.clipId || !selectedSrc || playing) return;
    if (!muteVideo) setUnlockSound(true);
    if (isTimedSlot(selected)) {
      setRemainingMs((ms) => remainingOnStart(ms, secondsToMs(selected.drillSec)));
    }
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
    playing && Boolean(selected && isTimedSlot(selected)),
  );

  useEffect(() => {
    if (!plan) return;
    const id = playing ? plan.selectedSlotId : launchSlotId;
    if (!id) return;
    document.getElementById(`techniques-slot-${id}`)?.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [playing, plan, launchSlotId]);

  useEffect(() => {
    if (!plan || !launchSlotId) return;
    const slot = plan.slots.find((item) => item.slotId === launchSlotId);
    let cancelled = false;
    const clearLaunch = () => {
      window.setTimeout(() => {
        if (cancelled) return;
        const next = new URLSearchParams(window.location.search);
        if (!next.has('slot') && !next.has('play')) return;
        next.delete('slot');
        next.delete('play');
        setSearchParams(next, { replace: true });
      }, 0);
    };

    if (!slot) {
      clearLaunch();
      return () => {
        cancelled = true;
      };
    }

    if (plan.selectedSlotId !== slot.slotId) {
      const next = selectSlot(plan, slot.slotId);
      applyPlan(next);
      if (isTimedSlot(slot)) setRemainingMs(secondsToMs(slot.drillSec));
      void saveTechniquePlan(next).catch(() => {
        setPickerNote('Could not save this plan on this device.');
      });
      return () => {
        cancelled = true;
      };
    }

    const src = slot.clipId ? urlById[slot.clipId] : undefined;
    const waitingForClip = Boolean(launchPlay && slot.clipId && !src);
    if (launchPlay && slot.clipId && src && !launchStarted.current) {
      launchStarted.current = true;
      if (!muteVideo) setUnlockSound(true);
      if (isTimedSlot(slot)) {
        setRemainingMs((ms) => remainingOnStart(ms, secondsToMs(slot.drillSec)));
      }
      setPlaying(true);
    }
    if (!waitingForClip) clearLaunch();
    return () => {
      cancelled = true;
    };
  }, [plan, urlById, launchSlotId, launchPlay, muteVideo, setSearchParams]);

  const openChooser = (slot: VideoSlot) => {
    const current = planRef.current;
    if (!current || !canAssignClip(current, slot.slotId)) return;
    pickerSlotRef.current = slot.slotId;
    setReplacing(Boolean(slot.clipId));
    setAddOpen(true);
    if (current.selectedSlotId !== slot.slotId) {
      const next = selectSlot(current, slot.slotId);
      setPlaying(false);
      if (isTimedSlot(slot)) setRemainingMs(secondsToMs(slot.drillSec));
      void persistPlan(next);
    }
  };

  const onFiles = async (files: File[]) => {
    const slotId = pickerSlotRef.current;
    const current = planRef.current;
    setAddOpen(false);
    if (!files.length || !slotId || !current) return;
    const [file] = pickAddableVideos(files, 1);
    if (!file) {
      setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
      return;
    }
    try {
      const result = await attachClipToSlot(current, slotId, file);
      applyPlan(result.plan);
      setClips(result.clips);
      setPlaying(false);
      if (result.status === 'invalid') {
        setPickerNote('That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.');
        return;
      }
      setPickerNote(file.size >= LARGE_MEDIA_BYTES ? LARGE_MEDIA_NOTE : '');
      const slot = result.plan.slots.find((item) => item.slotId === slotId);
      if (slot && isTimedSlot(slot)) setRemainingMs(secondsToMs(slot.drillSec));
    } catch (error) {
      setPickerNote(quotaAddNote(error) ?? 'Could not save that clip on this device. Try again.');
    }
  };

  const removeClip = async (slotId: string) => {
    const current = planRef.current;
    if (!current) return;
    try {
      const result = await clearSlotClip(current, slotId);
      applyPlan(result.plan);
      setClips(result.clips);
      if (planRef.current?.selectedSlotId === slotId) setPlaying(false);
      setPickerNote('');
    } catch {
      setPickerNote('Could not remove that clip on this device.');
    }
  };

  const addTechnique = () => {
    const current = planRef.current;
    if (!current) return;
    const next = insertTechniqueSlot(current, nextTechniqueSlotId(current));
    if (!next) return;
    void persistPlan(next);
  };

  const exitBoard = () => {
    setPlaying(false);
    void fs.exit().finally(() => {
      navigate(parent.path);
    });
  };

  const warmup = plan?.slots.find((slot) => slot.kind === 'warmup') ?? null;
  const cooldown = plan?.slots.find((slot) => slot.kind === 'cooldown') ?? null;
  const techniques = plan?.slots.filter((slot) => slot.kind === 'technique') ?? [];

  return (
    <main
      className={`techniques${playing ? ' techniques--play' : ''}${fs.className ? ` ${fs.className}` : ''}${stage ? ' techniques--fill' : ''}`}
    >
      <PlayExitMark to={parent.path} onExit={exitBoard} />
      <header className="techniques__bar">
        <div className="techniques__brand">
          <p className="techniques__eyebrow">{parent.eyebrow}</p>
          <h1>Daily Training Videos</h1>
        </div>
        <div className="techniques__actions">
          <button type="button" className="btn" disabled={!canStart} onClick={startDrill}>
            Start
          </button>
          <button type="button" className="btn btn--ghost" disabled={!playing} onClick={stopDrill}>
            Stop
          </button>
          <FullscreenChip
            supported={fs.supported || stage}
            active={immersive}
            nudge={fs.showFallback && !stage}
            shortcut={fs.tvStation}
            onToggle={() => void togglePlaybackFullscreen()}
          />
          <button
            type="button"
            className={`techniques__mute${muteVideo ? ' techniques__mute--on' : ''}`}
            aria-pressed={muteVideo}
            onClick={() => commitMute(!muteVideo)}
          >
            Mute clips
          </button>
          <p className="techniques__count">
            {count} {count === 1 ? 'clip' : 'clips'}
          </p>
        </div>
      </header>

      {pickerNote ? (
        <p className="techniques__note" role="status">
          {pickerNote}
        </p>
      ) : null}

      {plan ? (
      <div className="techniques__plan">
        {warmup ? (
          <SlotCard
            slot={warmup}
            title={slotTitle(warmup, 0)}
            selected={plan?.selectedSlotId === warmup.slotId}
            playing={playing && plan?.selectedSlotId === warmup.slotId}
            src={warmup.clipId ? urlById[warmup.clipId] : undefined}
            muted={muteVideo}
            unlockSound={unlockSound}
            canAdd={plan ? canAssignClip(plan, warmup.slotId) : false}
            onSelect={() => selectCard(warmup.slotId)}
            onAdd={() => openChooser(warmup)}
            onRemove={() => void removeClip(warmup.slotId)}
            fullscreen={immersive}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => commitMute(!muteVideo)}
          />
        ) : null}

        {techniques.map((slot, index) => (
          <SlotCard
            key={slot.slotId}
            slot={slot}
            title={slotTitle(slot, index)}
            selected={plan?.selectedSlotId === slot.slotId}
            playing={playing && plan?.selectedSlotId === slot.slotId}
            src={slot.clipId ? urlById[slot.clipId] : undefined}
            muted={muteVideo}
            unlockSound={unlockSound}
            canAdd={plan ? canAssignClip(plan, slot.slotId) : false}
            remainingMs={plan?.selectedSlotId === slot.slotId ? remainingMs : secondsToMs(slot.drillSec)}
            customOpen={customSlotId === slot.slotId || !isDrillPreset(slot.drillSec)}
            timersLocked={playing}
            onSelect={() => selectCard(slot.slotId)}
            onAdd={() => openChooser(slot)}
            onRemove={() => void removeClip(slot.slotId)}
            onDrill={(seconds) => {
              setCustomSlotId((current) => (current === slot.slotId ? null : current));
              commitDrill(slot.slotId, seconds);
            }}
            onCustom={() => {
              setCustomSlotId(slot.slotId);
              selectCard(slot.slotId);
            }}
            onNudge={(delta) => commitDrill(slot.slotId, slot.drillSec + delta)}
            fullscreen={immersive}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => void commitMute(!muteVideo)}
          />
        ))}

        <button type="button" className="btn techniques__add" disabled={!plan || atSlotMax} onClick={addTechnique}>
          + Add another
        </button>

        {cooldown ? (
          <SlotCard
            slot={cooldown}
            title={slotTitle(cooldown, 0)}
            selected={plan?.selectedSlotId === cooldown.slotId}
            playing={playing && plan?.selectedSlotId === cooldown.slotId}
            src={cooldown.clipId ? urlById[cooldown.clipId] : undefined}
            muted={muteVideo}
            unlockSound={unlockSound}
            canAdd={plan ? canAssignClip(plan, cooldown.slotId) : false}
            onSelect={() => selectCard(cooldown.slotId)}
            onAdd={() => openChooser(cooldown)}
            onRemove={() => void removeClip(cooldown.slotId)}
            fullscreen={immersive}
            onToggleFullscreen={() => void togglePlaybackFullscreen()}
            onStop={stopDrill}
            onToggleMute={() => commitMute(!muteVideo)}
          />
        ) : null}
      </div>
      ) : null}

      <TvTip onFullscreen={() => void requestPlaybackFullscreen()} />
      <VideoSourceSheet
        open={addOpen}
        title={replacing ? 'Replace video' : 'Add video'}
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

function SlotCard({
  slot,
  title,
  selected,
  playing,
  src,
  muted,
  unlockSound,
  canAdd,
  remainingMs,
  customOpen,
  timersLocked,
  onSelect,
  onAdd,
  onRemove,
  onDrill,
  onCustom,
  onNudge,
  fullscreen,
  onToggleFullscreen,
  onStop,
  onToggleMute,
}: {
  slot: VideoSlot;
  title: string;
  selected: boolean;
  playing: boolean;
  src?: string;
  muted: boolean;
  unlockSound: boolean;
  canAdd: boolean;
  remainingMs?: number;
  customOpen?: boolean;
  timersLocked?: boolean;
  onSelect: () => void;
  onAdd: () => void;
  onRemove: () => void;
  onDrill?: (seconds: number) => void;
  onCustom?: () => void;
  onNudge?: (delta: number) => void;
  fullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onStop?: () => void;
  onToggleMute?: () => void;
}) {
  const filled = Boolean(slot.clipId && src);
  const timed = isTimedSlot(slot);
  const showClock = playing && timed && remainingMs != null;
  const cardClass = [
    'techniques__card',
    selected ? 'techniques__card--on' : '',
    playing ? 'techniques__card--playing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section
      id={`techniques-slot-${slot.slotId}`}
      className={cardClass}
      aria-labelledby={`techniques-heading-${slot.slotId}`}
      aria-current={selected ? 'true' : undefined}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, input, label')) return;
        onSelect();
      }}
    >
      <h2 id={`techniques-heading-${slot.slotId}`}>{title}</h2>
      {playing && filled && src ? (
        <LoopClip
          src={src}
          label={title}
          playing
          muted={muted}
          unlockSound={unlockSound}
          fullscreen={Boolean(fullscreen)}
          onToggleFullscreen={onToggleFullscreen}
          onStop={onStop}
          onToggleMute={onToggleMute}
          overlay={
            showClock ? (
              <p
                className={`techniques__clock${remainingMs === 0 ? ' techniques__clock--done' : ' techniques__clock--play'}`}
                aria-live="polite"
              >
                <span className="techniques__loop">Loop</span>
                {formatMmSs(remainingMs)}
              </p>
            ) : (
              <span className="techniques__live">Loop</span>
            )
          }
        />
      ) : filled && src ? (
        <button
          type="button"
          className="techniques__slot techniques__slot--filled"
          aria-pressed={selected}
          onClick={onSelect}
        >
          <video className="techniques__thumb" src={src} muted playsInline preload="metadata" aria-label={title} />
        </button>
      ) : (
        <button
          type="button"
          className={`techniques__slot${canAdd ? '' : ' techniques__slot--cap'}`}
          aria-pressed={selected}
          aria-disabled={!canAdd}
          title={canAdd ? undefined : 'Pick another card to add a clip'}
          onClick={() => {
            onSelect();
            if (canAdd) onAdd();
          }}
        >
          + Add video
        </button>
      )}
      {filled ? (
        <div className="techniques__slot-actions">
          <button type="button" className="btn" onClick={onAdd}>
            Replace
          </button>
          <button type="button" className="btn btn--ghost" onClick={onRemove}>
            Remove
          </button>
        </div>
      ) : null}
      {timed && onDrill && onCustom && onNudge ? (
        <div
          className="presets presets--match-length techniques__presets"
          role="radiogroup"
          aria-label={`Loop timer for ${title}`}
        >
          {DRILL_PRESETS_SEC.map((seconds) => {
            const on = slot.drillSec === seconds && !customOpen;
            return (
              <button
                key={seconds}
                type="button"
                role="radio"
                aria-checked={on}
                className={`preset${on ? ' preset--on' : ''}`}
                disabled={timersLocked}
                onClick={() => onDrill(seconds)}
              >
                {formatMss(seconds)}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={Boolean(customOpen)}
            className={`preset${customOpen ? ' preset--on' : ''}`}
            disabled={timersLocked}
            onClick={onCustom}
          >
            Custom
          </button>
          {customOpen ? (
            <div className="interval-stepper techniques__stepper" role="group" aria-label={`Custom loop timer for ${title}`}>
              <button
                type="button"
                className="clock-nudge"
                disabled={timersLocked || slot.drillSec <= MIN_DRILL_SEC}
                aria-label="Subtract 15 seconds"
                onClick={() => onNudge(-15)}
              >
                −
              </button>
              <strong aria-live="polite">{formatMss(slot.drillSec)}</strong>
              <button
                type="button"
                className="clock-nudge"
                disabled={timersLocked || slot.drillSec >= MAX_DRILL_SEC}
                aria-label="Add 15 seconds"
                onClick={() => onNudge(15)}
              >
                +
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function LoopClip({
  src,
  label,
  playing,
  muted,
  unlockSound,
  fullscreen,
  onToggleFullscreen,
  onStop,
  onToggleMute,
  overlay,
}: {
  src: string;
  label: string;
  playing: boolean;
  muted: boolean;
  unlockSound: boolean;
  fullscreen: boolean;
  onToggleFullscreen?: () => void;
  onStop?: () => void;
  onToggleMute?: () => void;
  overlay?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hideChromeTimer = useRef(0);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [chrome, setChrome] = useState(false);

  const revealChrome = useCallback(() => {
    setChrome(true);
    window.clearTimeout(hideChromeTimer.current);
    hideChromeTimer.current = window.setTimeout(() => setChrome(false), 3800);
  }, []);

  const hideChrome = useCallback(() => {
    window.clearTimeout(hideChromeTimer.current);
    setChrome(false);
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    revealChrome();
    return () => window.clearTimeout(hideChromeTimer.current);
  }, [revealChrome, fullscreen]);

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
    <div
      className={`techniques__frame${fullscreen ? ' techniques__frame--fill' : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('button, a, label')) return;
        if (chrome) hideChrome();
        else revealChrome();
      }}
    >
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
      {overlay}
      {chrome && onToggleFullscreen ? (
        <div className="techniques__chrome" role="toolbar" aria-label="Playback controls">
          {fullscreen && onStop ? (
            <button
              type="button"
              className="techniques__chrome-btn"
              onClick={(event) => {
                event.stopPropagation();
                onStop();
              }}
            >
              Stop
            </button>
          ) : null}
          {fullscreen && onToggleMute ? (
            <button
              type="button"
              className={`techniques__chrome-btn${muted ? ' techniques__chrome-btn--on' : ''}`}
              aria-pressed={muted}
              onClick={(event) => {
                event.stopPropagation();
                onToggleMute();
              }}
            >
              Mute clips
            </button>
          ) : null}
          <button
            type="button"
            className="techniques__chrome-btn techniques__chrome-btn--go"
            aria-pressed={fullscreen}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFullscreen();
            }}
          >
            {fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          </button>
        </div>
      ) : null}
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
