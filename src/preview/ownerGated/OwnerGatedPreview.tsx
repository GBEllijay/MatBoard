import { useMemo, useState, type ReactNode } from 'react';
import { OwnerDistributionQcLog, OwnerDistributionQueue } from '../../components/OwnerDistributionQueue';
import { OwnerGatedSend } from '../../components/OwnerGatedSend';
import { ReviewVideoInbox } from '../../components/ReviewVideoInbox';
import {
  DISTRIBUTION_QC_KEY,
  DISTRIBUTION_QUEUE_KEY,
  REVIEW_VIDEO_INBOX_KEY,
  formatDuration,
  memoryStore,
} from '../../lib/ownerGatedDistribution';
import { loadFilms, type StudentFilm } from '../../lib/studentFilm';
import {
  OWNER_GATED_APPROVAL_PATH,
  OWNER_GATED_JOURNAL_PATH,
  OWNER_GATED_QC_PATH,
  OWNER_GATED_SEND_PATH,
  SEEDED_ROSTER,
  seededMicahPacket,
  seededNoteItem,
  seededPendingItem,
  seededQcLog,
} from './model';
import './ownerGated.css';

function seedStore() {
  const store = memoryStore();
  const pending = seededPendingItem();
  const note = seededNoteItem();
  store.setItem(DISTRIBUTION_QUEUE_KEY, JSON.stringify({ version: 1, items: [pending, note] }));
  store.setItem(DISTRIBUTION_QC_KEY, JSON.stringify({ version: 1, records: seededQcLog() }));
  store.setItem(REVIEW_VIDEO_INBOX_KEY, JSON.stringify({ version: 1, packets: [seededMicahPacket()] }));
  return store;
}

function PreviewChrome({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <main className="ogate">
      <div className="ogate__shell">
        <p className="ogate__banner" role="note">
          Preview only. Names and clips are made-up. Student and kid videos are not uploaded to Advantage Cloud.
        </p>
        <p className="ogate__kicker">{kicker}</p>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function OwnerGatedSendPreview() {
  const store = useMemo(() => seedStore(), []);
  const pending = seededPendingItem();
  return (
    <PreviewChrome kicker="Instructor preview" title="Record for Review">
      <p className="ogate__quiet">{OWNER_GATED_SEND_PATH}</p>
      <OwnerGatedSend
        roster={SEEDED_ROSTER}
        storage={store}
        approvalRequired
        title={pending.title}
        lesson={pending.lesson}
        dateKey={pending.dateKey}
        media={pending.media!}
        availableHomes={{ googleDrive: true }}
        senderName="Instructor Guise"
      />
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
  const store = useMemo(() => seedStore(), []);
  const [films, setFilms] = useState<StudentFilm[]>(() => loadFilms(store));
  const packet = seededMicahPacket();
  return (
    <PreviewChrome kicker="Student preview · kid card on file" title="Journal video library">
      <p className="ogate__quiet">{OWNER_GATED_JOURNAL_PATH}</p>
      <ReviewVideoInbox
        storage={store}
        studentId="stu-micah"
        packets={[packet]}
        seedBlob={new Blob([new Uint8Array([0, 0, 0, 1, 0])], { type: 'video/mp4' })}
        onReceived={setFilms}
      />
      <section className="ogate__card" aria-label="Journal video library">
        <h2>Journal video library</h2>
        {films.length === 0 ? (
          <p>Nothing in the library yet. Accept the review above to add it. A kid card does not block this.</p>
        ) : (
          <div className="ogate__library">
            {films.map((film) => (
              <article key={film.id}>
                {packet.media.thumbnailDataUrl ? <img src={packet.media.thumbnailDataUrl} alt="" /> : null}
                <div>
                  <strong>{film.technique}</strong>
                  <p>
                    {film.date}
                    {packet.media.durationMs ? ` · ${formatDuration(packet.media.durationMs)}` : ''}
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PreviewChrome>
  );
}
