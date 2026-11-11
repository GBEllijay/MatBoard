import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BeltHeader } from './BeltHeader';
import { DeviceMediaInput } from './DeviceMediaInput';
import { DriveMediaPicker } from './DriveMediaPicker';
import { FullscreenChip } from './FullscreenChip';
import { LoopClip } from './LoopClip';
import { OpenMyDrive } from './OpenMyDrive';
import { TvTip } from './TvTip';
import { useWakeLock } from '../hooks/useWakeLock';
import { CLOUD_MEDIA_EVENT } from '../lib/advantageCloudMedia';
import type { DriveBrowseMedia } from '../lib/driveMediaPicker';
import { formatMmSs, formatMss } from '../lib/format';
import { downloadDriveFile, getDriveBindingSnapshot, requestDriveToken, subscribeDriveBinding } from '../lib/googleDrive';
import { VIDEO_PICKER_ACCEPT } from '../lib/mediaPicker';
import {
  CAMERA_PHOTO_HINT,
  CAMERA_TAKE_PHOTO,
  CAMERA_TAKE_VIDEO,
  CAMERA_TITLE,
  TODAYS_VIDEOS_EMPTY,
  TODAYS_VIDEOS_FROM_DEVICE,
  TODAYS_VIDEOS_FROM_DRIVE,
  TODAYS_VIDEOS_LOOP_ALWAYS,
  TODAYS_VIDEOS_LOOP_LABEL,
  TODAYS_VIDEOS_TITLE,
  listTodaysCloudVideos,
  loopChoices,
  openTodaysCloudVideo,
  type TodaysVideoRow,
} from '../lib/pdCamera';
import { DRILL_PRESETS_SEC } from '../lib/techniqueLogic';
import type { usePlayFullscreen } from '../hooks/usePlayFullscreen';

type PlayFullscreen = ReturnType<typeof usePlayFullscreen>;

type Props = {
  photoAllowed: boolean;
  dailyAllowed: boolean;
  dateKey: string;
  statusText: string;
  note: string;
  muted: boolean;
  fs: PlayFullscreen;
  onTakePhoto: () => void;
  onTakeVideo: () => void;
  onToggleMute: () => void;
};

/**
 * Program director Camera window. Separate from the coach menus.
 * Take a photo / Take a video open the Media Console add sheet, so capture,
 * Gallery approval, and the Gallery / Today's videos choice are the same code.
 * Today's videos plays with the Daily Training Videos looping player.
 */
export function CameraWindow({
  photoAllowed,
  dailyAllowed,
  dateKey,
  statusText,
  note,
  muted,
  fs,
  onTakePhoto,
  onTakeVideo,
  onToggleMute,
}: Props) {
  return (
    <div className="camera-window" data-camera-window="">
      <div className="saver-belt">
        <BeltHeader kind="purple" title={CAMERA_TITLE} />
      </div>
      <section className="camera-window__capture" aria-label={CAMERA_TITLE}>
        {photoAllowed ? (
          <button type="button" className="btn" data-camera-take="photo" onClick={onTakePhoto}>
            {CAMERA_TAKE_PHOTO}
          </button>
        ) : null}
        <button type="button" className="btn" data-camera-take="video" onClick={onTakeVideo}>
          {CAMERA_TAKE_VIDEO}
        </button>
        {photoAllowed ? <p className="saver-sound-hint">{CAMERA_PHOTO_HINT}</p> : null}
        {statusText ? (
          <p className="saver-folder__empty" role="status">
            {statusText}
          </p>
        ) : null}
        {note ? (
          <p className="saver-folder__empty" role="status">
            {note}
          </p>
        ) : null}
      </section>
      {dailyAllowed ? (
        <TodaysVideosPlayer dateKey={dateKey} muted={muted} fs={fs} onToggleMute={onToggleMute} />
      ) : null}
    </div>
  );
}

type Clip = { label: string; src: string };

