/**
 * Assessments waiting: student self-assessments sent with "Send to my instructor".
 * The assigned instructor sees hers; the owner sees every instructor's. In-app badge only, no push.
 * Reply goes out through Coach Sync (sendCoachAssessment), prefilled from the student's own scores,
 * and lands in the student's "From your coach" inbox. The item is then marked responded.
 */
import { useEffect, useState } from 'react';
import './assessmentsWaiting.css';
import { sendCoachAssessment } from '../lib/cardSync';
import {
  assessmentsWaitingCount,
  markAssessment,
  readAssessmentsWaiting,
  refreshAssessmentsWaiting,
  replyPrefill,
  subscribeAssessmentsWaiting,
} from '../lib/instructorAssessmentClient';
import type { InstructorAssessmentItem } from '../lib/instructorAssessments';
import { readCloudBearer } from '../lib/advantageCloudMedia';
import { readRosterCard, updateRosterCard } from '../lib/rosterCardStore';
import { AssessmentCompareD8, assessmentEntryFromScores } from './AssessmentCompareD8';
import { downloadJsonFile } from './rosterCard/fileSave';
import type { Student } from '../lib/rosterStore';
import { ASSESSMENT_FORM_AREAS, type AssessmentScores } from '../lib/studentAssessment';

export const ASSESSMENTS_WAITING_TITLE = 'Assessments waiting';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function useWaiting(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeAssessmentsWaiting(() => setTick((value) => value + 1)), []);
  return tick;
}

/** Count badge. Hidden at zero. */
export function AssessmentsWaitingBadge() {
  useWaiting();
  const count = assessmentsWaitingCount(store());
  if (!count) return null;
  return (
    <span className="assess-badge" data-assessments-waiting={count} aria-label={`${count} ${count === 1 ? 'assessment' : 'assessments'} waiting`}>
      {count}
    </span>
  );
}

function instructorLabel(id: string, me: string): string {
  if (id === me) return 'you';
  return id === 'owner' ? 'the owner' : `instructor ${id.slice(0, 6)}`;
}

export function AssessmentsWaiting({ roster }: { roster: readonly Student[] }) {
  useWaiting();
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [replying, setReplying] = useState<string | null>(null);
  const state = readAssessmentsWaiting(store());
  const open = state.items.filter((item) => item.status !== 'responded');

  const check = async () => {
    setChecking(true);
    const result = await refreshAssessmentsWaiting();
    setChecking(false);
    if (!result.ok) {
      setStatus(result.error);
      return false;
    }
    setStatus(result.waiting ? `${result.waiting} waiting.` : 'Nothing waiting.');
    return true;
  };

  useEffect(() => {
    // One pull when the roster opens, if this phone is signed in. No background polling.
    if (!readCloudBearer()) return;
    void refreshAssessmentsWaiting().then((result) => {
      if (!result.ok && /Only an Instructor|not on this license|not active/.test(result.error)) setHidden(true);
    });
  }, []);

  if (hidden) return null;
  return (
    <section aria-label={ASSESSMENTS_WAITING_TITLE} className="assess-waiting">
      <h3>
        {ASSESSMENTS_WAITING_TITLE} <AssessmentsWaitingBadge />
      </h3>
      <p>Self-assessments students sent you. Reply sends your scores to their card through Coach Sync.</p>
      {open.length === 0 ? <p>No assessments waiting.</p> : null}
      {open.map((item) => {
        const card = roster.find((row) => row.linkedStudentId === item.submission.studentId && !row.guestId) ?? null;
        const self = assessmentEntryFromScores(
          item.id,
          item.submission.date,
          item.submission.scores,
          item.submission.note,
        );
        return (
          <div key={item.id} data-assessment-item={item.id}>
            <p>
              <strong>{card?.name || item.submission.studentName || 'Student'}</strong> · {item.submission.date}
              {state.owner ? ` · for ${instructorLabel(item.instructorId, state.instructorId)}` : ''}
              {item.status === 'seen' ? ' · seen' : ' · new'}
            </p>
            <ul aria-label="Student scores">
              {ASSESSMENT_FORM_AREAS.map((area) => {
                const score = item.submission.scores[area.id];
                return score ? <li key={area.id}>{`${area.label} ${score}`}</li> : null;
              })}
            </ul>
            {self ? (
              <AssessmentCompareD8
                mode="compact"
                coachEntries={card ? readRosterCard(card.id).coachAssessments : []}
                selfEntries={[self]}
              />
            ) : null}
            {item.submission.note ? <p>{`Note: ${item.submission.note}`}</p> : null}
            {!card ? <p>Accept this student&apos;s card first, then reply.</p> : null}
            <button type="button" className="btn" disabled={!card} onClick={() => setReplying(replying === item.id ? null : item.id)}>
              Reply
            </button>
            {item.status === 'pending' ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={async () => {
                  const result = await markAssessment(item.id, 'seen');
                  setStatus(result.ok ? 'Marked seen.' : result.error);
                }}
              >
                Mark seen
              </button>
            ) : null}
            {replying === item.id && card ? (
              <ReplyForm
                item={item}
                card={card}
                onDone={(text) => {
                  setReplying(null);
                  setStatus(text);
                }}
              />
            ) : null}
          </div>
        );
      })}
      <button type="button" className="btn btn--ghost" disabled={checking} onClick={() => void check()}>
        {checking ? 'Checking…' : 'Check for assessments'}
      </button>
      {status ? <p role="status">{status}</p> : null}
    </section>
  );
}

