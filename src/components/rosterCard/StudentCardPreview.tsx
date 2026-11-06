/**
 * Student Edition: the dismissible card preview after Save profile.
 * Read-only. Coach data comes from #392's accepted coach overlay (readCoachOverlay);
 * the look follows the gym via the newest accepted coach update (studentCardLook).
 * Nothing here sends or changes coach data.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Sheet } from '../Sheet';
import { CoachClipboardCard, type AssessmentView } from './CoachClipboardCard';
import { benchmarkView } from '../../lib/studentBenchmarks';
import { assessmentSummary, benchmarkItems, cardBelt, cardDate, dateFacts, initialsOf, promotionDates } from '../../lib/rosterCard';
import { readCoachOverlay, type CoachOverlay, type CoachOverlayNote } from '../../lib/coachSync';
import { studentCardLook } from '../../lib/cardLook';
import { currentBeltCheckpoints } from '../../lib/rosterCardSync';
import { loadAssessments, type AssessmentEntry, type AssessmentScores } from '../../lib/studentAssessment';
import { readStudentNoPhotos } from '../../lib/studentPhotoFlag';
import { readStudentOutbox } from '../../lib/studentEvents';
import type { StudentProgressReport } from '../../lib/progress/types';
import { MatHoursStat } from '../../pages/student/MatTime';
import './coachClipboard.css';

/** Newest accepted coach note, or null. Accept order breaks ties on the same day. */
export function latestCoachNote(overlay: Pick<CoachOverlay, 'notes'>): CoachOverlayNote | null {
  let best: CoachOverlayNote | null = null;
  for (const row of overlay.notes) if (!best || row.issuedOn >= best.issuedOn) best = row;
  return best;
}

export function coachEntriesFromOverlay(overlay: Pick<CoachOverlay, 'assessments'>): AssessmentEntry[] {
  return overlay.assessments.map((row) => ({
    id: row.updateId,
    date: row.date,
    note: row.note,
    scores: row.scores as AssessmentScores,
  }));
}

export function StudentCardPreview({
  open,
  report,
  portrait,
  logo,
  onClose,
  to,
}: {
  open: boolean;
  report: StudentProgressReport;
  portrait: string | null;
  logo: string | null;
  onClose: () => void;
  /** Student path builder (keeps ?student=). */
  to: (path: string) => string;
}) {
  const [view, setView] = useState<AssessmentView>('coach');
  const overlay = useMemo(() => (open ? readCoachOverlay(localStorage) : null), [open]);
  if (!open || !overlay) return null;
  const look = studentCardLook([...overlay.assessments, ...overlay.notes]);
  const noPhotos = readStudentNoPhotos(localStorage);
  const name = report.profile.displayName.trim() || 'Your name';
  const belt = cardBelt(report);
  const dates = dateFacts(promotionDates(report));
  const coach = coachEntriesFromOverlay(overlay);
  const self = loadAssessments(localStorage).entries;
  const summary = assessmentSummary(coach, self, view);
  const checkpoints = currentBeltCheckpoints(report);
  const coachBelt = overlay.beltProgress[report.profile.belt];
  const coachChecks = coachBelt
    ? Object.fromEntries(coachBelt.benchmarks.map((mark) => [mark.targetId, mark.coachStatus === 'ready']))
    : null;
  const bench = benchmarkItems(checkpoints, coachChecks);
  const latest = latestCoachNote(overlay);
  const gymName = report.profile.gymName.trim() || latest?.gymName || '';
  const registered = readStudentOutbox(localStorage)
    .map((row) => row.event)
    .sort((a, b) => (a.date < b.date ? 1 : -1))[0];

  return (
    <Sheet open={open} title="Your card" onClose={onClose} portal className="sheet--clipboard">
      <div className="student-card-preview" data-testid="student-card-preview">
        <CoachClipboardCard
          mode="student"
          look={look}
          kicker="Student card · preview"
          name={name}
          photo={{
            src: noPhotos.on ? '' : portrait ?? '',
            initials: initialsOf(name),
            pending: false,
            noPhotos: noPhotos.on ? { on: true, setBy: 'family', locked: true } : undefined,
          }}
          gymName={gymName}
          gymLogo={logo}
          belt={belt}
          beltLine={belt.meta}
          dates={dates}
          startedOn={report.profile.startedOn}
          trainingStyle={benchmarkView(report).trainingStyle}
          assessment={summary}
          assessmentView={view}
          onAssessmentView={setView}
          coachAssessments={coach}
          benchmarks={{
            ...bench,
            beltLabel: belt.label,
            source: coachBelt ? `Coach view · ${cardDate(coachBelt.issuedOn)}` : '',
          }}
          benchmarkSync={Boolean(coachBelt)}
          benchmarkEmpty={<p className="clipboard__empty">Your belt benchmarks show here.</p>}
          notesLabel="Suggestions from coach"
          notes={
            overlay.notes.length ? (
              <div>
                {[...overlay.notes].reverse().map((row) => (
                  <p key={row.updateId} className="clipboard__note">
                    {row.note} <small>· {cardDate(row.journalDate)}</small>
                  </p>
                ))}
                <p className="clipboard__empty">
                  Copies are yours to edit: <Link to={to('/student/belt')}>Copy to my personal goals</Link>.
                </p>
              </div>
            ) : (
              <p className="clipboard__empty">No suggestions from your coach yet.</p>
            )
          }
          extras={
            <>
              <MatHoursStat report={report} />
              <div data-testid="latest-from-coach">
                <strong>Latest from coach</strong>{' '}
                {latest ? (
                  <>
                    {cardDate(latest.issuedOn)} · <Link to={to(`/student/calendar/${latest.journalDate}`)}>Open journal day</Link>
                  </>
                ) : (
                  <span className="clipboard__empty">Nothing accepted yet.</span>
                )}
              </div>
              {registered ? (
                <p className="clipboard__notice" data-testid="student-registered">
                  Registered: {registered.eventName}, {cardDate(registered.date) || registered.date}
                </p>
              ) : null}
            </>
          }
          footer="Preview · your coach's card can differ. Coach notes you have not accepted do not show."
        />
        <button type="button" className="ink-btn" onClick={onClose}>
          Close preview
        </button>
      </div>
    </Sheet>
  );
}
