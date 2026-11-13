import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  alertIds,
  arrivalToast,
  cardChangeLines,
  coachUpdateHeading,
  createInboxPoller,
  dismissPhotoNotices,
  markAlertsSeen,
  PHOTO_NOTICE_DISMISSED_KEY,
  PHOTO_SENT_KEY,
  photoNoticeToShow,
  readIdSet,
  ALERTS_SEEN_KEY,
  showStudentToast,
  takeFreshArrivals,
  type PullOutcome,
} from '../lib/studentAlerts';
import {
  clearStudentInboxItem,
  downloadFromInstructor,
  pullStudentInbox,
  readInboxPass,
  type PhotoDecision,
} from '../lib/studentInboxClient';
import { useStudentFile } from '../pages/student/chrome';
import { loadAssessments } from '../lib/studentAssessment';
import { AssessmentCompareD8, assessmentEntryFromScores } from './AssessmentCompareD8';

function matchingPackets(reportStudentId: string, packets: readonly CoachInboxPacket[]): CoachInboxPacket[] {
  const stable = readStableStudentId(localStorage);
  const studentId = reportStudentId === 'student-local' ? stable : reportStudentId;
  if (!studentId) return [];
  return packets.filter((packet) => packet.studentId === studentId);
}

/**
 * Shown when Student Edition opens and a coach rank update is waiting.
 * Accept writes My rank and a journal card. Dismiss leaves the file alone.
 */
