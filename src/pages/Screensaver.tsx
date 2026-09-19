import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { TvTip } from '../components/TvTip';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatMss, secondsToMs } from '../lib/format';
import {
  addPhotos,
  clearFolder,
  clampIntervalSec,
  DEFAULT_FOLDER_PLAY,
  DEFAULT_INTERVAL_SEC,
  FOLDERS,
  getSaverPrefs,
  INTERVAL_PRESETS_SEC,
  isFolderId,
  listPhotos,
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  playablePhotos,
  removePhoto,
  renamePhoto,
  setFolderPlay,
  setSaverIntervalSec,
  type FolderId,
  type StoredPhoto,
} from '../lib/photoStore';

export function ScreensaverPage() {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [urlById, setUrlById] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [shuffle, setShuffle] = useState(true);
  const [folderPlay, setFolderPlayState] = useState(DEFAULT_FOLDER_PLAY);
  const [expanded, setExpanded] = useState<Record<FolderId, boolean>>({
    gallery: true,
    videos: false,
    shop: false,
    events: false,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const intervalMs = secondsToMs(intervalSec);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get('folder');
  const requestedFolder = isFolderId(folderParam) ? folderParam : null;

  useEffect(() => {
    if (!requestedFolder) return;
    setExpanded({
      gallery: requestedFolder === 'gallery',
      videos: requestedFolder === 'videos',
      shop: requestedFolder === 'shop',
      events: requestedFolder === 'events',
    });
    setOptions(true);
  }, [requestedFolder]);

  const galleryPhotos = useMemo(
    () => photos.filter((photo) => photo.folderId === 'gallery'),
    [photos],
  );
  const queue = useMemo(() => playablePhotos(photos, folderPlay), [photos, folderPlay]);

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
    });
  }, []);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const photo of photos) {
      next[photo.id] = URL.createObjectURL(photo.blob);
    }
    setUrlById(next);
    setIndex(0);
    return () => Object.values(next).forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

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
    if (!playing || order.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % order.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, order.length, intervalMs]);

  const currentPhoto = queue[order[index] ?? 0];
  const current = currentPhoto ? urlById[currentPhoto.id] : undefined;

  const commitInterval = (next: number) => {
    const clamped = clampIntervalSec(next);
    setIntervalSec(clamped);
    void setSaverIntervalSec(clamped);
  };

  const commitFolderPlay = (folderId: FolderId, enabled: boolean) => {
    setFolderPlayState((prev) => ({ ...prev, [folderId]: enabled }));
    void setFolderPlay(folderId, enabled);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await addPhotos([...files], 'gallery');
    await refresh();
    setPlaying(true);
  };

  const exitSlideshow = () => {
    void fs.exit().finally(() => {
      navigate('/');
    });
  };

  const emptyCopy =
    galleryPhotos.length === 0
      ? 'Pick photos from this device. They loop fullscreen. On a computer plugged into the TV, press F for fullscreen. Set how long each slide stays on screen.'
      : 'Nothing is set to play. Turn on Gallery, or another folder that has media, in options.';

  return (
    <main
      className={`saver${current ? ' saver--play' : ''}${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .chrome, .saver__empty, .btn, input, label, .play-fs, .play-exit, .tv-tip')) return;
        if (queue.length) setOptions(true);
      }}
    >
      <Chrome ghost title={current ? '' : 'Owner’s Toolbox'} />
      {current ? <PlayExitMark onExit={exitSlideshow} /> : null}
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
      {current ? (
        <div
          key={current}
          className={`saver__frame${index % 2 ? ' saver__frame--alt' : ''}`}
        >
          <img className="saver__fill" src={current} alt="" aria-hidden="true" />
          <img className="saver__img" src={current} alt="" />
        </div>
      ) : (
        <div className="saver__empty" onClick={(e) => e.stopPropagation()}>
          <h1>Owner’s Toolbox</h1>
          <p>{emptyCopy}</p>
          {galleryPhotos.length === 0 ? (
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Choose photos
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={() => setOptions(true)}>
            Options
          </button>
        </div>
      )}

      <Sheet open={options} title="Owner’s Toolbox" onClose={() => setOptions(false)}>
        <p>
          Four folders. Gold <strong>On</strong> means that folder plays on the TV. Gallery is the
          photo library; the others are coming later.
        </p>
        <fieldset>
          <legend>Slide interval</legend>
          <div className="interval-stepper" role="group" aria-label="Slide interval">
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
          <div className="presets" role="group" aria-label="Slide interval presets">
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
        <label className="toggle">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} />
          Shuffle
        </label>
        <label className="toggle">
          <input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} />
          Playing
        </label>

        <div className="saver-folders">
          {FOLDERS.map((folder) => {
            const folderItems = photos.filter((photo) => photo.folderId === folder.id);
            return (
              <details
                key={folder.id}
                className="saver-folder"
                open={expanded[folder.id]}
                onToggle={(event) => {
                  const next = event.currentTarget.open;
                  setExpanded((prev) => (prev[folder.id] === next ? prev : { ...prev, [folder.id]: next }));
                }}
              >
                <summary className="saver-folder__summary">
                  <span className="saver-folder__title">
                    {folder.label}
                    {folder.ready ? null : <small>Coming soon</small>}
                  </span>
                  <button
                    type="button"
                    className={`preset saver-folder__play${folderPlay[folder.id] ? ' preset--on' : ''}`}
                    aria-pressed={folderPlay[folder.id]}
                    aria-label={`Play ${folder.label}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      commitFolderPlay(folder.id, !folderPlay[folder.id]);
                    }}
                  >
                    {folderPlay[folder.id] ? 'On' : 'Off'}
                  </button>
                </summary>
                <div className="saver-folder__panel">
                  {folder.ready ? (
                    <>
                      <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
                        Add photos
                      </button>
                      {folderItems.length ? (
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={async () => {
                            await clearFolder('gallery');
                            await refresh();
                            setOptions(true);
                          }}
                        >
                          Clear Gallery
                        </button>
                      ) : null}
                      {folderItems.length ? (
                        <ul className="saver__list">
                          {folderItems.map((photo, i) => (
                            <PhotoRow
                              key={photo.id}
                              photo={photo}
                              src={urlById[photo.id]}
                              fallback={`Photo ${i + 1}`}
                              onRename={async (label) => {
                                await renamePhoto(photo.id, label);
                                setPhotos((rows) =>
                                  rows.map((row) => (row.id === photo.id ? { ...row, label } : row)),
                                );
                              }}
                              onRemove={async () => {
                                await removePhoto(photo.id);
                                await refresh();
                              }}
                            />
                          ))}
                        </ul>
                      ) : (
                        <p className="saver-folder__empty">
                          No photos yet. Add kids, promotions, or gym photos. Each row keeps a
                          thumbnail next to the name.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="saver-folder__empty">{folder.comingSoon}</p>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </Sheet>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
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

function PhotoRow({
  photo,
  src,
  fallback,
  onRename,
  onRemove,
}: {
  photo: StoredPhoto;
  src?: string;
  fallback: string;
  onRename: (label: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [label, setLabel] = useState(photo.label);
  const [thumbFailed, setThumbFailed] = useState(false);
  useEffect(() => {
    setLabel(photo.label);
  }, [photo.label]);
  useEffect(() => {
    setThumbFailed(false);
  }, [src]);

  return (
    <li>
      <span className="saver__thumb" aria-hidden="true">
        {src && !thumbFailed ? (
          <img
            src={src}
            alt=""
            draggable={false}
            onError={() => setThumbFailed(true)}
          />
        ) : null}
      </span>
      <input
        value={label}
        placeholder={fallback}
        aria-label={`Label for ${fallback}`}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => {
          if (label !== photo.label) void onRename(label);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
      />
      <button type="button" className="btn btn--ghost" onClick={() => void onRemove()}>
        Remove
      </button>
    </li>
  );
}
