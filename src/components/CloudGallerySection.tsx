import { useEffect, useRef, useState } from 'react';
import { CLOUD_MEDIA_EVENT } from '../lib/advantageCloudMedia';
import { advantageCloudLaneStore, listApprovedCloudMedia } from '../lib/advantageCloudLanes';
import type { ApprovalItem, ApprovalLaneStore } from '../lib/approvalLanes';

/** Seconds a photo stays up when the Cloud gallery plays as a slideshow. */
export const CLOUD_SLIDE_PHOTO_SEC = 8;
/** Photo thumbnails fetched up front. The rest load when the slideshow reaches them. */
const THUMB_LIMIT = 24;

export const CLOUD_GALLERY_TITLE = 'Advantage Cloud';
export const CLOUD_GALLERY_EMPTY = 'No approved photos or videos in Advantage Cloud yet.';
export const CLOUD_GALLERY_HINT =
  'Approved class photos and daily videos saved in Advantage Cloud. They show on any signed-in phone or TV, not only this one.';

type Props = {
  /** Tests pass a fake list and store. The page uses the signed-in Cloud. */
  load?: typeof listApprovedCloudMedia;
  store?: ApprovalLaneStore;
};

/**
 * Approved Advantage Cloud media on the Gallery page (/slideshow?folder=gallery,
 * which Media Edition's Gallery link opens). Pending and rejected files never
 * reach this list: the server filters them. Renders nothing when this device
 * is not on Advantage Cloud.
 */
export function CloudGallerySection({ load = listApprovedCloudMedia, store }: Props) {
  const storeRef = useRef<ApprovalLaneStore>(store ?? advantageCloudLaneStore());
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [playing, setPlaying] = useState<number | null>(null);
  const [slideUrl, setSlideUrl] = useState<string>('');
  const [slideNote, setSlideNote] = useState('');
  const urls = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const result = await load();
      if (cancelled) return;
      if (result === null) {
        setHidden(true);
        return;
      }
      setHidden(false);
      if (!Array.isArray(result)) {
        setError(result.error);
        setItems([]);
        return;
      }
      setError('');
      setItems(result);
    };
    void run();
    const onCloud = () => void run();
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    return () => {
      cancelled = true;
      window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
    };
  }, [load]);

  useEffect(() => {
    if (!items?.length) return;
    let cancelled = false;
    const photos = items.filter((item) => item.kind === 'photo' && !thumbs[item.path]).slice(0, THUMB_LIMIT);
    void (async () => {
      for (const item of photos) {
        const blob = await storeRef.current.open(item);
        if (cancelled || !blob) continue;
        const url = URL.createObjectURL(blob);
        urls.current.push(url);
        setThumbs((current) => ({ ...current, [item.path]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // Thumbnails load once per list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  const current = playing !== null && items ? items[playing] ?? null : null;

  useEffect(() => {
    if (!current) {
      setSlideUrl('');
      return;
    }
    let cancelled = false;
    setSlideNote('');
    const ready = thumbs[current.path];
    if (ready) {
      setSlideUrl(ready);
      return;
    }
    setSlideUrl('');
    void storeRef.current.open(current).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setSlideNote('That file could not be opened from Advantage Cloud.');
        return;
      }
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setSlideUrl(url);
    });
    return () => {
      cancelled = true;
    };
    // Re-open only when the slide changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path]);

  const advance = () => {
    if (!items?.length || playing === null) return;
    setPlaying((playing + 1) % items.length);
  };

  useEffect(() => {
    if (!current || current.kind !== 'photo' || !slideUrl) return;
    const timer = setTimeout(advance, CLOUD_SLIDE_PHOTO_SEC * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path, slideUrl]);

  if (hidden) return null;

  const photos = items?.filter((item) => item.source === 'gallery') ?? [];
  const videos = items?.filter((item) => item.source === 'daily-video') ?? [];
  const indexOf = (item: ApprovalItem) => items?.indexOf(item) ?? 0;

  const tile = (item: ApprovalItem) => (
    <li key={`${item.source}:${item.path}`} className="cloud-gallery__tile" data-cloud-gallery-item={item.path} data-cloud-source={item.source}>
      <button type="button" className="cloud-gallery__open" onClick={() => setPlaying(indexOf(item))} aria-label={`Play ${item.name}`}>
        {item.kind === 'photo' && thumbs[item.path] ? (
          <img src={thumbs[item.path]} alt={item.name} loading="lazy" />
        ) : (
          <span className="cloud-gallery__glyph" aria-hidden="true">
            {item.kind === 'video' ? '▶' : '▢'}
          </span>
        )}
        <span className="cloud-gallery__name">{item.name}</span>
        <span className="cloud-gallery__date">{item.dateKey}</span>
      </button>
    </li>
  );

  return (
    <section className="cloud-gallery" aria-label={CLOUD_GALLERY_TITLE} data-cloud-gallery="">
      <h2>{CLOUD_GALLERY_TITLE}</h2>
      <p className="cloud-gallery__hint">{CLOUD_GALLERY_HINT}</p>
      {items === null ? <p role="status">Checking Advantage Cloud…</p> : null}
      {error ? (
        <p role="alert" className="cloud-gallery__error" data-cloud-gallery-error="">
          {error}
        </p>
      ) : null}
      {items && !error && items.length === 0 ? <p data-cloud-gallery-empty="">{CLOUD_GALLERY_EMPTY}</p> : null}
      {items && items.length ? (
        <button type="button" className="btn" data-cloud-gallery-play="" onClick={() => setPlaying(0)}>
          Play Advantage Cloud slideshow ({items.length})
        </button>
      ) : null}
      {photos.length ? (
        <>
          <h3>Class photos and clips ({photos.length})</h3>
          <ul className="cloud-gallery__grid" aria-label="Approved class photos and clips">
            {photos.map(tile)}
          </ul>
        </>
      ) : null}
      {videos.length ? (
        <>
          <h3>Daily videos ({videos.length})</h3>
          <ul className="cloud-gallery__grid" aria-label="Approved daily videos">
            {videos.map(tile)}
          </ul>
        </>
      ) : null}
      {current ? (
        <div className="cloud-gallery__player" role="dialog" aria-label="Advantage Cloud slideshow" data-cloud-slide={current.path}>
          {slideUrl ? (
            current.kind === 'photo' ? (
              <img src={slideUrl} alt={current.name} />
            ) : (
              <video src={slideUrl} autoPlay controls playsInline onEnded={advance} />
            )
          ) : (
            <p role="status">{slideNote || 'Opening from Advantage Cloud…'}</p>
          )}
          <div className="cloud-gallery__controls">
            <button type="button" className="btn btn--ghost" onClick={() => setPlaying(((playing ?? 0) - 1 + (items?.length ?? 1)) % (items?.length ?? 1))}>
              Previous
            </button>
            <span>
              {(playing ?? 0) + 1} of {items?.length ?? 0} · {current.name}
            </span>
            <button type="button" className="btn btn--ghost" onClick={advance}>
              Next
            </button>
            <button type="button" className="btn" onClick={() => setPlaying(null)}>
              Close
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