export function CoachUpdateInbox() {
  const { report, commit } = useStudentFile();
  const [packets, setPackets] = useState<CoachInboxPacket[]>(() => readCoachQueue(localStorage));
  const [fromInstructor, setFromInstructor] = useState<{ name: string; path: string; dateKey: string }[]>([]);
  const [photoDecisions, setPhotoDecisions] = useState<PhotoDecision[]>([]);
  // Bumped when seen/dismissed markers change so the badge and notice re-read them.
  const [markerTick, setMarkerTick] = useState(0);
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
    let logoToast = false;
    const pull = async (): Promise<PullOutcome> => {
      const result = await pullStudentInbox(pass);
      if (!alive) return 'stop';
      if (!result.ok) return result.reason === 'denied' ? 'stop' : 'error';
      setFromInstructor(result.fromInstructor);
      setPhotoDecisions(result.photoDecisions);
      for (const item of result.packets) {
        const received = receiveSyncPacket(localStorage, item);
        // A gym logo is not an accept card. Once recorded, clear it from the inbox list.
        const updateId = item && typeof item === 'object' ? (item as { updateId?: unknown }).updateId : undefined;
        if ((received === 'logo-started' || received === 'logo-prompt') && typeof updateId === 'string') {
          void clearStudentInboxItem(pass, updateId);
        }
        if (received === 'logo-started') logoToast = true;
      }
      if (logoToast) {
        logoToast = false;
        showStudentToast('Gym logo updated');
      }
      return 'ok';
    };
    const poller = createInboxPoller({
      pull,
      isVisible: () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
      now: () => Date.now(),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (handle) => window.clearTimeout(handle as number),
    });
    const nudge = () => poller.nudge();
    document.addEventListener('visibilitychange', nudge);
    window.addEventListener('focus', nudge);
    window.addEventListener('online', nudge);
    poller.start();
    return () => {
      alive = false;
      poller.stop();
      document.removeEventListener('visibilitychange', nudge);
      window.removeEventListener('focus', nudge);
      window.removeEventListener('online', nudge);
    };
  }, []);

  const allowedPackets = useMemo(
    () => (sample ? [sample.packet] : matchingPackets(report.studentId, packets.filter((item) => gymPacketAllowed(localStorage, item)))),
    [sample, report.studentId, packets],
  );
  const packet = allowedPackets[0] ?? null;
  const photoNotice = useMemo(
    () =>
      sample
        ? null
        : photoNoticeToShow(photoDecisions, {
            sent: readIdSet(localStorage, PHOTO_SENT_KEY),
            dismissed: readIdSet(localStorage, PHOTO_NOTICE_DISMISSED_KEY),
            now: Date.now(),
          }),
    // markerTick re-reads the dismissed marker after Got it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sample, photoDecisions, markerTick],
  );
  const ids = useMemo(
    () =>
      alertIds({
        packets: allowedPackets,
        photoNotices: photoNotice ? [photoNotice] : [],
        files: fromInstructor,
      }),
    [allowedPackets, photoNotice, fromInstructor],
  );
  const unread = useMemo(() => {
    const seen = readIdSet(localStorage, ALERTS_SEEN_KEY);
    return ids.filter((id) => !seen.has(id)).length;
    // markerTick re-reads the seen marker after a tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, markerTick]);

  // Toast each new arrival once per profile, so a new update never just blinks in.
  useEffect(() => {
    if (sample || !ids.length) return;
    const fresh = takeFreshArrivals(localStorage, ids);
    if (fresh.length) showStudentToast(arrivalToast(fresh.length));
  }, [ids, sample]);

  const openUpdates = useCallback(() => {
    const node = document.getElementById('coach-updates');
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!sample) markAlertsSeen(localStorage, ids);
    setMarkerTick((tick) => tick + 1);
  }, [ids, sample]);

  const dismissPhoto = () => {
    if (!photoNotice) return;
    dismissPhotoNotices(localStorage, photoDecisions, photoNotice);
    markAlertsSeen(localStorage, [`photo:${photoNotice.photoId}`]);
    setMarkerTick((tick) => tick + 1);
  };
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
  const badgeNode =
    unread > 0 ? (
      <button
        type="button"
        className="student-alert-badge"
        aria-label={`${unread} new from your coach. Show updates`}
        onClick={openUpdates}
      >
        <span className="student-alert-badge__bell" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" focusable="false">
            <path
              d="M12 3a6 6 0 0 0-6 6v3.6L4.3 15.4A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.6L18 12.6V9a6 6 0 0 0-6-6Zm0 19a2.6 2.6 0 0 0 2.5-2h-5a2.6 2.6 0 0 0 2.5 2Z"
              fill="currentColor"
            />
          </svg>
        </span>
        <span className="student-alert-badge__count">{unread}</span>
        <span className="student-alert-badge__label">new</span>
      </button>
    ) : null;
  const photoNode = photoNotice ? (
    <section
      className={`coach-update coach-update--photo coach-update--${photoNotice.decision === 'approve' ? 'ok' : 'declined'}`}
      aria-label={photoNotice.title}
    >
      <p className="coach-update__kicker">Profile photo</p>
      <h2>{photoNotice.title}</h2>
      <p>{photoNotice.body}</p>
      <div className="coach-update__actions">
        <button type="button" className="ink-btn ink-btn--save" onClick={dismissPhoto}>
          Got it
        </button>
      </div>
    </section>
  ) : null;
  if (!packet && fromInstructor.length === 0) {
    if (!photoNode && !badgeNode) return cheerNode;
    return (
      <>
        {cheerNode}
        {badgeNode}
        <div id="coach-updates" className="coach-updates">
          {photoNode}
        </div>
      </>
    );
  }

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
    showStudentToast(accepted ? 'Saved to your card' : 'Dismissed');
  };

  const blueBirthYear = cleanBirthYear(blueYear);
  const blueNotes = blueStep
    ? blueBeltNotes({ birthYear: blueBirthYear, trainingSince: fileReport.profile.startedOn, self: true })
    : [];

  const conflicts = packet?.kind === 'coach-competition-update' ? competitionConflicts(report, packet) : [];
  const changeLines = packet ? cardChangeLines(packet) : [];
  const moreWaiting = Math.max(0, allowedPackets.length - 1);
  const pendingCoachEntry =
    packet?.kind === 'coach-assessment-update'
      ? assessmentEntryFromScores(packet.updateId, packet.assessment.date, packet.assessment.scores, packet.assessment.note)
      : null;
  return (
    <>
    {cheerNode}
    {badgeNode}
    <div id="coach-updates" className="coach-updates">
    {photoNode}
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
      <p className="coach-update__kicker">
        {moreWaiting ? `1 of ${allowedPackets.length} updates` : 'New update'}
      </p>
      <h2>{coachUpdateHeading(packet)}</h2>
      {changeLines.length ? (
        <ul className="coach-update__changes" aria-label="What changed">
          {changeLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {/* Rank and belt progress read fully from the change list above. */}
      {packet.kind === 'coach-rank-update' || packet.kind === 'coach-belt-progress-update' ? null : (
        <p>
          {packet.kind === 'coach-competition-update' ? competitionUpdateSentence(packet) : coachSyncSentence(packet)}
        </p>
      )}
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
    </div>
    </>
  );
}
