/**
 * Minimal coach hooks for the two student → coach kinds. No card visuals;
 * the Coach Clipboard roster card PR renders these through the cardSync API.
 */
import { useEffect, useState } from 'react';
import {
  acceptCardShare,
  applyStudentUpdate,
  dismissStudentUpdate,
  getPendingStudentUpdates,
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
export function PendingCardShares({ roster }: { roster: readonly Student[] }) {
  useTick();
  const [status, setStatus] = useState('');
  const [mergeInto, setMergeInto] = useState<Record<string, string>>({});
  const [, setTick] = useState(0);
  const shares = getPendingCardShares();
  const targets = roster.filter((row) => !row.guestId);
  return (
    <section aria-label="Student cards waiting">
      <h3>Student cards waiting</h3>
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
            const result = importStudentFile(await file.text());
            setStatus(result.kind === 'not-student-file' ? 'That is not a student file.' : `Imported (${result.result}).`);
            setTick((value) => value + 1);
          }}
        />
      </label>
      <PendingStudentUpdates roster={roster} onStatus={setStatus} />
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}

/** Update files from "Make a file for my coach". Blanks fill; belt and stripes need approval. */
export function PendingStudentUpdates({ roster, onStatus }: { roster: readonly Student[]; onStatus: (text: string) => void }) {
  const [, setTick] = useState(0);
  const updates = getPendingStudentUpdates();
  if (!updates.length) return null;
  const done = (text: string) => {
    onStatus(text);
    setTick((value) => value + 1);
  };
  return (
    <div aria-label="Student updates waiting">
      <h3>Student updates waiting</h3>
      <p>Adding fills only blank fields on the linked card. Belt and stripes change only when you approve them.</p>
      {updates.map((update) => {
        const card = roster.find((row) => row.linkedStudentId === update.studentId && !row.guestId);
        const tournaments = update.competition?.tournaments ?? [];
        return (
          <div key={update.updateId}>
            <p>
              {card ? card.name : 'No linked card yet'}
              {update.profile ? ' · profile' : ''}
              {update.card ? ` · belt ${update.card.belt}${update.card.stripes ? `, ${update.card.stripes} stripes` : ''}` : ''}
              {update.competition?.games.length ? ' · A/B/C game' : ''}
              {tournaments.length ? ` · entered ${tournaments.map((t) => `${t.name} ${t.date}`).join(', ')}` : ''}
              {update.assessments?.length ? ` · ${update.assessments.length} self-assessment(s)` : ''}
            </p>
            <button
              type="button"
              className="btn"
              disabled={!card}
              onClick={() => {
                const result = applyStudentUpdate(update.updateId, false);
                done(result.ok ? `Added. Filled: ${result.filled.join(', ') || 'nothing blank'}.` : `Could not add (${result.reason}).`);
              }}
            >
              Add (fill blanks)
            </button>
            {update.card ? (
              <button
                type="button"
                className="btn"
                disabled={!card}
                onClick={() => {
                  const result = applyStudentUpdate(update.updateId, true);
                  done(result.ok ? 'Added. Belt and stripes approved.' : result.reason === 'not-allowed' ? 'Only an Instructor or Coach seat can approve belt changes.' : `Could not add (${result.reason}).`);
                }}
              >
                Add and approve belt
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                dismissStudentUpdate(update.updateId);
                done('Dismissed.');
              }}
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}
