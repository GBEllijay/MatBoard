import { useMemo, useState, type ReactNode } from 'react';
import { OwnerDistributionQcLog, OwnerDistributionQueue } from '../../components/OwnerDistributionQueue';
import { OwnerGatedSend } from '../../components/OwnerGatedSend';
import { ReviewVideoInbox } from '../../components/ReviewVideoInbox';
import {
  DISTRIBUTION_QC_KEY,
  DISTRIBUTION_QUEUE_KEY,
  memoryStore,
} from '../../lib/ownerGatedDistribution';
import {
  OWNER_GATED_APPROVAL_PATH,
  OWNER_GATED_JOURNAL_PATH,
  OWNER_GATED_QC_PATH,
  OWNER_GATED_SEND_PATH,
  seededNoteItem,
  seededQcLog,
  seededReviewMedia,
  seededReviewTitle,
} from './model';
import './ownerGated.css';

function seedStore() {
  const store = memoryStore();
  const note = seededNoteItem();
  store.setItem(DISTRIBUTION_QUEUE_KEY, JSON.stringify({ version: 1, items: [note] }));
  store.setItem(DISTRIBUTION_QC_KEY, JSON.stringify({ version: 1, records: seededQcLog() }));
  return store;
}

function PreviewChrome({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <main className="ogate">
      <div className="ogate__shell">
        <p className="ogate__banner" role="note">
          Preview only. Names and clips are made-up. Record for Review videos stay with the instructor. Students never
          receive them.
        </p>
        <p className="ogate__kicker">{kicker}</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function OwnerGatedSendPreview() {
  const review = seededReviewTitle();
  const media = seededReviewMedia();
  return (
    <PreviewChrome kicker="Instructor preview" title="Record for Review">
      <p className="ogate__quiet">{OWNER_GATED_SEND_PATH}</p>
      <OwnerGatedSend title={review.title} lesson={review.lesson} media={media} />
    </PreviewChrome>
  );
}

export function OwnerGatedApprovalPreview() {
  const store = useMemo(() => seedStore(), []);
  const [, setTick] = useState(0);
  return (
    <PreviewChrome kicker="Owner preview" title="Review Inbox">
      <p className="ogate__quiet">{OWNER_GATED_APPROVAL_PATH}</p>
      <OwnerDistributionQueue storage={store} onChange={() => setTick((value) => value + 1)} />
    </PreviewChrome>
  );
}

export function OwnerGatedQcPreview() {
  const store = useMemo(() => seedStore(), []);
  const [required, setRequired] = useState(true);
  return (
    <PreviewChrome kicker="Owner preview" title="Advantage Cloud approval">
      <p className="ogate__quiet">{OWNER_GATED_QC_PATH}</p>
      <OwnerDistributionQcLog storage={store} required={required} onToggle={setRequired} records={seededQcLog()} />
    </PreviewChrome>
  );
}

export function OwnerGatedJournalPreview() {
  return (
    <PreviewChrome kicker="Student preview" title="Journal video library">
      <p className="ogate__quiet">{OWNER_GATED_JOURNAL_PATH}</p>
      <ReviewVideoInbox />
    </PreviewChrome>
  );
}
