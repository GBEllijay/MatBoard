/**
 * Minimal coach hooks for the two student → coach kinds. No card visuals;
 * the Coach Clipboard roster card PR renders these through the cardSync API.
 */
import { useEffect, useState } from 'react';
import {
  acceptCardShare,
  declineCardShare,
  dismissCardNotice,
  getCardNotices,
  getPendingCardShares,
  importStudentFile,
  refreshCardNotices,
  refreshCardShares,
  subscribeCardSync,
} from '../lib/cardSync';
import type { Student } from '../lib/rosterStore';
import { applyStudentPhotoFlag, parseStudentPhotoFlag } from '../lib/studentPhotoFlag';

function useTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeCardSync(() => setTick((value) => value + 1)), []);
  return tick;
}

/** Tournament registrations on one card. Dismiss only hides it here. */
export function CoachStudentNotices({ student, roster }: { student: Student; roster: readonly Student[] }) {
  useTick();
  const [status, setStatus] = useState('');
  const notices = getCardNotices(student.id, { roster });
  if (!student.linkedStudentId || student.guestId) return null;
  return (
    <section aria-label="Student notices">
      <h3>From the student</h3>
      {notices.length ? (
        <ul>
          {notices.map((notice) => (
            <li key={notice.eventId}>
              Entered {notice.eventName} on {notice.date}
              {notice.division ? ` · ${notice.division}` : ''}
              <button type="button" className="btn btn--ghost" onClick={() => dismissCardNotice(notice.eventId)}>
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No tournament notices.</p>
      )}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={async () => {
          const result = await refreshCardNotices(student.id, { roster });
          setStatus(result.ok ? `Checked. ${result.stored} new.` : 'Could not reach Advantage Cloud.');
        }}
      >
        Check for notices
      </button>
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}

/** Student card shares from QR sign-ups, waiting for an Instructor or Coach seat. */
export function PendingCardShares({ roster, title = 'Student cards waiting' }: { roster: readonly Student[]; title?: string }) {
  useTick();
  const [status, setStatus] = useState('');
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const shares = getPendingCardShares();
  const targets = roster.filter((row) => !row.guestId);
  return (
    <section aria-label={title}>
      <h3>{title}</h3>
      <p>A merge fills only blank fields. A shared photo waits for the head coach.</p>
      {shares.map((share) => (
        <div key={share.shareId}>
          <p>
            {share.card.name} · {share.card.belt || 'No belt'}
            {share.card.stripes ? ` · ${share.card.stripes} stripes` : ''}
            {share.card.gym ? ` · ${share.card.gym}` : ''}
            {share.photo ? ' · photo pending head coach' : ''}
          </p>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const result = await acceptCardShare(share.shareId, { mode: 'new' });
              setStatus(result.ok ? 'Added to Student Roster.' : 'Only an Instructor or Coach seat can accept.');
            }}
          >
            Accept as new card
          </button>
          <select
            aria-label={`Merge ${share.card.name} into`}
            value={mergeInto[share.shareId] ?? ''}
            onChange={(event) => setMergeInto({ ...mergeInto, [share.shareId]: event.target.value })}
          >
            <option value="">Merge into…</option>
            {targets.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={!mergeInto[share.shareId]}
            onClick={async () => {
              const result = await acceptCardShare(share.shareId, { mode: 'merge', cardId: mergeInto[share.shareId] });
              setStatus(result.ok ? 'Merged. Coach fields were kept.' : `Could not merge (${result.reason}).`);
            }}
          >
            Merge
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={async () => setStatus((await declineCardShare(share.shareId)) ? 'Declined.' : 'Only an Instructor or Coach seat can decline.')}
          >
            Decline
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn--ghost"
        onClick={async () => {
          const result = await refreshCardShares();
          setStatus(result.ok ? `${result.pending} waiting.` : 'Could not reach Advantage Cloud.');
        }}
      >
        Check for student cards
      </button>
      <label>
        Import a student file
        <input
          type="file"
          accept="application/json,.json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            const text = await file.text();
            const flag = parseStudentPhotoFlag(text);
            if (flag) {
              const applied = applyStudentPhotoFlag(flag);
              setStatus(applied ? (flag.noPhotos ? 'No photos is on for this student. Set by family.' : 'The family cleared No photos.') : 'No linked card for that student file.');
              return;
            }
            const result = importStudentFile(text);
            setStatus(result.kind === 'not-student-file' ? 'That is not a student file.' : `Imported (${result.result}).`);
          }}
        />
      </label>
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}
