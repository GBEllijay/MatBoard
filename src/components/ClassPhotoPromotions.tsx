import { useEffect, useRef, useState } from 'react';
import { DeviceMediaInput } from './DeviceMediaInput';
import { PlayingFromLine } from './PlayingFromLine';
import { MediaSourceSheet } from './VideoSourceSheet';
import {
  addClassPhotoPromotionFiles,
  CLASS_PHOTO_PROMOTIONS_ADD,
  CLASS_PHOTO_PROMOTIONS_LABEL,
  CLASS_PHOTO_PROMOTIONS_LEAD,
  CLASS_PHOTO_PROMOTIONS_SKIPPED,
  classPhotoResultNote,
  classPhotoStayCopy,
  listClassPhotoPromotions,
  type ClassPhotoPromotionItem,
} from '../lib/classPhotoPromotions';
import {
  MEDIA_LIBRARY_ACCEPT,
  PHOTO_PICKER_ACCEPT,
  VIDEO_CAPTURE,
  VIDEO_RECORD_ACCEPT,
} from '../lib/mediaPicker';
import { loadAdvantageCloudHome } from '../lib/advantageCloudMedia';
import { quotaAddNote } from '../lib/storageQuota';
import { readGalleryApprovalHere } from '../lib/galleryApprovalDefault';

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
  const [cloudOn, setCloudOn] = useState(false);
  const approvalRequired = readGalleryApprovalHere(typeof localStorage === 'undefined' ? null : localStorage).required;

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

  useEffect(() => {
    let cancel = false;
    void loadAdvantageCloudHome().then((view) => {
      if (!cancel) setCloudOn(view.phase === 'ready');
    });
    return () => {
      cancel = true;
    };
  }, []);

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
      setNote(
        classPhotoResultNote({
          cloud: result.cloud,
          lane: result.lane,
          failed: result.failed > 0 && result.uploaded === 0,
          needsDrive: result.needsDrive,
        }),
      );
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
      {readOnly ? null : <p>{classPhotoStayCopy(cloudOn, approvalRequired)}</p>}
      <PlayingFromLine />
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
        stay={classPhotoStayCopy(cloudOn, approvalRequired)}
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
