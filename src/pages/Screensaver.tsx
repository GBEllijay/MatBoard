import { useEffect, useMemo, useRef, useState } from 'react';
import { Chrome } from '../components/Chrome';
import { Sheet } from '../components/Sheet';
import { useWakeLock } from '../hooks/useWakeLock';
import { addPhotos, clearPhotos, listPhotos, removePhoto, type StoredPhoto } from '../lib/photoStore';

const INTERVAL_MS = 9000;
const OPTIONS = [8000, 9000, 10000] as const;

export function ScreensaverPage() {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [options, setOptions] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [intervalMs, setIntervalMs] = useState(INTERVAL_MS);
  const [shuffle, setShuffle] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useWakeLock(playing && photos.length > 0);

  const refresh = async () => {
    const rows = await listPhotos();
    setPhotos(rows);
  };

  useEffect(() => {
    void refresh();
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

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    await addPhotos([...files]);
    await refresh();
    setPlaying(true);
  };

  return (
    <main
      className="saver"
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .chrome, .saver__empty, .btn, input, label')) return;
        if (photos.length) setOptions(true);
      }}
    >
      <Chrome ghost title="Screensaver" />
      {current ? (
        <img
          className="saver__img"
          src={current}
          alt=""
          style={{ animationDuration: `${intervalMs}ms` }}
        />
      ) : (
        <div className="saver__empty" onClick={(e) => e.stopPropagation()}>
          <h1>Screensaver</h1>
          <p>Pick photos from this device. They loop fullscreen every 8–10 seconds. This mode never auto-starts from Match or Training.</p>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            Choose photos
          </button>
        </div>
      )}

      <Sheet open={options} title="Screensaver options" onClose={() => setOptions(false)}>
        <p>Manual home card only — Match and Training never time out into this loop.</p>
        <div className="presets">
          {OPTIONS.map((ms) => (
            <button
              key={ms}
              type="button"
              className={`preset${intervalMs === ms ? ' preset--on' : ''}`}
              onClick={() => setIntervalMs(ms)}
            >
              {ms / 1000}s
            </button>
          ))}
        </div>
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
              <li key={photo.id}>
                <span>Photo {i + 1}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={async () => {
                    await removePhoto(photo.id);
                    await refresh();
                  }}
                >
                  Remove
                </button>
              </li>
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
