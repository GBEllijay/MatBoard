import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReplayAnalysisCard } from '../components/ReplayAnalysisCard';
import { ReviewJournalLibrary } from '../components/ReviewJournalLibrary';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import { COACH_LESSON_EYEBROW } from '../lib/coachCopy';
import { canCaptureReplay, isLiveSeat, seatMenuAllowed } from '../lib/instructorSeats';
import { RECORD_FOR_REVIEW_LABEL } from '../lib/competitionCurriculum';
import { loadStandaloneReview, saveStandaloneReview } from '../lib/recordForReviewStore';
import type { ReplayBlock } from '../lib/replayAnalysis';
import {
  addStandaloneReviewToJournalLibrary,
  attachReviewName,
  markReviewInLibrary,
  type AttachReviewNameResult,
} from '../lib/reviewIndexLink';
import { originCanStore } from '../lib/storageQuota';
import { putFilmBlob } from '../lib/studentFilm';
import { loadStudentReport, saveStudentReport } from '../lib/studentEdition';
import { localDateKey } from '../lib/trainingNotesStore';
import { OwnerGatedSend } from '../components/OwnerGatedSend';
import { distributionApprovalRequired, isKidCard, type DistributionTarget } from '../lib/ownerGatedDistribution';
import { getRoster } from '../lib/rosterStore';
import { availableReplaySaveTargets } from '../lib/replaySave';

function applyReplayPatch(current: ReplayBlock, patch: Partial<Omit<ReplayBlock, 'id'>>): ReplayBlock {
  const next: ReplayBlock = { ...current, ...patch, id: current.id };
  if (Object.prototype.hasOwnProperty.call(patch, 'indexLink') && patch.indexLink == null) delete next.indexLink;
  if (Object.prototype.hasOwnProperty.call(patch, 'journalLibrary') && patch.journalLibrary == null) delete next.journalLibrary;
  return next;
}

/**
 * Record for Review on its own. Same card as a Daily Lesson Plan block.
 * Its clip is stored under the standalone key, not inside a lesson plan.
 */
export function RecordForReviewPage() {
  const navigate = useNavigate();
  const seat = useCurrentSeat();
  const back = useSubmenuBack() ?? '/coach';
  const lessonMenu = seatMenuAllowed(seat, 'dailyLessonPlanAccess');
  const blocked = isLiveSeat(seat) && !lessonMenu;
  const canCapture = canCaptureReplay({ owner: true, seat });
  const [replay, setReplay] = useState<ReplayBlock>(() => loadStandaloneReview());
  const [report, setReport] = useState(() => loadStudentReport(localStorage));
  const [libraryTick, setLibraryTick] = useState(0);
  const replayRef = useRef(replay);
  replayRef.current = replay;
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    if (!blocked) saveStandaloneReview(replay);
  }, [blocked, replay]);

  const addFundamental = (categoryId: string, name: string): AttachReviewNameResult => {
    const result = attachReviewName(reportRef.current, categoryId, name);
    if (!result.link || !result.added) return result;
    try {
      const saved = saveStudentReport(localStorage, result.report);
      reportRef.current = saved;
      setReport(saved);
      return { ...result, report: saved };
    } catch (error) {
      return {
        report: reportRef.current,
        link: null,
        added: false,
        error: error instanceof Error ? error.message : 'Could not save that fundamental.',
      };
    }
  };

  const addToLibrary = async (blob: Blob) => {
    const current = replayRef.current;
    const clipLocalId = current.clip?.localId ?? '';
    const result = await addStandaloneReviewToJournalLibrary(current, blob, localDateKey(), localStorage, {
      canStore: originCanStore,
      putBlob: putFilmBlob,
    });
    if (!result.ok) return result.error;
    setReplay((prev) => markReviewInLibrary(prev, result.filmId, clipLocalId));
    setLibraryTick((value) => value + 1);
    return result.message;
  };

  const rosterTargets: DistributionTarget[] = getRoster().students.map((student) => ({
    studentId: student.id,
    name: student.name,
    kidCard: isKidCard({ belt: student.belt }),
    division: student.division || '',
  }));
  const saveTargets = availableReplaySaveTargets();

  return (
    <main className="notes">
      <PlayExitMark
        to={back}
        onExit={() => {
          navigate(back);
        }}
      />
      <header className="notes__bar">
        <div className="notes__brand">
          <p className="notes__eyebrow">{COACH_LESSON_EYEBROW}</p>
          <h1>{RECORD_FOR_REVIEW_LABEL}</h1>
        </div>
      </header>
      {blocked ? (
        <p className="notes__lead">This seat does not include the daily lesson plan.</p>
      ) : (
        <>
          <p className="notes__lead">
            Record or pick a clip, draw on it, and save it. Pick the fundamental from the index, or add a new name.
            Add the clip to the journal video library when you want it there, then search that library and review a
            clip. This review stays on this device until you save a copy. It is not part of a daily lesson plan.
          </p>
          <ReplayAnalysisCard
            replay={replay}
            heading={RECORD_FOR_REVIEW_LABEL}
            dateKey={localDateKey()}
            readOnly={false}
            canCapture={canCapture}
            linkIndex={{ report, onAdd: addFundamental }}
            journalLibrary={{ onAdd: addToLibrary }}
            onChange={(patch) => setReplay((current) => applyReplayPatch(current, patch))}
          />
          {rosterTargets.length ? (
            <OwnerGatedSend
              roster={rosterTargets}
              storage={localStorage}
              approvalRequired={distributionApprovalRequired(localStorage)}
              title={replay.title || replay.indexLink?.name || 'Record for Review'}
              lesson={replay.indexLink?.name || ''}
              dateKey={localDateKey()}
              media={
                replay.clip
                  ? {
                      ref: replay.clip.localId || replay.id,
                      fileName: replay.clip.name || 'review.mp4',
                      mime: replay.clip.mime || 'video/mp4',
                      size: replay.clip.size || 0,
                    }
                  : null
              }
              availableHomes={{
                googleDrive: saveTargets.includes('google-drive'),
                oneDrive: saveTargets.includes('onedrive'),
              }}
            />
          ) : null}
          <ReviewJournalLibrary tick={libraryTick} />
        </>
      )}
    </main>
  );
}
