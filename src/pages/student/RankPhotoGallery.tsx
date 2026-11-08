import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';

const CAMERA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);

/** The first saved photo stays in front. Later photos peek behind it. No extra primary field. */
function stackFaces(photos: readonly string[]): string[] {
  return photos.slice(0, 3);
}

export function BeltPhotoSection({
  label,
  photos,
  addLabel,
  dataBelt,
  onAdd,
  onRemove,
  date,
  alert = '',
}: {
  label: string;
  photos: readonly string[];
  addLabel: string;
  dataBelt?: string;
  onAdd: (file: File | undefined) => void;
  onRemove: (index: number) => void;
  date: ReactNode;
  alert?: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const opener = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const pushed = useRef(false);
  const sawMarker = useRef(false);
  const galleryId = useId();
  const safeIndex = photos.length === 0 ? 0 : Math.min(index, photos.length - 1);
  const faces = stackFaces(photos);
  const stackLabel = photos.length === 1 ? `Open ${label} photos, 1 photo` : `Open ${label} photos, ${photos.length} photos`;

  const close = () => {
    setOpen(false);
    sawMarker.current = false;
    if (pushed.current) {
      pushed.current = false;
      navigate(-1);
    }
    window.setTimeout(() => opener.current?.focus(), 0);
  };

  const show = (at: number) => {
    setIndex(photos.length === 0 ? 0 : Math.max(0, Math.min(at, photos.length - 1)));
    setOpen(true);
    if (!pushed.current) {
      pushed.current = true;
      const state = location.state && typeof location.state === 'object' ? { ...(location.state as Record<string, unknown>) } : {};
      navigate(
        { pathname: location.pathname, search: location.search, hash: location.hash },
        { state: { ...state, rankGallery: galleryId } },
      );
    }
  };

  useEffect(() => {
    if (!open) return;
    const marker = location.state && typeof location.state === 'object' ? (location.state as { rankGallery?: string }).rankGallery : undefined;
    if (marker === galleryId) {
      sawMarker.current = true;
      return;
    }
    // Back removes the marker we pushed. Ignore the render before that push lands.
    if (sawMarker.current && pushed.current) {
      pushed.current = false;
      sawMarker.current = false;
      setOpen(false);
      window.setTimeout(() => opener.current?.focus(), 0);
    }
  }, [location.state, open, galleryId]);

  return (
    <>
      <div className="rung__foot">
        {date}
        <div className="rung__photo-tools">
          {faces.length ? (
            <button
              ref={opener}
              type="button"
              className={`rank-photo-stack rank-photo-stack--${faces.length}`}
              aria-haspopup="dialog"
              aria-expanded={open}
              aria-controls={open ? galleryId : undefined}
              aria-label={stackLabel}
              onClick={() => (open ? close() : show(0))}
            >
              <span className="rank-photo-stack__fan" aria-hidden="true">
                {faces
                  .map((face, photoIndex) => ({ face, photoIndex }))
                  .reverse()
                  .map(({ face, photoIndex }) => {
                    const place = photoIndex === 0 ? 'front' : photoIndex === 1 ? 'mid' : 'back';
                    return <img key={photoIndex} className={`rank-photo-stack__card rank-photo-stack__card--${place}`} src={face} alt="" />;
                  })}
              </span>
            </button>
          ) : null}
          <label className="photo">
            {CAMERA}
            Photo
            {photos.length ? <span className="n">{photos.length}</span> : null}
            <input
              className="student-file"
              type="file"
              accept="image/*"
              aria-label={addLabel}
              data-belt={dataBelt}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                onAdd(file);
              }}
            />
          </label>
        </div>
      </div>
      {alert ? (
        <p className="rank-photo-alert" role="alert">
          {alert}
        </p>
      ) : null}
      {photos.length ? (
        <div className="rank-photos">
          {photos.map((image, photoIndex) => (
            <figure key={`${image.slice(-24)}-${photoIndex}`}>
              <button type="button" className="rank-photos__open" aria-label={`Open ${label} photo ${photoIndex + 1}`} onClick={() => show(photoIndex)}>
                <img src={image} alt={`${label} photo ${photoIndex + 1}`} />
              </button>
              <button type="button" className="ink-btn ink-btn--small" aria-label={`Remove ${label} photo ${photoIndex + 1}`} onClick={() => onRemove(photoIndex)}>
                Remove
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      {open ? (
        <GalleryDialog
          id={galleryId}
          label={label}
          photos={photos}
          index={safeIndex}
          onIndex={setIndex}
          onClose={close}
          onRemove={onRemove}
        />
      ) : null}
    </>
  );
}

function GalleryDialog({
  id,
  label,
  photos,
  index,
  onIndex,
  onClose,
  onRemove,
}: {
  id: string;
  label: string;
  photos: readonly string[];
  index: number;
  onIndex: (index: number) => void;
  onClose: () => void;
  onRemove: (index: number) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const onIndexRef = useRef(onIndex);
  const indexRef = useRef(index);
  const photosRef = useRef(photos);
  onCloseRef.current = onClose;
  onIndexRef.current = onIndex;
  indexRef.current = index;
  photosRef.current = photos;
  const image = photos[index] ?? '';

  useEffect(() => {
    const panel = panelRef.current;
    const focusable = () =>
      [...(panel?.querySelectorAll<HTMLElement>('button, [href], input, [tabindex]:not([tabindex="-1"])') ?? [])].filter((node) => !node.hasAttribute('disabled'));
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      const list = photosRef.current;
      const current = indexRef.current;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (list.length > 0 && (event.key === 'ArrowRight' || event.key === 'ArrowLeft' || event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        if (event.key === 'Home') onIndexRef.current(0);
        else if (event.key === 'End') onIndexRef.current(list.length - 1);
        else if (event.key === 'ArrowRight') onIndexRef.current(Math.min(list.length - 1, current + 1));
        else onIndexRef.current(Math.max(0, current - 1));
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      const at = items.indexOf(document.activeElement as HTMLElement);
      const last = items.length - 1;
      if (event.shiftKey && at <= 0) {
        event.preventDefault();
        items[last]?.focus();
      } else if (!event.shiftKey && (at === last || at < 0)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return createPortal(
    <div className="rank-gallery" role="dialog" aria-modal="true" aria-label={`${label} gallery`}>
      <button type="button" className="rank-gallery__backdrop" aria-label={`Close ${label} gallery`} onClick={onClose} />
      <div ref={panelRef} id={id} className="rank-gallery__panel">
        <div className="rank-gallery__bar">
          <h2>{label}</h2>
          <button type="button" className="rank-gallery__close" onClick={onClose}>
            Close
          </button>
        </div>
        {photos.length === 0 || !image ? (
          <p className="rank-gallery__empty">No photos on this belt yet. Photo adds one.</p>
        ) : (
          <>
            <img className="rank-gallery__stage" src={image} alt={`${label} photo ${index + 1}`} />
            <p className="rank-gallery__count">
              Photo {index + 1} of {photos.length}
            </p>
            <div className="rank-gallery__strip" role="listbox" aria-label={`${label} photos`}>
              {photos.map((photo, photoIndex) => (
                <button
                  key={`${photo.slice(-24)}-${photoIndex}`}
                  type="button"
                  role="option"
                  aria-selected={photoIndex === index}
                  aria-label={`${label} photo ${photoIndex + 1}`}
                  className={photoIndex === index ? 'is-on' : ''}
                  onClick={() => onIndex(photoIndex)}
                >
                  <img src={photo} alt="" />
                </button>
              ))}
            </div>
            <button type="button" className="rank-gallery__remove" aria-label={`Remove ${label} photo ${index + 1} from gallery`} onClick={() => onRemove(index)}>
              Remove
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
