import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { GymLogoControl } from '../components/GymLogoControl';
import { DeviceMediaInput } from '../components/DeviceMediaInput';
import { ToolboxFolder } from '../components/ToolboxFolder';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { TvTip } from '../components/TvTip';
import { Sheet } from '../components/Sheet';
import { MediaSourceSheet } from '../components/VideoSourceSheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useToolboxParent } from '../hooks/useToolboxParent';
import { MEDIA_CONSOLE_INSTRUCTIONS, MEDIA_CONSOLE_NAME } from '../lib/productNames';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatMss, secondsToMs } from '../lib/format';
import {
  PHOTO_PICKER_ACCEPT,
  VIDEO_CAPTURE,
  VIDEO_PICKER_ACCEPT,
  VIDEO_RECORD_ACCEPT,
  type MediaSourceKind,
} from '../lib/mediaPicker';
import {
  addFolderFiles,
  clearFolder,
  clampIntervalSec,
  DEFAULT_FOLDER_PLAY,
  DEFAULT_INTERVAL_SEC,
  DEFAULT_MUTE_VIDEO,
  DEFAULT_SHUFFLE,
  FOLDERS,
  folderById,
  folderExpandedState,
  getSaverPrefs,
  INTERVAL_PRESETS_SEC,
  isFolderId,
  isVideoItem,
  listPhotos,
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  playableItems,
  removePhoto,
  renamePhoto,
  reorderFolderItems,
  setFolderPlay,
  setItemPlay,
  setSaverIntervalSec,
  setSaverMuteVideo,
  setSaverShuffle,
  withFolderOrder,
  type FolderId,
  type StoredPhoto,
} from '../lib/photoStore';
import { itemsInFolder } from '../lib/playlist';

