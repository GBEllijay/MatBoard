import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CLOUD_MEDIA_EVENT } from '../lib/advantageCloudMedia';
import { APPROVAL_DAY_LINK, APPROVAL_WAITING, pendingDayCopy, readGalleryApproval } from '../lib/galleryApproval';
import { listClassPhotoPromotions, listPendingClassPhotos } from '../lib/classPhotoPromotions';
import { cloudGalleryPendingCount } from '../lib/galleryCloud';

/** Instructor notice, plus the count on one calendar day. Approve and Reject stay on Review Inbox. */
export function GalleryPendingNotice({ dateKey }: { dateKey?: string }) {
  const [waiting, setWaiting] = useState(0);
  const [dayCount, setDayCount] = useState(0);
  useEffect(() => {
    let cancel = false;
    const loadLocal = () => {
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
