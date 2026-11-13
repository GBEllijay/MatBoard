import { useState } from 'react';
import {
  approveDistribution,
  formatDuration,
  formatSize,
  pendingDistribution,
  readDistributionQueue,
  readQcLog,
  rejectDistribution,
  type DistributionItem,
  type MemoryStore,
  type QcRecord,
} from '../lib/ownerGatedDistribution';
import '../preview/ownerGated/ownerGated.css';

export function OwnerDistributionQueue({
  storage,
  actor = 'Owner',
  items,
  onChange,
}: {
  storage: MemoryStore;
  actor?: string;
  items?: DistributionItem[];
  onChange?: () => void;
}) {
  const list = items ?? pendingDistribution(storage);
  const [note, setNote] = useState('');
  if (!list.length) {
    return (
      <section className="ogate__card" aria-label="Student-bound reviews and notes">
        <h2>Student-bound reviews and notes</h2>
        <p>Nothing is waiting for approval.</p>
      </section>
    );
  }
  return (
    <section className="ogate__card" aria-label="Student-bound reviews and notes">
      <h2>Student-bound reviews and notes</h2>
      {list.map((item) => (
        <article key={item.id} aria-label={item.title}>
          {item.media?.thumbnailDataUrl ? <img className="ogate__thumb" src={item.media.thumbnailDataUrl} alt="" /> : null}
          <p className="ogate__meta">
            <strong>{item.title}</strong>
            {item.lesson ? ` · ${item.lesson}` : ''}
            {item.kind === 'note' ? ' · Note' : ''}
            {item.media?.durationMs ? ` · ${formatDuration(item.media.durationMs)}` : ''}
            {item.media?.size ? ` · ${formatSize(item.media.size)}` : ''}
          </p>
          <p>
            From {item.sentBy.name}. Aimed at{' '}
            {item.targets.map((target, index) => (
              <span key={target.studentId}>
                {index ? ', ' : ''}
                {target.name}
                {target.division ? ` (${target.division})` : ''}
                {target.kidCard ? <span className="ogate__pill">Kid card</span> : null}
              </span>
            ))}
            .
          </p>
          {item.note ? <p>{item.note}</p> : null}
          {item.status === 'pending' ? (
            <div className="ogate__actions">
              <button
                type="button"
                onClick={() => {
                  const result = approveDistribution(item.id, storage, actor);
                  setNote('ok' in result && result.ok === false ? result.error : 'message' in result ? result.message : '');
                  onChange?.();
                }}
              >
                Approve and send
              </button>
              <button
                type="button"
                className="ogate__btn--danger"
                onClick={() => {
                  const result = rejectDistribution(item.id, storage, actor);
                  setNote('ok' in result && result.ok === false ? result.error : 'message' in result ? result.message : '');
                  onChange?.();
                }}
              >
                Reject
              </button>
            </div>
          ) : (
            <p className="ogate__status">{item.status}</p>
          )}
        </article>
      ))}
      {note ? (
        <p className="ogate__status" role="status">
          {note}
        </p>
      ) : null}
    </section>
  );
}

export function OwnerDistributionQcLog({
  storage,
  required,
  onToggle,
  records,
  canEdit = true,
}: {
  storage?: MemoryStore;
  required: boolean;
  onToggle?: (required: boolean) => void;
  records?: QcRecord[];
  canEdit?: boolean;
}) {
  const rows = records ?? (storage ? readQcLog(storage) : []);
  const queueCount = storage ? readDistributionQueue(storage).filter((item) => item.status === 'pending').length : 0;
  return (
    <section className="ogate__card" aria-label="Owner approval and QC log">
      <h2>Owner approval</h2>
      <label className="ogate__switch">
        <input
          type="checkbox"
          checked={required}
          disabled={!canEdit || !onToggle}
          onChange={(event) => onToggle?.(event.target.checked)}
        />
        <span>Require approval before photos and videos go to the gallery, and before Record for Review clips or notes reach students.</span>
      </label>
      <p>
        Only the Advantage owner can change this. When it is off, instructors can send without a thumbs-up, but every send still writes a record below.
      </p>
      {queueCount ? <p className="ogate__status">{queueCount} waiting in Review Inbox.</p> : null}
      <h2>Quality-control log</h2>
      {rows.length === 0 ? (
        <p>No sends recorded yet.</p>
      ) : (
        <ul className="ogate__log" aria-label="Quality-control log">
          {rows.map((row) => (
            <li key={row.id}>
              <strong>{row.action}</strong>
              {row.summary} · {row.actor}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
