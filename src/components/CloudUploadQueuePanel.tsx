import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import {
  CLOUD_CLEANUP_ROUTE,
  cloudOverSoftLimit,
  cloudSoftLimitWarning,
  formatCloudBytes,
  readCloudBearer,
  type CloudStatusBody,
} from '../lib/advantageCloudMedia';
import { cloudUploadQueue } from '../lib/cloudUploadQueueInstance';
import {
  queueItemFinished,
  queueStatusLabel,
  queueSummaryLine,
  summarizeQueue,
  type CloudQueueItem,
} from '../lib/cloudUploadQueue';

function useQueueItems(): readonly CloudQueueItem[] {
  return useSyncExternalStore(cloudUploadQueue.subscribe, cloudUploadQueue.snapshot, cloudUploadQueue.snapshot);
}

/** One status read when a batch starts, for the 50 GB warning. Not polled. */
function useSoftLimitWarning(active: boolean): string {
  const [warning, setWarning] = useState('');
  const checked = useRef(false);
  useEffect(() => {
    if (!active) {
      checked.current = false;
      return;
    }
    if (checked.current) return;
    checked.current = true;
    const token = readCloudBearer();
    if (!token) return;
    void fetch('/api/gym/cloud?op=status', { headers: { authorization: `Bearer ${token}` } })
      .then((response) => (response.ok ? (response.json() as Promise<CloudStatusBody>) : null))
      .then((body) => {
        if (!body || typeof body.licenseUsedBytes !== 'number' || typeof body.capBytes !== 'number') return;
        setWarning(cloudOverSoftLimit(body.licenseUsedBytes, body.capBytes) ? cloudSoftLimitWarning(body.licenseUsedBytes, body.capBytes) : '');
      })
      .catch(() => undefined);
  }, [active]);
  return warning;
}

function QueueRow({ item }: { item: CloudQueueItem }) {
  const fraction = item.size > 0 ? Math.min(1, item.sent / item.size) : 0;
  const finished = queueItemFinished(item);
  const tone =
    item.status === 'failed' ? 'error' : item.status === 'duplicate' ? 'skip' : item.status === 'done' ? 'done' : 'active';
  return (
    <li className={`cloud-queue__row cloud-queue__row--${tone}`} data-cloud-queue-row={item.status}>
      <div className="cloud-queue__line">
        <span className="cloud-queue__name" title={item.name}>
          {item.name}
        </span>
        <span className="cloud-queue__size">{formatCloudBytes(item.size)}</span>
      </div>
      <div className="cloud-queue__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label={`${item.name} upload`}>
        <span style={{ width: `${Math.round(fraction * 100)}%` }} />
      </div>
      <div className="cloud-queue__line">
        <span className="cloud-queue__status">
          {queueStatusLabel(item)}
          {item.message && (item.status === 'failed' || item.status === 'retrying') ? ` · ${item.message}` : ''}
        </span>
        {item.status === 'failed' || item.status === 'canceled' ? (
          <button type="button" className="cloud-queue__action" onClick={() => cloudUploadQueue.retry(item.id)}>
            Retry
          </button>
        ) : !finished ? (
          <button type="button" className="cloud-queue__action" onClick={() => cloudUploadQueue.cancel(item.id)}>
            Cancel
          </button>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Per-file and overall progress for Advantage Cloud uploads.
 * Renders nothing until a batch is queued.
 */
export function CloudUploadQueuePanel() {
  const items = useQueueItems();
  const summary = summarizeQueue(items);
  const warning = useSoftLimitWarning(summary.total > 0);
  const [open, setOpen] = useState(true);
  if (!summary.total) return null;
  const percent = Math.round(summary.fraction * 100);
  return (
    <section className="cloud-queue" aria-label="Advantage Cloud uploads" data-cloud-queue="">
      <div className="cloud-queue__head">
        <p className="cloud-queue__summary" role="status">
          {queueSummaryLine(summary)}
        </p>
        <span className="cloud-queue__bytes">
          {formatCloudBytes(summary.sentBytes)} of {formatCloudBytes(summary.totalBytes)}
        </span>
      </div>
      <div className="cloud-queue__bar cloud-queue__bar--total" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="All uploads">
        <span style={{ width: `${percent}%` }} />
      </div>
      {warning ? (
        <p className="cloud-queue__warning" data-cloud-soft-limit="">
          {warning}
          {CLOUD_CLEANUP_ROUTE ? (
            <>
              {' '}
              <Link to={CLOUD_CLEANUP_ROUTE}>Clean up old videos</Link>
            </>
          ) : null}
        </p>
      ) : null}
      <div className="cloud-queue__actions">
        <button type="button" className="btn" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          {open ? 'Hide files' : `Show files (${summary.total})`}
        </button>
        {summary.failed ? (
          <button type="button" className="btn" onClick={() => cloudUploadQueue.retryFailed()}>
            Retry failed
          </button>
        ) : null}
        {summary.active ? (
          <button type="button" className="btn" onClick={() => cloudUploadQueue.cancelAll()}>
            Cancel all
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => cloudUploadQueue.clearFinished()}>
            Done
          </button>
        )}
      </div>
      {open ? (
        <ul className="cloud-queue__list">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
