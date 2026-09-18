import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { Sheet } from '../components/Sheet';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { formatMss, secondsToMs } from '../lib/format';
import {
  addPhotos,
  clearPhotos,
  clampIntervalSec,
  DEFAULT_INTERVAL_SEC,
  getSaverPrefs,
  INTERVAL_PRESETS_SEC,
  listPhotos,
  MAX_INTERVAL_SEC,
  MIN_INTERVAL_SEC,
  removePhoto,
  renamePhoto,
  setSaverIntervalSec,
  type StoredPhoto,
} from '../lib/photoStore';

export function ScreensaverPage() {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [intervalSec, setIntervalSec] = useState(DEFAULT_INTERVAL_SEC);
  const [shuffle, setShuffle] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const intervalMs = secondsToMs(intervalSec);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();

  useVisibleViewportHeight();
  useWakeLock(playing && photos.length > 0);

  const refresh = async () => {
    const rows = await listPhotos();
    setPhotos(rows);
  };

  useEffect(() => {
    void refresh();
    void getSaverPrefs().then((prefs) => setIntervalSec(prefs.intervalSec));
  }, []);

  useEffect(() => {
    const next = photos.map((photo) => URL.createObjectURL(photo.blob));
    setUrls(next);
    setIndex(0);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [photos]);

  const order = useMemo(() => {
    const ids = photos.map((_, i) => i);
    if (!shuffle) return ids;
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }, [photos, shuffle]);

  useEffect(() => {
    if (!playing || order.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((n) => (n + 1) % order.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, order.length, intervalMs]);

  const current = urls[order[index] ?? 0];

  const commitInterval = (next: number) => {
    const clamped = clampIntervalSec(next);
    setIntervalSec(clamped);
    void setSaverIntervalSec(clamped);
  };

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await addPhotos([...files]);
    await refresh();
    setPlaying(true);
  };

  const exitSlideshow = () => {
    void fs.exit().finally(() => {
      navigate('/');
    });
  };

  return (
    <main
      className={`saver${current ? ' saver--play' : ''}${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .chrome, .saver__empty, .btn, input, label, .play-fs, .play-exit')) return;
        if (photos.length) setOptions(true);
      }}
    >
      <Chrome ghost title={current ? '' : 'Slideshow'} />
      {current ? <PlayExitMark onExit={exitSlideshow} /> : null}
      <div className="play-fs-slot">
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          onToggle={() => void fs.toggle()}
        />
      </div>
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
          <h1>Slideshow</h1>
          <p>Pick photos from this device. They loop fullscreen. Set how long each slide stays on screen.</p>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Choose photos
          </button>
        </div>
      )}

      <Sheet open={options} title="Slideshow options" onClose={() => setOptions(false)}>
        <p>Choose photos, names, and how long each slide stays on screen.</p>
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
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Add photos
        </button>
        {photos.length ? (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => {
              await clearPhotos();
              await refresh();
              setOptions(true);
            }}
          >
            Clear all
          </button>
        ) : null}
        {photos.length ? (
          <ul className="saver__list">
            {photos.map((photo, i) => (
              <PhotoRow
                key={photo.id}
                photo={photo}
                fallback={`Photo ${i + 1}`}
                onRename={async (label) => {
                  await renamePhoto(photo.id, label);
                  setPhotos((rows) => rows.map((row) => (row.id === photo.id ? { ...row, label } : row)));
                }}
                onRemove={async () => {
                  await removePhoto(photo.id);
                  await refresh();
                }}
              />
            ))}
          </ul>
        ) : null}
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
  fallback,
  onRename,
  onRemove,
}: {
  photo: StoredPhoto;
  fallback: string;
  onRename: (label: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const [label, setLabel] = useState(photo.label);
  useEffect(() => {
    setLabel(photo.label);
  }, [photo.label]);

  return (
    <li>
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
