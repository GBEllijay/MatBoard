import { useEffect, useId, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  addPodiumPhoto,
  podiumPhotoError,
  podiumPhotoFromFile,
  podiumPhotos,
  removePodiumPhoto,
  subscribePodiumPhotos,
} from '../../lib/podiumPhotos';
import { GalleryDialog } from './RankPhotoGallery';

const CAMERA = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-2h5.6L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.4" />
  </svg>
);

/** First saved podium photo is the front card. Same stack as a belt. */
function stackFaces(photos: readonly string[]): string[] {
  return photos.slice(0, 3);
}

export function PodiumPhotoRow({
  studentId,
  resultId,
  label,
}: {
  studentId: string;
  resultId: string;
  label: string;
}) {
  const [photos, setPhotos] = useState(() => podiumPhotos(studentId, resultId));
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const opener = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const pushed = useRef(false);
  const sawMarker = useRef(false);
  const galleryId = useId();
  const faces = stackFaces(photos);
  const safeIndex = photos.length === 0 ? 0 : Math.min(index, photos.length - 1);
  const stackLabel = photos.length === 1 ? `Open ${label} podium photos, 1 photo` : `Open ${label} podium photos, ${photos.length} photos`;

  useEffect(() => subscribePodiumPhotos(() => setPhotos(podiumPhotos(studentId, resultId))), [studentId, resultId]);

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
      navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { state: { ...state, rankGallery: galleryId } });
    }
  };

  useEffect(() => {
    if (!open) return;
    const marker = location.state && typeof location.state === 'object' ? (location.state as { rankGallery?: string }).rankGallery : undefined;
    if (marker === galleryId) {
      sawMarker.current = true;
      return;
    }
    if (sawMarker.current && pushed.current) {
      pushed.current = false;
      sawMarker.current = false;
      setOpen(false);
      window.setTimeout(() => opener.current?.focus(), 0);
    }
  }, [location.state, open, galleryId]);

  return (
    <div className="podium-photos" data-result={resultId}>
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
          aria-label={`Add podium photo for ${label}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            void podiumPhotoFromFile(file)
              .then((image) => {
                addPodiumPhoto(studentId, resultId, image);
                setError('');
              })
              .catch((err: unknown) => {
                setError(podiumPhotoError(err));
              });
          }}
        />
      </label>
      {photos.length ? (
        <div className="rank-photos">
          {photos.map((image, photoIndex) => (
            <figure key={`${image.slice(-24)}-${photoIndex}`}>
              <button type="button" className="rank-photos__open" aria-label={`Open ${label} podium photo ${photoIndex + 1}`} onClick={() => show(photoIndex)}>
                <img src={image} alt={`${label} podium photo ${photoIndex + 1}`} />
              </button>
              <button
                type="button"
                className="ink-btn ink-btn--small"
                aria-label={`Remove ${label} podium photo ${photoIndex + 1}`}
                onClick={() => {
                  removePodiumPhoto(studentId, resultId, photoIndex);
                  setError('');
                }}
              >
                Remove
              </button>
            </figure>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {open ? (
        <GalleryDialog
          id={galleryId}
          label={`${label} podium`}
          photos={photos}
          index={safeIndex}
          onIndex={setIndex}
          onClose={close}
          onRemove={(photoIndex) => removePodiumPhoto(studentId, resultId, photoIndex)}
          emptyNote="No podium photos yet. Photo adds one."
        />
      ) : null}
    </div>
  );
}
