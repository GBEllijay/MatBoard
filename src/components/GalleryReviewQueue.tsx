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
import { advantageCloudLaneStore } from '../lib/advantageCloudLanes';
import type { ApprovalItem } from '../lib/approvalLanes';
import { CLOUD_REJECT_DELETE_CONFIRM, CLOUD_REJECT_DELETED_MESSAGE } from '../lib/cloudVideoCleanup';
import { CloudDeleteConfirm } from './CloudDeleteConfirm';
import { publishGymFile } from '../lib/gymPublish';
import { addFolderFiles } from '../lib/photoStore';

/**
 * Pending class photos, short clips, and Advantage Cloud daily videos.
 * Approve and Reject are absent unless the owner, or a person the owner
 * named (Cloud: an Instructors seat), is looking.
 */
export function GalleryReviewQueue() {
  const seat = useCurrentSeat();
  const [rows, setRows] = useState<ClassPhotoPromotionItem[]>([]);
  const [cloudRows, setCloudRows] = useState<ApprovalItem[]>([]);
  const [preview, setPreview] = useState<{ path: string; url: string; kind: 'photo' | 'video' } | null>(null);
  const [note, setNote] = useState('');
  const [pendingReject, setPendingReject] = useState<ApprovalItem | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
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
    void advantageCloudLaneStore()
      .list({ lane: 'pending' })
      .then((items) => setCloudRows(items ?? []))
      .catch(() => setCloudRows([]));
  };

  useEffect(() => {
    reload();
    const onCloud = () => reload();
    window.addEventListener(CLOUD_MEDIA_EVENT, onCloud);
    return () => window.removeEventListener(CLOUD_MEDIA_EVENT, onCloud);
  }, []);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  const decideCloud = async (item: ApprovalItem, decision: 'approve' | 'reject') => {
    if (!cloudAllowed) return;
    if (decision === 'reject' && pendingReject?.path !== item.path) {
      setPendingReject(item);
      return;
    }
    setRejectBusy(true);
    const result = await advantageCloudLaneStore().decide(item, decision);
    setRejectBusy(false);
    setPendingReject(null);
    setNote(
      result.ok
        ? decision === 'approve'
          ? item.source === 'daily-video'
            ? "Approved. It shows in today's videos and the Advantage Cloud gallery."
            : 'Approved. It is in the gallery on Advantage Cloud.'
          : CLOUD_REJECT_DELETED_MESSAGE
        : result.message,
    );
    if (result.ok) notifyCloudMedia();
    if (preview?.path === item.path) setPreview(null);
    reload();
  };

  const showPreview = async (item: ApprovalItem) => {
    const blob = await advantageCloudLaneStore().open(item);
    if (!blob) {
      setNote('That file could not be opened from Advantage Cloud.');
      return;
    }
    setPreview({ path: item.path, url: URL.createObjectURL(blob), kind: item.kind });
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
        <ul aria-label="Advantage Cloud photos and videos waiting for approval">
          {cloudRows.map((file) => (
            <li key={`${file.source}:${file.path}`} data-cloud-pending={file.path} data-cloud-source={file.source}>
              <span>
                {file.dateKey} · {file.source === 'daily-video' ? 'Daily video' : file.kind === 'video' ? 'Gallery clip' : 'Gallery photo'} ·{' '}
                {file.name} · Pending
              </span>
              {cloudAllowed ? (
                <>
                  <button type="button" onClick={() => void showPreview(file)}>
                    Preview
                  </button>
                  <button type="button" onClick={() => void decideCloud(file, 'approve')}>
                    Approve
                  </button>
                  <button type="button" onClick={() => void decideCloud(file, 'reject')}>
                    Reject
                  </button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {pendingReject ? (
        <CloudDeleteConfirm
          title="Reject and delete"
          body={CLOUD_REJECT_DELETE_CONFIRM}
          confirmLabel="Reject and delete"
          busy={rejectBusy}
          onCancel={() => setPendingReject(null)}
          onConfirm={() => void decideCloud(pendingReject, 'reject')}
        />
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
      {preview ? (
        <div className="gallery-review__preview" data-cloud-preview={preview.path}>
          {preview.kind === 'photo' ? (
            <img src={preview.url} alt="Waiting for approval" style={{ maxWidth: '100%' }} />
          ) : (
            <video src={preview.url} controls playsInline style={{ maxWidth: '100%' }} />
          )}
          <button type="button" className="btn btn--ghost" onClick={() => setPreview(null)}>
            Close preview
          </button>
        </div>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
