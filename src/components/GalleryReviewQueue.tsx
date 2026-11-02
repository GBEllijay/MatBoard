import { useEffect, useState } from 'react';
import { useCurrentSeat } from './SeatSessionBar';
import {
  APPROVAL_WAITING,
  canApproveGallery,
  readGalleryApproval,
} from '../lib/galleryApproval';
import {
  classPhotoLane,
  listPendingClassPhotos,
  setClassPhotoLane,
  type ClassPhotoPromotionItem,
} from '../lib/classPhotoPromotions';
import { publishGymFile } from '../lib/gymPublish';
import { addFolderFiles } from '../lib/photoStore';

/**
 * Pending class photos and short clips. Approve and Reject are absent
 * unless the owner, or a person the owner named, is looking.
 */
export function GalleryReviewQueue() {
  const seat = useCurrentSeat();
  const [rows, setRows] = useState<ClassPhotoPromotionItem[]>([]);
  const [note, setNote] = useState('');
  const settings = readGalleryApproval(typeof localStorage === 'undefined' ? null : localStorage);
  const allowed = canApproveGallery({
    role: seat ? 'seat' : 'owner',
    seatId: seat?.id,
    settings,
  });

  const reload = () => {
    void listPendingClassPhotos()
      .then((items) => setRows(items.filter((item) => classPhotoLane(item) === 'pending')))
      .catch(() => setRows([]));
  };

  useEffect(() => {
    reload();
  }, []);

  if (!settings.required || rows.length === 0) return null;

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
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
