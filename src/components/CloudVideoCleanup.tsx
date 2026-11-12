import { useEffect, useState } from 'react';
import { cloudUsageLine, formatCloudBytes } from '../lib/advantageCloudMedia';
import {
  CLOUD_CLEANUP_EMPTY,
  CLOUD_CLEANUP_READ_ERROR,
  DEFAULT_VIDEO_CLEANUP_DAYS,
  VIDEO_CLEANUP_DAYS,
  cloudCleanupConfirm,
  cloudCleanupSummary,
  deleteCloudMediaInBatches,
  listOldCloudVideos,
  parseVideoCleanupDays,
  type OldCloudVideoList,
  type VideoCleanupDays,
} from '../lib/cloudVideoCleanup';
import { CloudDeleteConfirm } from './CloudDeleteConfirm';

export const CLOUD_CLEANUP_TITLE = 'Clean up old videos';
export const CLOUD_CLEANUP_HINT =
  'Videos older than the cutoff, by class date. Pending videos in Review Inbox are left alone. Photos are not included.';

type Props = {
  list?: typeof listOldCloudVideos;
  remove?: typeof deleteCloudMediaInBatches;
};

export function CloudVideoCleanup({ list = listOldCloudVideos, remove = deleteCloudMediaInBatches }: Props) {
  const [days, setDays] = useState<VideoCleanupDays>(DEFAULT_VIDEO_CLEANUP_DAYS);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<OldCloudVideoList | null | { error: string }>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setNote('');
    setResult(null);
    void list({ days }).then((next) => {
      if (!cancelled) setResult(next ?? { error: CLOUD_CLEANUP_READ_ERROR });
    });
    return () => {
      cancelled = true;
    };
  }, [days, list, open]);

  if (!open) {
    return (
      <div className="cloud-cleanup" data-cloud-cleanup="">
        <button type="button" className="btn btn--ghost" data-cloud-cleanup-open="" onClick={() => setOpen(true)}>
          {CLOUD_CLEANUP_TITLE}
        </button>
      </div>
    );
  }

  const ready = result && !('error' in result) ? result : null;

  const runDelete = async () => {
    if (!ready?.items.length) return;
    setBusy(true);
    const deleted = await remove({ paths: ready.items.map((item) => item.path) });
    setBusy(false);
    setConfirm(false);
    if (!deleted.ok) {
      setNote(deleted.message);
      return;
    }
    const usage =
      typeof deleted.licenseUsedBytes === 'number' &&
      typeof deleted.bucketUsedBytes === 'number' &&
      typeof deleted.capBytes === 'number'
        ? ` ${cloudUsageLine(deleted.licenseUsedBytes, deleted.bucketUsedBytes, deleted.capBytes)}`
        : '';
    setNote(`Deleted ${deleted.deleted} ${deleted.deleted === 1 ? 'video' : 'videos'}.${usage}`);
    const refreshed = await list({ days });
    setResult(refreshed);
  };

  return (
    <section className="cloud-cleanup" aria-label={CLOUD_CLEANUP_TITLE} data-cloud-cleanup="open">
      <h3>{CLOUD_CLEANUP_TITLE}</h3>
      <p className="cloud-cleanup__hint">{CLOUD_CLEANUP_HINT}</p>
      <label className="cloud-cleanup__days">
        Older than
        <select
          data-cloud-cleanup-days=""
          value={days}
          onChange={(event) => {
            setDays(parseVideoCleanupDays(event.target.value));
            setConfirm(false);
          }}
        >
          {VIDEO_CLEANUP_DAYS.map((option) => (
            <option key={option} value={option}>
              {option} days
            </option>
          ))}
        </select>
      </label>
      {result && 'error' in result ? (
        <p role="alert">{result.error || CLOUD_CLEANUP_READ_ERROR}</p>
      ) : null}
      {ready && ready.count === 0 ? <p data-cloud-cleanup-empty="">{CLOUD_CLEANUP_EMPTY(days)}</p> : null}
      {ready && ready.count > 0 ? (
        <>
          <p data-cloud-cleanup-summary="">{cloudCleanupSummary(ready.count, ready.totalBytes, ready.truncated)}</p>
          <ul className="cloud-cleanup__list" aria-label="Old videos">
            {ready.items.map((item) => (
              <li key={item.path} data-cloud-cleanup-item={item.path}>
                {item.dateKey} · {item.name} · {formatCloudBytes(item.size)}
                {item.lane === 'rejected' ? ' · Already rejected' : ''}
              </li>
            ))}
          </ul>
          {confirm ? (
            <CloudDeleteConfirm
              title="Delete old videos"
              body={cloudCleanupConfirm(ready.items.length, ready.items.reduce((sum, item) => sum + item.size, 0))}
              confirmLabel={ready.items.length === 1 ? 'Delete this video' : `Delete these ${ready.items.length} videos`}
              busy={busy}
              onCancel={() => setConfirm(false)}
              onConfirm={() => void runDelete()}
            />
          ) : (
            <button type="button" className="btn" data-cloud-cleanup-delete="" disabled={busy} onClick={() => setConfirm(true)}>
              Delete these {ready.items.length === 1 ? 'video' : 'videos'}
            </button>
          )}
        </>
      ) : null}
      {result === null ? <p role="status">Checking Advantage Cloud…</p> : null}
      {note ? (
        <p role="status" data-cloud-cleanup-note="">
          {note}
        </p>
      ) : null}
    </section>
  );
}
