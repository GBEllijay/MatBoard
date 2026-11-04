import { useEffect, useState } from 'react';
import {
  acceptCoachCompetitionUpdate,
  competitionConflicts,
  competitionUpdateSentence,
  type MatchKeep,
} from '../lib/coachCompetitionUpdate';
import {
  acceptCoachRankUpdate,
  COACH_UPDATE_EVENT,
  dismissCoachRankUpdate,
  queueCoachUpdate,
  readCoachQueue,
  readUpdateLedger,
  removeQueuedUpdate,
  rankUpdateSentence,
  writeUpdateLedger,
  type CoachInboxPacket,
} from '../lib/coachRankUpdate';
import { parseProgressPacket } from '../lib/progress/format';
import { writeStudentGymLogo } from '../lib/studentGymMark';
import { assignStudentId, readStableStudentId } from '../lib/studentIdentity';
import { clearStudentInboxItem, pullStudentInbox, readInboxPass } from '../lib/studentInboxClient';
import { useStudentFile } from '../pages/student/chrome';

function matchingPacket(reportStudentId: string, packets: readonly CoachInboxPacket[]): CoachInboxPacket | null {
  const stable = readStableStudentId(localStorage);
  const studentId = reportStudentId === 'student-local' ? stable : reportStudentId;
  if (!studentId) return null;
  return packets.find((packet) => packet.studentId === studentId) ?? null;
}

/**
 * Shown when Student Edition opens and a coach rank update is waiting.
 * Accept writes My rank and a journal card. Dismiss leaves the file alone.
 */
export function CoachUpdateInbox() {
  const { report, commit } = useStudentFile();
  const [packets, setPackets] = useState<CoachInboxPacket[]>(() => readCoachQueue(localStorage));
  const [choices, setChoices] = useState<Record<number, MatchKeep>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    const reload = () => setPackets(readCoachQueue(localStorage));
    window.addEventListener(COACH_UPDATE_EVENT, reload);
    return () => window.removeEventListener(COACH_UPDATE_EVENT, reload);
  }, []);

  useEffect(() => {
    const pass = readInboxPass(localStorage);
    if (!pass) return;
    let alive = true;
    void pullStudentInbox(pass).then((result) => {
      if (!alive || !result.ok) return;
      for (const item of result.packets) {
        const parsed = parseProgressPacket(JSON.stringify(item));
        if (parsed.ok && (parsed.value.kind === 'coach-rank-update' || parsed.value.kind === 'coach-competition-update')) {
          queueCoachUpdate(localStorage, parsed.value);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const packet = matchingPacket(report.studentId, packets);
  if (!packet) return null;

  const finish = (kind: 'accept' | 'dismiss') => {
    let current = report;
    if (current.studentId !== packet.studentId) {
      const stable = readStableStudentId(localStorage);
      if (stable !== packet.studentId) {
        setNote('This update is for a different student ID.');
        return;
      }
      current = assignStudentId(current, stable);
    }
    const ledger = readUpdateLedger(localStorage);
    const result =
      kind === 'dismiss'
        ? dismissCoachRankUpdate(current, packet, ledger)
        : packet.kind === 'coach-rank-update'
          ? acceptCoachRankUpdate(current, packet, ledger)
          : acceptCoachCompetitionUpdate(current, packet, ledger, choices);
    if (result.applied && kind === 'accept') {
      commit(result.report);
      if (packet.gym?.logo) writeStudentGymLogo(packet.gym.logo);
    }
    if (result.applied || result.ledger !== ledger) writeUpdateLedger(localStorage, result.ledger);
    removeQueuedUpdate(localStorage, packet.updateId);
    const pass = readInboxPass(localStorage);
    if (pass) void clearStudentInboxItem(pass, packet.updateId);
    setNote('');
  };

  const conflicts = packet.kind === 'coach-competition-update' ? competitionConflicts(report, packet) : [];
  return (
    <section className="coach-update" aria-label="Coach update">
      <h2>From your coach</h2>
      <p>{packet.kind === 'coach-rank-update' ? rankUpdateSentence(packet) : competitionUpdateSentence(packet)}</p>
      {packet.kind === 'coach-rank-update' && packet.rankUpdate.note ? <p>{packet.rankUpdate.note}</p> : null}
      {packet.kind === 'coach-competition-update'
        ? packet.competitionUpdate.matches.map((match) => (
            <p key={`${match.opponent}-${match.result}-${match.method}`}>
              {match.opponent}: {match.result}
              {match.method ? ` by ${match.method}` : ''}
              {match.note ? `. ${match.note}` : ''}
            </p>
          ))
        : null}
      {conflicts.map((conflict) => (
        <fieldset key={conflict.index}>
          <legend>
            You already have {conflict.opponent} ({conflict.studentSummary}). Coach recorded {conflict.coachSummary}.
          </legend>
          <label>
            <input
              type="radio"
              name={`keep-${conflict.index}`}
              checked={(choices[conflict.index] ?? 'both') === 'mine'}
              onChange={() => setChoices((current) => ({ ...current, [conflict.index]: 'mine' }))}
            />
            Keep my match
          </label>
          <label>
            <input
              type="radio"
              name={`keep-${conflict.index}`}
              checked={(choices[conflict.index] ?? 'both') === 'both'}
              onChange={() => setChoices((current) => ({ ...current, [conflict.index]: 'both' }))}
            />
            Keep both
          </label>
        </fieldset>
      ))}
      {packet.gym?.name ? <p>{packet.gym.name}</p> : null}
      <p>
        {packet.kind === 'coach-rank-update'
          ? 'Accept adds this to My rank and a journal card. Dismiss leaves your rank and journal as they are. Your checklist is not changed.'
          : 'Accept adds this tournament and these matches. A match you already wrote stays. Dismiss leaves your results alone.'}
      </p>
      {note ? (
        <p role="alert">{note}</p>
      ) : null}
      <div className="coach-update__actions">
        <button type="button" className="ink-btn ink-btn--save" onClick={() => finish('accept')}>
          Accept
        </button>
        <button type="button" className="ink-btn" onClick={() => finish('dismiss')}>
          Dismiss
        </button>
      </div>
    </section>
  );
}