export function ScreensaverPage() {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [shuffle, setShuffle] = useState(DEFAULT_SHUFFLE);
  const [muteVideo, setMuteVideo] = useState(DEFAULT_MUTE_VIDEO);
  const [pickerNote, setPickerNote] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<MediaSourceKind>('photo');
  const [unlockSound, setUnlockSound] = useState(false);
  const [folderPlay, setFolderPlayState] = useState(DEFAULT_FOLDER_PLAY);
  const [expanded, setExpanded] = useState<Record<FolderId, boolean>>(() =>
    folderExpandedState('gallery'),
  );
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const photoLibraryRef = useRef<HTMLInputElement>(null);
  const videoRecordRef = useRef<HTMLInputElement>(null);
  const videoLibraryRef = useRef<HTMLInputElement>(null);
  const addFolderRef = useRef<FolderId>('gallery');
  const intervalMs = secondsToMs(intervalSec);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const parent = useToolboxParent();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get('folder');
  const requestedFolder =
    folderParam === 'videos' ? 'gallery' : isFolderId(folderParam) ? folderParam : null;

  useEffect(() => {
    if (!requestedFolder) return;
    setExpanded(folderExpandedState(requestedFolder));
    setOptions(true);
    addFolderRef.current = requestedFolder;
  }, [requestedFolder]);

  const focusFolder = requestedFolder ?? 'gallery';
  const focusConfig = folderById(focusFolder);
  const queue = useMemo(() => playableItems(photos, folderPlay), [photos, folderPlay]);

  useVisibleViewportHeight();
  useWakeLock(playing && queue.length > 0);

  const refresh = async () => {
    const rows = await listPhotos();
    setPhotos(rows);
  };

  useEffect(() => {
    void refresh();
    void getSaverPrefs().then((prefs) => {
      setIntervalSec(prefs.intervalSec);
      setFolderPlayState(prefs.folderPlay);
      setShuffle(prefs.shuffle);
      setMuteVideo(prefs.muteVideo);
    });
  }, []);

  const photosRef = useRef(photos);
  photosRef.current = photos;
  const photoIdsKey = photos.map((photo) => photo.id).join('|');

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const photo of photosRef.current) {
      next[photo.id] = URL.createObjectURL(photo.blob);
    }
    setUrlById(next);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [photoIdsKey]);

  useEffect(() => {
    setIndex(0);
  }, [folderPlay, shuffle]);

  const order = useMemo(() => {
    const ids = queue.map((_, i) => i);
    if (!shuffle) return ids;
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }, [queue, shuffle]);

  useEffect(() => {
    setIndex((n) => (order.length === 0 ? 0 : n % order.length));
  }, [order.length]);

  const currentPhoto = queue[order[index] ?? 0];
  const current = currentPhoto ? urlById[currentPhoto.id] : undefined;
  const currentIsVideo = Boolean(currentPhoto && isVideoItem(currentPhoto));

  const advance = useCallback(() => {
    setIndex((n) => (order.length === 0 ? 0 : (n + 1) % order.length));
  }, [order.length]);

  useEffect(() => {
    if (!playing || !currentPhoto || currentIsVideo) return;
    if (order.length <= 1) return;
    const id = window.setTimeout(advance, intervalMs);
    return () => window.clearTimeout(id);
  }, [playing, currentPhoto, currentIsVideo, order.length, intervalMs, advance, index]);

  const commitInterval = (next: number) => {
    const clamped = clampIntervalSec(next);
    setIntervalSec(clamped);
    void setSaverIntervalSec(clamped);
  };

  const commitFolderPlay = (folderId: FolderId, enabled: boolean) => {
    setFolderPlayState((prev) => ({ ...prev, [folderId]: enabled }));
    void setFolderPlay(folderId, enabled);
  };

  const persistFolderOrder = async (folderId: FolderId, orderedIds: string[]) => {
    setPhotos((rows) => withFolderOrder(rows, folderId, orderedIds));
    try {
      await reorderFolderItems(folderId, orderedIds);
    } catch {
      await refresh();
    }
  };

  const commitShuffle = (next: boolean) => {
    setShuffle(next);
    void setSaverShuffle(next);
  };

  const commitMuteVideo = (next: boolean) => {
    setMuteVideo(next);
    void setSaverMuteVideo(next);
    if (!next) setUnlockSound(true);
  };

  const openAdd = (folderId: FolderId, kind: MediaSourceKind) => {
    addFolderRef.current = folderId;
    setAddKind(kind);
    setAddOpen(true);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const kind = addKind;
    setAddOpen(false);
    const added = await addFolderFiles([...files], addFolderRef.current);
    setPickerNote(
      added
        ? ''
        : kind === 'video'
          ? 'That file cannot play here. Switch the camera to video, or pick an MP4 / WebM.'
          : 'That file is not an image this folder can keep.',
    );
    await refresh();
    if (added) setPlaying(true);
  };

  const exitSlideshow = () => {
    void fs.exit().finally(() => {
      navigate(parent.path);
    });
  };

  const hubTitle = MEDIA_CONSOLE_NAME;

  const focusEmpty = itemsInFolder(photos, focusFolder).length === 0;
  const emptyCopy =
    photos.length === 0
      ? 'Add photos opens Take photo or Pick from gallery. Add videos opens Record or Pick from gallery. They stay on this phone or computer — nothing is uploaded. Photos loop fullscreen; clips play through, muted by default. Press F for fullscreen on a computer plugged into the TV.'
      : 'Nothing is set to play. Turn on Gallery in options, then tap a left preview so at least one photo or video is On.';

  return (
    <main
      className={`saver${current ? ' saver--play' : ''}${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .chrome, .saver__empty, .btn, input, label, .play-fs, .play-exit, .tv-tip, .saver__unmute')) return;
        if (!muteVideo) setUnlockSound(true);
        if (queue.length) setOptions(true);
      }}
    >
      <Chrome ghost />
      <PlayExitMark to={parent.path} onExit={exitSlideshow} />
      <div className="play-fs-slot">
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          shortcut={fs.tvStation}
          onToggle={() => void fs.toggle()}
        />
      </div>
      <TvTip onFullscreen={() => void fs.enter()} />
      {current && currentPhoto ? (
        <SaverSlide
          key={currentPhoto.id}
          item={currentPhoto}
          src={current}
          altFrame={index % 2 === 1}
          playing={playing}
          loop={order.length <= 1}
          muted={muteVideo}
          unlockSound={unlockSound}
          onEnded={advance}
        />
      ) : (
        <div className="saver__empty" onClick={(e) => e.stopPropagation()}>
          <h1>{hubTitle}</h1>
          <p>{emptyCopy}</p>
          {focusConfig.ready && focusEmpty ? (
            <>
              <button type="button" className="btn" onClick={() => openAdd(focusFolder, 'photo')}>
                {focusConfig.addLabel}
              </button>
              {focusConfig.videoAddLabel ? (
                <button type="button" className="btn" onClick={() => openAdd(focusFolder, 'video')}>
                  {focusConfig.videoAddLabel}
                </button>
              ) : null}
            </>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={() => setOptions(true)}>
            Options
          </button>
        </div>
      )}

      <Sheet
        open={options}
        title={hubTitle}
        onClose={() => {
          if (!muteVideo) setUnlockSound(true);
          setOptions(false);
        }}
      >
        <GymLogoControl />
        <section className="saver-settings">
          <h3 className="saver-settings__title">Settings</h3>
          {pickerNote ? <p className="saver-folder__empty">{pickerNote}</p> : null}
        <fieldset>
          <legend>Photo interval</legend>
          <div className="interval-stepper" role="group" aria-label="Photo interval">
            <button
              type="button"
              className="clock-nudge"
              disabled={intervalSec <= MIN_INTERVAL_SEC}
              aria-label="Subtract one second"
              onClick={() => commitInterval(intervalSec - 1)}
            >
              −
            </button>
            <strong aria-live="polite">{formatMss(intervalSec)}</strong>
            <button
              type="button"
              className="clock-nudge"
              disabled={intervalSec >= MAX_INTERVAL_SEC}
              aria-label="Add one second"
              onClick={() => commitInterval(intervalSec + 1)}
            >
              +
            </button>
          </div>
          <div className="presets" role="group" aria-label="Photo interval presets">
            {INTERVAL_PRESETS_SEC.map((seconds) => (
              <button
                key={seconds}
                type="button"
                className={`preset${intervalSec === seconds ? ' preset--on' : ''}`}
                onClick={() => commitInterval(seconds)}
              >
                {seconds === 60 ? '1:00' : `${seconds}s`}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Play order</legend>
          <div className="presets presets--split" role="radiogroup" aria-label="Play order">
            <button
              type="button"
              role="radio"
              aria-checked={!shuffle}
              className={`preset${!shuffle ? ' preset--on' : ''}`}
              onClick={() => commitShuffle(false)}
            >
              In order
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={shuffle}
              className={`preset${shuffle ? ' preset--on' : ''}`}
              onClick={() => commitShuffle(true)}
            >
              Shuffle
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Video sound</legend>
          <p className="saver-sound-hint">
            Mute clips so gym-floor music keeps playing. Match and Training buzzers still cut
            through — they are separate from clip audio.
          </p>
          <div className="presets presets--split" role="radiogroup" aria-label="Video sound">
            <button
              type="button"
              role="radio"
              aria-checked={muteVideo}
              className={`preset${muteVideo ? ' preset--on' : ''}`}
              onClick={() => commitMuteVideo(true)}
            >
              Mute clips
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={!muteVideo}
              className={`preset${!muteVideo ? ' preset--on' : ''}`}
              onClick={() => commitMuteVideo(false)}
            >
              Play video sound
            </button>
          </div>
        </fieldset>
        <label className="toggle">
          <input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} />
          Playing
        </label>
        </section>

        <div className="saver-folders">
          {FOLDERS.map((folder) => (
            <ToolboxFolder
              key={folder.id}
              folder={folder}
              open={expanded[folder.id]}
              playEnabled={folderPlay[folder.id]}
              items={itemsInFolder(photos, folder.id)}
              thumbById={urlById}
              onToggle={(next) => {
                setExpanded((prev) => (prev[folder.id] === next ? prev : { ...prev, [folder.id]: next }));
              }}
              onPlayToggle={commitFolderPlay}
              onAdd={folder.ready ? () => openAdd(folder.id, 'photo') : undefined}
              onAddVideo={
                folder.ready && folder.videoAddLabel ? () => openAdd(folder.id, 'video') : undefined
              }
              onClear={
                folder.ready
                  ? async () => {
                      await clearFolder(folder.id);
                      await refresh();
                      setOptions(true);
                    }
                  : undefined
              }
              onRename={async (id, label) => {
                await renamePhoto(id, label);
                setPhotos((rows) => rows.map((row) => (row.id === id ? { ...row, label } : row)));
              }}
              onRemove={async (id) => {
                await removePhoto(id);
                await refresh();
              }}
              onItemPlayToggle={async (id, enabled) => {
                setPhotos((rows) =>
                  rows.map((row) => (row.id === id ? { ...row, playEnabled: enabled } : row)),
                );
                try {
                  await setItemPlay(id, enabled);
                } catch {
                  await refresh();
                }
              }}
              onReorder={async (orderedIds) => persistFolderOrder(folder.id, orderedIds)}
            />
          ))}
        </div>
        <section className="saver-instructions">
          <p className="saver-instructions__label">Instructions:</p>
          <ul>
            {MEDIA_CONSOLE_INSTRUCTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      </Sheet>

      <MediaSourceSheet
        open={addOpen}
        kind={addKind}
        title={addKind === 'video' ? 'Add videos' : folderById(addFolderRef.current).addLabel}
        captureInputId={addKind === 'video' ? 'saver-video-record' : 'saver-photo-capture'}
        libraryInputId={addKind === 'video' ? 'saver-video-library' : 'saver-photo-library'}
        stacked={options}
        onClose={() => setAddOpen(false)}
      />
      <DeviceMediaInput
        id="saver-photo-capture"
        inputRef={photoCaptureRef}
        accept={PHOTO_PICKER_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="saver-photo-library"
        inputRef={photoLibraryRef}
        accept={PHOTO_PICKER_ACCEPT}
        multiple
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="saver-video-record"
        inputRef={videoRecordRef}
        accept={VIDEO_RECORD_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id="saver-video-library"
        inputRef={videoLibraryRef}
        accept={VIDEO_PICKER_ACCEPT}
        multiple
        onFiles={onFiles}
      />
    </main>
  );
}

function SaverSlide({
  item,
  src,
  altFrame,
  playing,
  loop,
  muted,
  unlockSound,
  onEnded,
}: {
  item: StoredPhoto;
  src: string;
  altFrame: boolean;
  playing: boolean;
  loop: boolean;
  muted: boolean;
  unlockSound: boolean;
  onEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const video = isVideoItem(item);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    el.loop = loop;
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
          if (!cancelled && !loop) onEnded();
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      el.pause();
    };
  }, [playing, src, video, loop, onEnded, muted, unlockSound]);

  if (video) {
    return (
      <div className="saver__frame saver__frame--video">
        <video
          ref={videoRef}
          className="saver__video"
          src={src}
          muted={muted}
          playsInline
          autoPlay
          loop={loop}
          disableRemotePlayback
          onEnded={() => {
            if (!loop) onEnded();
          }}
          onError={() => {
            if (!loop) onEnded();
          }}
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

  return (
    <div className={`saver__frame${altFrame ? ' saver__frame--alt' : ''}`}>
      <img className="saver__fill" src={src} alt="" aria-hidden="true" />
      <img className="saver__img" src={src} alt="" />
    </div>
  );
}
