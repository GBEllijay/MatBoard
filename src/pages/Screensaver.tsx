import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { FolderPhotoList } from '../components/FolderPhotoList';
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
  comparePhotos,
  DEFAULT_FOLDER_PLAY,
  DEFAULT_INTERVAL_SEC,
  DEFAULT_SHUFFLE,
  FOLDERS,
  folderExpandedState,
  getSaverPrefs,
  INTERVAL_PRESETS_SEC,
  isFolderId,
  listPhotos,
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  playablePhotos,
  removePhoto,
  renamePhoto,
  reorderPhotos,
  setFolderPlay,
  setSaverIntervalSec,
  setSaverShuffle,
  withFolderOrder,
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
  const [shuffle, setShuffle] = useState(DEFAULT_SHUFFLE);
  const [folderPlay, setFolderPlayState] = useState(DEFAULT_FOLDER_PLAY);
  const [expanded, setExpanded] = useState<Record<FolderId, boolean>>(() =>
    folderExpandedState('gallery'),
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const intervalMs = secondsToMs(intervalSec);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const folderParam = searchParams.get('folder');
  const requestedFolder = isFolderId(folderParam) ? folderParam : null;

  useEffect(() => {
    if (!requestedFolder) return;
    setExpanded(folderExpandedState(requestedFolder));
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
      setShuffle(prefs.shuffle);
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

  const persistFolderOrder = async (folderId: FolderId, orderedIds: string[]) => {
    setPhotos((rows) => withFolderOrder(rows, folderId, orderedIds));
    try {
      await reorderPhotos(folderId, orderedIds);
    } catch {
      await refresh();
    }
  };

  const commitShuffle = (next: boolean) => {
    setShuffle(next);
    void setSaverShuffle(next);
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
          Gold <strong>On</strong> means that folder plays on the TV. Gallery is the photo library;
          drag or use Up / Down to set the story. More folders can be added later.
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
        <label className="toggle">
          <input type="checkbox" checked={playing} onChange={(e) => setPlaying(e.target.checked)} />
          Playing
        </label>

        <div className="saver-folders">
          {FOLDERS.map((folder) => {
            const folderItems = photos
              .filter((photo) => photo.folderId === folder.id)
              .sort(comparePhotos);
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
                            await clearFolder(folder.id);
                            await refresh();
                            setOptions(true);
                          }}
                        >
                          Clear {folder.label}
                        </button>
                      ) : null}
                      <FolderPhotoList
                        folderLabel={folder.label}
                        photos={folderItems}
                        urlById={urlById}
                        onRename={async (id, label) => {
                          await renamePhoto(id, label);
                          setPhotos((rows) =>
                            rows.map((row) => (row.id === id ? { ...row, label } : row)),
                          );
                        }}
                        onRemove={async (id) => {
                          await removePhoto(id);
                          await refresh();
                        }}
                        onReorder={async (orderedIds) => persistFolderOrder(folder.id, orderedIds)}
                      />
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
