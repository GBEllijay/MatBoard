import { useEffect, useRef, useState } from 'react';
import { DeviceMediaInput } from './DeviceMediaInput';
import { MediaSourceSheet } from './VideoSourceSheet';
import {
  addClassPhotoPromotionFiles,
  CLASS_PHOTO_PROMOTIONS_ADD,
  CLASS_PHOTO_PROMOTIONS_FAILED,
  CLASS_PHOTO_PROMOTIONS_LABEL,
  CLASS_PHOTO_PROMOTIONS_LEAD,
  CLASS_PHOTO_PROMOTIONS_SAVED_DRIVE,
  CLASS_PHOTO_PROMOTIONS_SAVED_PHONE,
  CLASS_PHOTO_PROMOTIONS_SKIPPED,
  CLASS_PHOTO_PROMOTIONS_STAY,
  listClassPhotoPromotions,
  type ClassPhotoPromotionItem,
} from '../lib/classPhotoPromotions';
import {
  MEDIA_LIBRARY_ACCEPT,
  PHOTO_PICKER_ACCEPT,
  VIDEO_CAPTURE,
  VIDEO_RECORD_ACCEPT,
} from '../lib/mediaPicker';
import { quotaAddNote } from '../lib/storageQuota';

const PHOTO_CAPTURE_ID = 'class-photo-promotions-capture';
const VIDEO_RECORD_ID = 'class-photo-promotions-record';
const LIBRARY_ID = 'class-photo-promotions-library';

type Preview = {
  item: ClassPhotoPromotionItem;
  url: string;
};

/**
 * Bottom of Daily Lesson Plan on Coach Unlimited, under instructor distribution.
 * Take photo, Record, and Pick from gallery share the Gallery capture inputs.
 */
export function ClassPhotoPromotions({ dateKey, readOnly = false }: { dateKey: string; readOnly?: boolean }) {
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const videoRecordRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [revision, setRevision] = useState(0);
  const [previews, setPreviews] = useState<Preview[]>([]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    void listClassPhotoPromotions(dateKey)
      .then((rows) => {
        if (cancelled) return;
        setPreviews(
          rows.map((item) => {
            const url = URL.createObjectURL(item.blob);
            urls.push(url);
            return { item, url };
          }),
        );
      })
      .catch(() => {
        if (!cancelled) setPreviews([]);
      });
    return () => {
      cancelled = true;
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, [dateKey, revision]);

  const onFiles = async (files: readonly File[]) => {
    setOpen(false);
    if (!files.length || busy) return;
    setBusy(true);
    setNote('');
    try {
      const result = await addClassPhotoPromotionFiles(dateKey, files);
      setRevision((value) => value + 1);
      if (result.saved === 0) {
        setNote(result.skipped ? CLASS_PHOTO_PROMOTIONS_SKIPPED : '');
        return;
      }
      if (result.failed) setNote(CLASS_PHOTO_PROMOTIONS_FAILED);
      else if (result.needsDrive) setNote(CLASS_PHOTO_PROMOTIONS_SAVED_PHONE);
      else setNote(CLASS_PHOTO_PROMOTIONS_SAVED_DRIVE);
    } catch (error) {
      setNote(quotaAddNote(error) ?? 'Could not save that file on this phone. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="notes__distribute notes__class-photos" aria-label={CLASS_PHOTO_PROMOTIONS_LABEL}>
      <h2>{CLASS_PHOTO_PROMOTIONS_LABEL}</h2>
      {readOnly ? null : <p>{CLASS_PHOTO_PROMOTIONS_LEAD}</p>}
      {readOnly ? null : (
        <button
          type="button"
          className="btn notes__distribute-btn"
          disabled={busy}
          onClick={() => setOpen(true)}
        >
          {CLASS_PHOTO_PROMOTIONS_ADD}
        </button>
      )}
      {note ? (
        <p className="notes__distribute-note" role="status">
          {note}
        </p>
      ) : null}
      {previews.length ? (
        <ul className="notes__class-media" aria-label="Today's class photos and clips">
          {previews.map(({ item, url }) => (
            <li key={item.id}>
              {item.kind === 'video' ? (
                <video src={url} muted playsInline preload="metadata" aria-label={item.name} />
              ) : (
                <img src={url} alt={item.name} />
              )}
              <p>{item.name}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {readOnly ? null : (
      <>
      <MediaSourceSheet
        open={open}
        kind="photo-or-video"
        title={CLASS_PHOTO_PROMOTIONS_LABEL}
        captureInputId={PHOTO_CAPTURE_ID}
        recordInputId={VIDEO_RECORD_ID}
        libraryInputId={LIBRARY_ID}
        stay={CLASS_PHOTO_PROMOTIONS_STAY}
        onClose={() => setOpen(false)}
      />
      <DeviceMediaInput
        id={PHOTO_CAPTURE_ID}
        inputRef={photoCaptureRef}
        accept={PHOTO_PICKER_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id={VIDEO_RECORD_ID}
        inputRef={videoRecordRef}
        accept={VIDEO_RECORD_ACCEPT}
        capture={VIDEO_CAPTURE}
        onFiles={onFiles}
      />
      <DeviceMediaInput
        id={LIBRARY_ID}
        inputRef={libraryRef}
        accept={MEDIA_LIBRARY_ACCEPT}
        multiple
        onFiles={onFiles}
      />
      </>
      )}
    </aside>
  );
}