export function TodaysVideosPlayer({
  dateKey,
  muted,
  fs,
  onToggleMute,
}: {
  dateKey: string;
  muted: boolean;
  fs: PlayFullscreen;
  onToggleMute: () => void;
}) {
  const [rows, setRows] = useState<TodaysVideoRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [clip, setClip] = useState<Clip | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loopSec, setLoopSec] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState(0);
  const [stage, setStage] = useState(false);
  const [unlockSound, setUnlockSound] = useState(false);
  const [message, setMessage] = useState('');
  const [drivePickOpen, setDrivePickOpen] = useState(false);
  const deviceRef = useRef<HTMLInputElement>(null);
  const driveBinding = useSyncExternalStore(subscribeDriveBinding, getDriveBindingSnapshot, () => null);
  const immersive = fs.active || stage;

  useWakeLock(playing);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    void listTodaysCloudVideos({ dateKey }).then((next) => {
      if (cancelled) return;
      setRows(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [dateKey]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    const onCloud = () => {
      load();
    };
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    return () => window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
  }, [load]);

  useEffect(() => {
    if (!clip) return;
    return () => URL.revokeObjectURL(clip.src);
  }, [clip]);

  useEffect(() => {
    if (!playing) setStage(false);
  }, [playing]);

  const stop = () => {
    setPlaying(false);
    setStage(false);
    if (fs.active) void fs.exit();
  };

  const toggleFullscreen = async () => {
    if (fs.active || stage) {
      setStage(false);
      await fs.exit();
      return;
    }
    if (playing) setStage(true);
    await fs.enter();
  };

  const start = (label: string, blob: Blob) => {
    setClip({ label, src: URL.createObjectURL(blob) });
    setRemainingMs(loopSec ? loopSec * 1000 : 0);
    setUnlockSound(!muted);
    setPlaying(true);
    setMessage('');
  };

  const playCloud = async (row: TodaysVideoRow) => {
    setMessage('Opening…');
    const blob = await openTodaysCloudVideo({ path: row.path });
    if (!blob) {
      setMessage('That video could not be opened.');
      return;
    }
    start(row.name, blob);
  };

  const playDrive = async (chosen: readonly DriveBrowseMedia[]) => {
    setDrivePickOpen(false);
    const [item] = chosen;
    if (!item) return;
    const token = (await requestDriveToken('silent')) ?? (await requestDriveToken('consent'));
    if (!token) {
      setMessage('Sign in to Google Drive again to play that video.');
      return;
    }
    try {
      start(item.name || 'Drive video', await downloadDriveFile(token, item.id));
    } catch {
      setMessage('That Google Drive video could not be opened. It stays in the gym folder.');
    }
  };

  const playDevice = (files: readonly File[]) => {
    const [file] = files;
    if (!file || file.size === 0) return;
    start(file.name || 'Video', file);
  };

  return (
    <section className="camera-window__today" aria-labelledby="camera-todays-videos" data-todays-videos="">
      <h2 id="camera-todays-videos">{TODAYS_VIDEOS_TITLE}</h2>
      <div className="play-fs-slot">
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          shortcut={fs.tvStation}
          onToggle={() => void toggleFullscreen()}
        />
      </div>
      <TvTip onFullscreen={() => void toggleFullscreen()} />

      <div className="presets" role="radiogroup" aria-label={TODAYS_VIDEOS_LOOP_LABEL} data-loop-choice="">
        {loopChoices(DRILL_PRESETS_SEC).map((seconds) => {
          const on = loopSec === seconds;
          return (
            <button
              key={seconds ?? 'always'}
              type="button"
              role="radio"
              aria-checked={on}
              className={`preset${on ? ' preset--on' : ''}`}
              onClick={() => {
                setLoopSec(seconds);
                setRemainingMs(seconds ? seconds * 1000 : 0);
              }}
            >
              {seconds ? formatMss(seconds) : `${TODAYS_VIDEOS_LOOP_LABEL} · ${TODAYS_VIDEOS_LOOP_ALWAYS}`}
            </button>
          );
        })}
      </div>

      <div className="camera-window__controls" role="toolbar" aria-label="Playback controls">
        {clip ? (
          <button
            type="button"
            className="btn"
            data-play-toggle=""
            onClick={() => {
              if (playing) stop();
              else {
                setRemainingMs(loopSec ? loopSec * 1000 : 0);
                setUnlockSound(!muted);
                setPlaying(true);
              }
            }}
          >
            {playing ? 'Stop' : 'Start'}
          </button>
        ) : null}
        <button type="button" className={`btn btn--ghost${muted ? ' preset--on' : ''}`} aria-pressed={muted} onClick={onToggleMute}>
          Mute clips
        </button>
        {clip ? (
          <button
            type="button"
            className="btn btn--ghost"
            data-camera-fullscreen=""
            onClick={() => {
              if (!playing) {
                setRemainingMs(loopSec ? loopSec * 1000 : 0);
                setUnlockSound(!muted);
                setPlaying(true);
              }
              // iPhone has no Fullscreen API: the fixed stage cover is the full screen.
              if (!immersive) setStage(true);
              void toggleFullscreen();
            }}
          >
            Fullscreen
          </button>
        ) : null}
      </div>

      {clip ? (
        <LoopClip
          key={`${clip.src}:${loopSec ?? 'always'}`}
          src={clip.src}
          label={clip.label}
          playing={playing}
          muted={muted}
          unlockSound={unlockSound}
          fullscreen={immersive}
          durationMs={loopSec ? loopSec * 1000 : undefined}
          onDurationEnd={() => stop()}
          onRemaining={setRemainingMs}
          onToggleFullscreen={() => void toggleFullscreen()}
          onStop={stop}
          onToggleMute={onToggleMute}
          overlay={
            loopSec ? (
              <p
                className={`techniques__clock${remainingMs === 0 ? ' techniques__clock--done' : ' techniques__clock--play'}`}
                aria-live="polite"
              >
                <span className="techniques__loop">{TODAYS_VIDEOS_LOOP_LABEL}</span>
                {formatMmSs(remainingMs)}
              </p>
            ) : null
          }
        />
      ) : null}

      {message ? (
        <p className="saver-folder__empty" role="status">
          {message}
        </p>
      ) : null}

      {loading ? <p className="saver-sound-hint">Loading today's videos…</p> : null}
      {rows && rows.length > 0 ? (
        <ul className="camera-window__list">
          {rows.map((row) => (
            <li key={row.path}>
              <button type="button" className="btn btn--ghost" data-play-path={row.path} onClick={() => void playCloud(row)}>
                Play {row.name}
              </button>
            </li>
          ))}
        </ul>
      ) : rows && !loading ? (
        <p className="saver-sound-hint">{TODAYS_VIDEOS_EMPTY}</p>
      ) : null}
      <div className="camera-window__sources">
        {rows ? (
          <button type="button" className="btn btn--ghost" onClick={() => load()}>
            Refresh
          </button>
        ) : null}
        {driveBinding ? (
          <button type="button" className="btn btn--ghost" onClick={() => setDrivePickOpen(true)}>
            {TODAYS_VIDEOS_FROM_DRIVE}
          </button>
        ) : null}
        <label className="btn btn--ghost" htmlFor="camera-play-device">
          {TODAYS_VIDEOS_FROM_DEVICE}
        </label>
        <OpenMyDrive />
      </div>
      <DriveMediaPicker open={drivePickOpen} kind="video" onClose={() => setDrivePickOpen(false)} onDone={(files) => void playDrive(files)} />
      <DeviceMediaInput id="camera-play-device" inputRef={deviceRef} accept={VIDEO_PICKER_ACCEPT} onFiles={playDevice} />
    </section>
  );
}
