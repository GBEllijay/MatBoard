import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLOUD_MEDIA_EVENT } from '../lib/advantageCloudMedia';
import { APPROVAL_DAY_LINK, APPROVAL_WAITING, GALLERY_REVIEW_PATH, pendingDayCopy, pendingPhotosLabel } from '../lib/galleryApproval';
import { readGalleryApprovalHere } from '../lib/galleryApprovalDefault';
import { listClassPhotoPromotions, listPendingClassPhotos } from '../lib/classPhotoPromotions';
import { cloudGalleryPendingCount } from '../lib/galleryCloud';

/** Instructor notice, plus the count on one calendar day. Approve and Reject stay on Review Inbox. */
export function GalleryPendingNotice({ dateKey }: { dateKey?: string }) {
  const [waiting, setWaiting] = useState(0);
  const [dayCount, setDayCount] = useState(0);
  useEffect(() => {
    let cancel = false;
    const loadLocal = () => {
      const settings = readGalleryApprovalHere(localStorage);
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
      if (!dateKey) return;
      void listClassPhotoPromotions(dateKey)
        .then((rows) => {
          if (cancel) return;
          setDayCount(rows.filter((row) => row.lane === 'pending').length);
        })
        .catch(() => {
          if (!cancel) setDayCount(0);
        });
    };
    const load = () => {
      void cloudGalleryPendingCount(dateKey).then((cloud) => {
        if (cancel) return;
        if (cloud) {
          setWaiting(cloud.waiting);
          setDayCount(cloud.dayCount);
          return;
        }
        loadLocal();
      });
    };
    load();
    window.addEventListener(CLOUD_MEDIA_EVENT, load);
    return () => {
      cancel = true;
      window.removeEventListener(CLOUD_MEDIA_EVENT, load);
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

/** Owner home badge. Hidden until Advantage Cloud has photos waiting in gallery/pending. */
export function GalleryPendingBadge() {
  const [waiting, setWaiting] = useState(0);
  useEffect(() => {
    let cancel = false;
    const load = () => {
      void cloudGalleryPendingCount().then((cloud) => {
        if (!cancel) setWaiting(cloud?.waiting ?? 0);
      });
    };
    load();
    window.addEventListener(CLOUD_MEDIA_EVENT, load);
    return () => {
      cancel = true;
      window.removeEventListener(CLOUD_MEDIA_EVENT, load);
    };
  }, []);
  if (waiting <= 0) return null;
  const noun = waiting === 1 ? 'photo is' : 'photos are';
  return (
    <p role="status" data-gallery-pending-badge="">
      <Link to="/review">
        {waiting} {noun} waiting for approval
      </Link>
    </p>
  );
}

/** "Pending photos (N)" under the owner's gallery approval switch. Opens the existing queue on Review Inbox. */
export function GalleryPendingLink() {
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    let cancel = false;
    const load = () => {
      void cloudGalleryPendingCount().then((cloud) => {
        if (cancel) return;
        if (cloud) {
          setWaiting(cloud.waiting);
          return;
        }
        void listPendingClassPhotos()
          .then((rows) => {
            if (!cancel) setWaiting(rows.length);
          })
          .catch(() => {
            if (!cancel) setWaiting(0);
          });
      });
    };
    load();
    window.addEventListener(CLOUD_MEDIA_EVENT, load);
    return () => {
      cancel = true;
      window.removeEventListener(CLOUD_MEDIA_EVENT, load);
    };
  }, []);
  return (
    <p className="invite-form__note" data-gallery-pending-link="">
      <Link to={GALLERY_REVIEW_PATH}>{pendingPhotosLabel(waiting)}</Link>
    </p>
  );
}
