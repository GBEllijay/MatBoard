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
  const [, setTick] = useState(0);
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
      <p>Adding fills only blank fields on the linked card, including a blank bout division from an entered tournament. Tournaments, weight, and opponent cards are kept with the student's updates. Belt and stripes change only when you approve them. Dismiss leaves that file off the card.</p>
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
              {update.weight?.weighIns.length ? ` · weigh-ins ${update.weight.weighIns.map((w) => `${w.weight} ${w.unit} ${w.date}`).join(', ')}` : ''}
              {update.weight?.goalWeight ? ` · goal ${update.weight.goalWeight} ${update.weight.goalUnit || update.weight.unit}` : ''}
              {update.scouting?.cards.length ? ` · ${update.scouting.cards.length} opponent card(s)` : ''}
            </p>
            {update.scouting?.cards.length ? (
              <ul aria-label="Opponent cards">
                {update.scouting.cards.map((scout) => (
                  <li key={scout.id}>
                    {scout.name}
                    {scout.gym ? ` · ${scout.gym}` : ''}
                    {` · ${scout.group === 'open' ? 'Open class' : 'Weight class'}`}
                    {scout.weightClass ? ` · ${scout.weightClass}` : ''}
                    {scout.belt ? ` · ${scout.belt}` : ''}
                    {scout.style ? ` · ${scout.style}` : ''}
                    {` · record ${scout.record.line}`}
                    {scout.strengths ? ` · strengths ${scout.strengths}` : ''}
                    {scout.weaknesses ? ` · weaknesses ${scout.weaknesses}` : ''}
                    {scout.notes ? ` · ${scout.notes}` : ''}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled={!card}
              onClick={() => {
                const result = applyStudentUpdate(update.updateId, false);
                const cards = update.scouting?.cards.length ? ` Opponent cards kept: ${update.scouting.cards.length}.` : '';
                done(result.ok ? `Added. Filled: ${result.filled.join(', ') || 'nothing blank'}.${cards}` : `Could not add (${result.reason}).`);
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
                  const cards = update.scouting?.cards.length ? ` Opponent cards kept: ${update.scouting.cards.length}.` : '';
                  done(result.ok ? `Added. Belt and stripes approved.${cards}` : result.reason === 'not-allowed' ? 'Only a Coach seat or the owner can approve belt changes.' : `Could not add (${result.reason}).`);
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
