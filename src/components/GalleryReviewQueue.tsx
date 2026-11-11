import { useEffect, useState } from 'react';
import { useCurrentSeat } from './SeatSessionBar';
import { CLOUD_MEDIA_EVENT, galleryDecisionAllowed, notifyCloudMedia } from '../lib/advantageCloudMedia';
import {
  APPROVAL_WAITING,
  canApproveGallery,
} from '../lib/galleryApproval';
import { readGalleryApprovalHere } from '../lib/galleryApprovalDefault';
import {
  classPhotoLane,
  listPendingClassPhotos,
  setClassPhotoLane,
  type ClassPhotoPromotionItem,
} from '../lib/classPhotoPromotions';
import { decideCloudGallery, listCloudGallery, type CloudGalleryFile } from '../lib/galleryCloud';
import { publishGymFile } from '../lib/gymPublish';
import { addFolderFiles } from '../lib/photoStore';

/**
 * Pending class photos and short clips. Approve and Reject are absent
 * unless the owner, or a person the owner named, is looking.
 */
export function GalleryReviewQueue() {
  const seat = useCurrentSeat();
  const [rows, setRows] = useState<ClassPhotoPromotionItem[]>([]);
  const [cloudRows, setCloudRows] = useState<CloudGalleryFile[]>([]);
  const [note, setNote] = useState('');
  const settings = readGalleryApprovalHere(typeof localStorage === 'undefined' ? null : localStorage);
  const allowed = canApproveGallery({
    role: seat ? 'seat' : 'owner',
    seatId: seat?.id,
    settings,
  });
  const cloudAllowed = galleryDecisionAllowed(seat ? { kind: 'seat', preset: seat.presetId } : { kind: 'owner' });

  const reload = () => {
    void listPendingClassPhotos()
      .then((items) => setRows(items.filter((item) => classPhotoLane(item) === 'pending')))
      .catch(() => setRows([]));
    void listCloudGallery({ lane: 'pending' }).then((files) => setCloudRows(files ?? []));
  };

  useEffect(() => {
    reload();
    const onCloud = () => reload();
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    return () => window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
  }, []);

  const decideCloud = async (file: CloudGalleryFile, action: 'gallery-approve' | 'gallery-reject') => {
    if (!cloudAllowed) return;
    const result = await decideCloudGallery({ path: file.path, action });
    setNote(
      result.ok
        ? action === 'gallery-approve'
          ? 'Approved. It is in the gallery on Advantage Cloud.'
          : 'Rejected. It will not play.'
        : result.message,
    );
    if (result.ok) notifyCloudMedia();
    reload();
  };

  const showLocal = settings.required && rows.length > 0;
  if (!showLocal && cloudRows.length === 0) return null;

  const decide = async (item: ClassPhotoPromotionItem, lane: 'approved' | 'rejected') => {
    if (!allowed) return;
    if (lane === 'approved') {
      const file = new File([item.blob], item.name, { type: item.mime });
      await addFolderFiles([file], 'gallery');
      await publishGymFile({
        purpose: 'gallery',
        role: 'owner',
        kind: item.kind,
        dateKey: item.dateKey,
        fileName: item.name,
        bytes: item.blob,
        mime: item.mime,
        approvalRequired: false,
      });
    }
    await setClassPhotoLane(item.id, lane);
    setNote(lane === 'approved' ? 'Approved. It can play in the gallery.' : 'Rejected. It will not play.');
    reload();
  };

  return (
    <section aria-label="Gallery waiting for approval">
      <h2>Gallery</h2>
      <p role="status">{APPROVAL_WAITING}</p>
      {cloudRows.length ? (
        <ul aria-label="Advantage Cloud photos waiting for approval">
          {cloudRows.map((file) => (
            <li key={file.path} data-cloud-pending={file.path}>
              <span>
                {file.dateKey} · {file.name} · Pending
              </span>
              {cloudAllowed ? (
                <>
                  <button type="button" onClick={() => void decideCloud(file, 'gallery-approve')}>
                    Approve
                  </button>
                  <button type="button" onClick={() => void decideCloud(file, 'gallery-reject')}>
                    Reject
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {showLocal ? (
        <ul>
          {rows.map((item) => (
            <li key={item.id}>
              <span>
                {item.dateKey} · {item.name}
              </span>
              {allowed ? (
                <>
                  <button type="button" onClick={() => void decide(item, 'approved')}>
                    Approve
                  </button>
                  <button type="button" onClick={() => void decide(item, 'rejected')}>
                    Reject
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
