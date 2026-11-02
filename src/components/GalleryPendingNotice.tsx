import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APPROVAL_DAY_LINK, APPROVAL_WAITING, pendingDayCopy, readGalleryApproval } from '../lib/galleryApproval';
import { listClassPhotoPromotions, listPendingClassPhotos } from '../lib/classPhotoPromotions';

/** Instructor notice, plus the count on one calendar day. Approve and Reject stay on Review Inbox. */
export function GalleryPendingNotice({ dateKey }: { dateKey?: string }) {
  const [waiting, setWaiting] = useState(0);
  const [dayCount, setDayCount] = useState(0);
  useEffect(() => {
    let cancel = false;
    const settings = readGalleryApproval(localStorage);
    if (!settings.required) {
      setWaiting(0);
      setDayCount(0);
      return;
    }
    void listPendingClassPhotos()
      .then((rows) => {
        if (cancel) return;
        setWaiting(rows.length);
      })
      .catch(() => {
        if (!cancel) setWaiting(0);
      });
    if (!dateKey) return () => {
      cancel = true;
    };
    void listClassPhotoPromotions(dateKey)
      .then((rows) => {
        if (cancel) return;
        setDayCount(rows.filter((row) => row.lane === 'pending').length);
      })
      .catch(() => {
        if (!cancel) setDayCount(0);
      });
    return () => {
      cancel = true;
    };
  }, [dateKey]);

  if (waiting <= 0 && dayCount <= 0) return null;
  const day = pendingDayCopy(dayCount);
  return (
    <p role="status">
      {APPROVAL_WAITING}{' '}
      {day ? <span>{day} </span> : null}
      <Link to="/review">{APPROVAL_DAY_LINK}</Link>
    </p>
  );
}