function ReplyForm({ item, card, onDone }: { item: InstructorAssessmentItem; card: Student; onDone: (text: string) => void }) {
  const prefill = replyPrefill(item);
  const [scores, setScores] = useState<Record<string, number>>(prefill.scores);
  const [note, setNote] = useState(prefill.note);
  const [busy, setBusy] = useState(false);
  return (
    <form
      aria-label={`Reply to ${card.name}`}
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        let responseId = '';
        const result = await sendCoachAssessment(
          card.id,
          { date: prefill.date, scores, note },
          { onBuilt: (packet) => (responseId = packet.updateId) },
        );
        if (result.mode === 'blocked' || result.mode === 'invalid' || !responseId) {
          setBusy(false);
          onDone('reason' in result ? result.reason : 'error' in result ? result.error : 'Could not send that reply.');
          return;
        }
        // No Cloud inbox for this student right now: same file fallback as the card's own send.
        if (result.mode === 'file') downloadJsonFile(result.name, result.json);
        // Keep it as this coach's assessment on the card too, so the Coach view shows it.
        updateRosterCard(card.id, (row) => ({
          ...row,
          coachAssessments: [
            ...row.coachAssessments,
            { id: `reply-${responseId}`, date: prefill.date, note, scores: scores as unknown as AssessmentScores },
          ].slice(-60),
        }));
        const marked = await markAssessment(item.id, 'responded', { responseId });
        setBusy(false);
        onDone(
          marked.ok
            ? `Sent to ${card.name}'s card. It shows in their From your coach inbox.`
            : `Sent to ${card.name}'s card. Marking it answered did not save: ${marked.error}`,
        );
      }}
    >
      {ASSESSMENT_FORM_AREAS.map((area) => (
        <label key={area.id}>
          {area.label}
          <select
            aria-label={`Coach ${area.label}`}
            value={scores[area.id] ?? ''}
            onChange={(event) => {
              const value = Number(event.target.value);
              setScores((current) => {
                const next = { ...current };
                if (value >= 1 && value <= 5) next[area.id] = value;
                else delete next[area.id];
                return next;
              });
            }}
          >
            <option value="">Not rated</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      ))}
      <label>
        Note to student
        <textarea aria-label="Reply note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? 'Sending…' : "Send to student's card"}
      </button>
    </form>
  );
}
