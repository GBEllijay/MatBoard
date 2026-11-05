import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ReplayAnalysisCard } from '../components/ReplayAnalysisCard';
import { PlayExitMark } from '../components/PlayExitMark';
import { useCurrentSeat } from '../components/SeatSessionBar';
import { useSubmenuBack } from '../hooks/useSubmenuBack';
import { COACH_LESSON_EYEBROW } from '../lib/coachCopy';
import { canCaptureReplay, isLiveSeat, seatMenuAllowed } from '../lib/instructorSeats';
import { RECORD_FOR_REVIEW_LABEL } from '../lib/competitionCurriculum';
import { loadStandaloneReview, saveStandaloneReview } from '../lib/recordForReviewStore';
import type { ReplayBlock } from '../lib/replayAnalysis';
import { localDateKey } from '../lib/trainingNotesStore';

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

  useEffect(() => {
    if (!blocked) saveStandaloneReview(replay);
  }, [blocked, replay]);

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
            Record or pick a clip, draw on it, and save it. This review stays on this device until you save a copy. It
            is not part of a daily lesson plan.
          </p>
          <ReplayAnalysisCard
            replay={replay}
            heading={RECORD_FOR_REVIEW_LABEL}
            dateKey={localDateKey()}
            readOnly={false}
            canCapture={canCapture}
            onChange={(patch) => setReplay((current) => ({ ...current, ...patch }))}
          />
        </>
      )}
    </main>
  );
}
