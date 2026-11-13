import { useEffect, useState } from 'react';
import { GrandmasterCheer } from './GrandmasterCheer';
import {
  acceptCoachBlueBelt,
  BLUE_BELT_CHEER_LINES,
  blueBeltNotes,
  blueBeltPreviewSample,
  bluePreviewRequested,
  claimBlueCheer,
  cleanBirthYear,
  isKidsToBlueUpdate,
} from '../lib/blueBeltCheer';
import { gymPacketAllowed } from '../lib/academyMembership';
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
  readCoachQueue,
  readUpdateLedger,
  removeQueuedUpdate,
  rankUpdateSentence,
  writeUpdateLedger,
  type CoachInboxPacket,
} from '../lib/coachRankUpdate';
import {
  acceptCoachSyncUpdate,
  coachStatusLabel,
  coachSyncSentence,
  readCoachOverlay,
  receiveSyncPacket,
  writeCoachOverlay,
} from '../lib/coachSync';
import { writeStudentGymLogo } from '../lib/studentGymMark';
import { assignStudentId, readStableStudentId } from '../lib/studentIdentity';
import { clearStudentInboxItem, downloadFromInstructor, pullStudentInbox, readInboxPass } from '../lib/studentInboxClient';
import { useStudentFile } from '../pages/student/chrome';
import { loadAssessments } from '../lib/studentAssessment';
import { AssessmentCompareD8, assessmentEntryFromScores } from './AssessmentCompareD8';

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
  const [fromInstructor, setFromInstructor] = useState<{ name: string; path: string; dateKey: string }[]>([]);
  const [choices, setChoices] = useState<Record<number, MatchKeep>>({});
  const [note, setNote] = useState('');
  // Kids belt → Blue from the coach: confirm the belt and birth year first.
  const [blueStep, setBlueStep] = useState(false);
  const [blueYear, setBlueYear] = useState('');
  const [cheer, setCheer] = useState(false);
  const [sample, setSample] = useState(() =>
    typeof window !== 'undefined' && bluePreviewRequested(window.location.search) ? blueBeltPreviewSample() : null,
  );

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
      setFromInstructor(result.fromInstructor);
      for (const item of result.packets) {
        const received = receiveSyncPacket(localStorage, item);
        // A gym logo is not an accept card. Once recorded, clear it from the inbox list.
        const updateId = item && typeof item === 'object' ? (item as { updateId?: unknown }).updateId : undefined;
        if ((received === 'logo-started' || received === 'logo-prompt') && typeof updateId === 'string') {
          void clearStudentInboxItem(pass, updateId);
        }
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const packet = sample
    ? sample.packet
    : matchingPacket(
        report.studentId,
        packets.filter((item) => gymPacketAllowed(localStorage, item)),
      );
  const fileReport = sample ? sample.report : report;
  const kidsToBlue = packet ? isKidsToBlueUpdate(fileReport, packet) : false;
  const downloadInstructorFile = (path: string, name: string) => {
    const pass = readInboxPass(localStorage);
    if (!pass) return;
    void downloadFromInstructor(pass, path).then((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const cheerNode = cheer ? (
    <GrandmasterCheer lines={BLUE_BELT_CHEER_LINES} onDismiss={() => setCheer(false)} />
  ) : null;
  if (!packet && fromInstructor.length === 0) return cheerNode;

  const openBlueStep = () => {
    const saved = fileReport.beltBook?.birthYear;
    setBlueYear(saved != null ? String(saved) : '');
    setBlueStep(true);
  };

  const finish = (kind: 'accept' | 'dismiss' | 'confirm-blue') => {
    if (!packet) return;
    if (kind === 'accept' && kidsToBlue) {
      openBlueStep();
      return;
    }
    if (sample) {
      // Preview link: nothing is written. Confirm shows the cheer once.
      setSample(null);
      setBlueStep(false);
      if (kind === 'confirm-blue') setCheer(true);
      return;
    }
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
    let result: { report: typeof current; ledger: typeof ledger; applied: boolean };
    let cheerNow = false;
    if (kind === 'confirm-blue' && packet.kind === 'coach-rank-update') {
      const blue = acceptCoachBlueBelt(current, packet, ledger, { birthYear: cleanBirthYear(blueYear) });
      result = blue;
      cheerNow = blue.cheer && claimBlueCheer(localStorage, current.studentId, packet.updateId);
    } else if (kind === 'confirm-blue') {
      return;
    } else if (kind === 'dismiss') {
      result = dismissCoachRankUpdate(current, packet, ledger);
    } else if (packet.kind === 'coach-rank-update') {
      result = acceptCoachRankUpdate(current, packet, ledger);
    } else if (packet.kind === 'coach-competition-update') {
      result = acceptCoachCompetitionUpdate(current, packet, ledger, choices);
    } else {
      // Belt progress and assessments go to the coach overlay only. A coach note also appends a labeled journal block.
      const synced = acceptCoachSyncUpdate(current, packet, ledger, readCoachOverlay(localStorage));
      if (synced.applied) writeCoachOverlay(localStorage, synced.overlay);
      result = { report: synced.report, ledger: synced.ledger, applied: synced.applied };
    }
    const accepted = kind === 'accept' || kind === 'confirm-blue';
    if (result.applied && accepted && result.report !== current) {
      commit(result.report);
    }
    if (result.applied && accepted) {
      if (packet.gym?.logo) writeStudentGymLogo(packet.gym.logo);
    }
    if (result.applied || result.ledger !== ledger) writeUpdateLedger(localStorage, result.ledger);
    removeQueuedUpdate(localStorage, packet.updateId);
    const pass = readInboxPass(localStorage);
    if (pass) void clearStudentInboxItem(pass, packet.updateId);
    setNote('');
    setBlueStep(false);
    if (cheerNow) setCheer(true);
  };

  const blueBirthYear = cleanBirthYear(blueYear);
  const blueNotes = blueStep
    ? blueBeltNotes({ birthYear: blueBirthYear, trainingSince: fileReport.profile.startedOn, self: true })
    : [];

  const conflicts = packet?.kind === 'coach-competition-update' ? competitionConflicts(report, packet) : [];
  const pendingCoachEntry =
    packet?.kind === 'coach-assessment-update'
      ? assessmentEntryFromScores(packet.updateId, packet.assessment.date, packet.assessment.scores, packet.assessment.note)
      : null;
  return (
    <>
    {cheerNode}
    {fromInstructor.length ? (
      <section className="coach-update" aria-label="From your instructor">
        <h2>From your instructor</h2>
        <ul>
          {fromInstructor.map((file) => (
            <li key={file.path}>
              <span>
                {file.dateKey} · {file.name}
              </span>
              <button type="button" onClick={() => downloadInstructorFile(file.path, file.name)}>
                Download
              </button>
            </li>
          ))}
        </ul>
      </section>
    ) : null}
    {packet ? (
    <section className="coach-update" aria-label="Coach update">
      <h2>From your coach</h2>
      <p>
        {packet.kind === 'coach-rank-update'
          ? rankUpdateSentence(packet)
          : packet.kind === 'coach-competition-update'
            ? competitionUpdateSentence(packet)
            : coachSyncSentence(packet)}
      </p>
      {packet.kind === 'coach-belt-progress-update'
        ? packet.beltProgress.benchmarks.map((mark) => (
            <p key={mark.targetId}>
              {mark.name}: {coachStatusLabel(mark.coachStatus)}
              {mark.note ? `. ${mark.note}` : ''}
            </p>
          ))
        : null}
      {packet.kind === 'coach-assessment-update' && packet.assessment.note ? <p>{packet.assessment.note}</p> : null}
      {packet.kind === 'coach-assessment-update' && pendingCoachEntry ? (
        <AssessmentCompareD8 coachEntries={[pendingCoachEntry]} selfEntries={loadAssessments(localStorage).entries} />
      ) : null}
      {packet.kind === 'coach-note-update' ? <p>{packet.coachNote.note}</p> : null}
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
          : packet.kind === 'coach-competition-update'
            ? 'Accept adds this tournament and these matches. A match you already wrote stays. Dismiss leaves your results alone.'
            : "Accept keeps your coach's view beside your own. Your checklist, marks, and self-assessment are not changed."}
      </p>
      {note ? (
        <p role="alert">{note}</p>
      ) : null}
      {sample ? <p className="student-quiet">Preview: sample student and sample coach update. Nothing is saved.</p> : null}
      {blueStep ? (
        <fieldset className="blue-belt-confirm" aria-label="Confirm your blue belt">
          <legend>Your coach promoted you to Blue belt</legend>
          <p>
            Confirm your new belt and your birth year. Your kids belts move to Earlier belts, and your adult belt starts
            on {packet.kind === 'coach-rank-update' ? packet.rankUpdate.promotionDate : 'the promotion date'}.
          </p>
          <p>New belt: Blue</p>
          <label>
            Birth year
            <input
              aria-label="Birth year"
              inputMode="numeric"
              value={blueYear}
              placeholder="YYYY"
              maxLength={4}
              onChange={(event) => setBlueYear(event.target.value)}
            />
          </label>
          {blueNotes.map((line) => (
            <p key={line} className="blue-belt-confirm__note">
              {line}
            </p>
          ))}
          <div className="coach-update__actions">
            <button
              type="button"
              className="ink-btn ink-btn--save"
              disabled={blueBirthYear == null}
              onClick={() => finish('confirm-blue')}
            >
              {blueBirthYear == null ? 'Add your birth year' : `Confirm Blue belt, born ${blueBirthYear}`}
            </button>
            <button type="button" className="ink-btn" onClick={() => setBlueStep(false)}>
              Not yet
            </button>
          </div>
        </fieldset>
      ) : (
      <div className="coach-update__actions">
        <button type="button" className="ink-btn ink-btn--save" onClick={() => finish('accept')}>
          {kidsToBlue ? 'Accept blue belt' : 'Accept'}
        </button>
        <button type="button" className="ink-btn" onClick={() => finish('dismiss')}>
          Dismiss
        </button>
      </div>
      )}
    </section>
    ) : null}
    </>
  );
}
