/**
 * Full instructor character sheet preview.
 * Fills the gap between the student profile and the owner identity card.
 * Fictional sample only. Memory state is not written to storage.
 */
import { useMemo, useState } from 'react';
import { BeltHeader } from '../../components/BeltHeader';
import { StaticDiamond } from '../../components/StaticDiamond';
import { InstructorIdentityCard } from '../instructorProfile/InstructorIdentityCard';
import {
  INSTRUCTOR,
  SAMPLE_WEEK_START,
  dayLabel,
  durationLabel,
  sampleClasses,
  samplePlan,
  weekDays,
  weekMinutes,
} from '../instructorProfile/model';
import '../instructorProfile/instructorProfile.css';
import {
  INSTRUCTOR_SHEET_BANNER,
  INSTRUCTOR_SHEET_PATH,
  STUDENT_PROFILE_D8,
  d8FaceRows,
  teachingLengthLabel,
} from './model';
import './instructorSheet.css';

const PLAN_BLOCKS = [
  ['Warm-up', '10 min'],
  ['Technique', '20 min'],
  ['Drilling', '15 min'],
  ['Live rounds', '15 min'],
] as const;

export function InstructorSheetPreviewPage() {
  const classes = useMemo(() => sampleClasses(), []);
  const plan = useMemo(() => samplePlan(), []);
  const week = weekMinutes(classes, SAMPLE_WEEK_START);
  const days = weekDays(SAMPLE_WEEK_START);
  const faces = d8FaceRows(STUDENT_PROFILE_D8.scores);
  const hasStudentProfile = STUDENT_PROFILE_D8.hasStudentProfile;
  // Product default is off. This sample starts on so the D8 is visible.
  const [showOwnD8, setShowOwnD8] = useState(true);
  const [notes, setNotes] = useState('');

  return (
    <main className="ip-preview">
      <p className="ip-banner" role="note" data-testid="preview-banner">
        {INSTRUCTOR_SHEET_BANNER}
      </p>
      <BeltHeader kind="brown" title="Instructor Edition" />
      <p className="ip-path" data-testid="preview-path">
        {INSTRUCTOR_SHEET_PATH}
      </p>
      <p className="ip-rec" data-testid="d8-recommendation">
        Recommendation: if an instructor also has a student profile, show their own D8 here as an optional section.
        Read it from that profile and do not copy it. Keep the section off until they turn it on.
      </p>

      <InstructorIdentityCard />

      <section className="ip-card" aria-label="Instructor profile" data-testid="instructor-profile">
        <h2>Instructor profile</h2>
        <dl className="ip-facts">
          <div>
            <dt>Teaching history</dt>
            <dd>
              Informal c. {INSTRUCTOR.teachingAroundYear} · official {INSTRUCTOR.officialStartYear}
            </dd>
          </div>
          <div>
            <dt>Length of time teaching</dt>
            <dd data-testid="profile-teaching-length">{teachingLengthLabel()}</dd>
          </div>
          <div>
            <dt>Programs taught</dt>
            <dd>{INSTRUCTOR.programs}</dd>
          </div>
          <div>
            <dt>Typical schedule</dt>
            <dd>3+ classes / week</dd>
          </div>
          <div>
            <dt>Certifications</dt>
            <dd>Write-in. None recorded in this example.</dd>
          </div>
        </dl>
      </section>

      <section className="ip-card" aria-label="Weekly teaching journal" data-testid="teaching-journal">
        <h2>Weekly teaching journal</h2>
        <p className="ip-week" data-testid="week-total">
          Week total (example): {classes.filter((row) => row.minutes > 0).length} classes · {week} min
        </p>
        <ul className="ip-days">
          {days.map((date) => {
            const rows = classes.filter((row) => row.date === date);
            return (
              <li key={date}>
                <span className="ip-day">{dayLabel(date)}</span>
                {rows.length === 0 ? (
                  <span className="ip-quiet">No class logged</span>
                ) : (
                  rows.map((row) => (
                    <span key={row.id} className="ip-class">
                      {row.name} · {durationLabel(row.minutes)}
                    </span>
                  ))
                )}
              </li>
            );
          })}
        </ul>
        <p className="ip-quiet">Sample week only. Rows are not written to a journal or lesson plan.</p>
      </section>

      <section className="ip-card" aria-label="Daily lesson plan" data-testid="lesson-plan">
        <h2>Daily lesson plan</h2>
        <p className="ip-quiet">
          {plan.name} · {plan.designation} · {plan.date}. Static example. This preview does not log hours or save a plan.
        </p>
        <ul className="ip-blocks">
          {PLAN_BLOCKS.map(([name, length]) => (
            <li key={name}>
              <span>{name}</span>
              <strong>{length}</strong>
            </li>
          ))}
        </ul>
        <p className="ip-quiet">Plan length: 60 min (example).</p>
      </section>

      <section className="ip-card" aria-label="Lineage">
        <h2>Lineage</h2>
        <p className="ip-quiet">Teaching ancestry, including this instructor. Fictional names for layout only.</p>
        <ol className="ip-list" data-testid="lineage-text">
          {INSTRUCTOR.lineage.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ol>
      </section>

      {hasStudentProfile ? (
        <section className="ip-card" aria-label="My own training" data-testid="own-training">
          <h2>My own training</h2>
          <p className="ip-quiet">{STUDENT_PROFILE_D8.source}</p>
          <button
            type="button"
            className="ip-switch"
            role="switch"
            aria-checked={showOwnD8}
            data-testid="own-d8-switch"
            onClick={() => setShowOwnD8((on) => !on)}
          >
            <span>Show my D8 from my student profile</span>
            <strong>{showOwnD8 ? 'On' : 'Off'}</strong>
          </button>
          {showOwnD8 ? (
            <div className="ip-d8" data-testid="own-d8">
              <p className="ip-quiet">Check-in {STUDENT_PROFILE_D8.date}. Eight faces from that student profile.</p>
              <StaticDiamond scores={STUDENT_PROFILE_D8.scores} />
              <ul className="ip-d8-scores" data-testid="own-d8-scores">
                {faces.map((face) => (
                  <li key={face.id}>
                    <span>{face.label}</span>
                    <strong>{face.value ?? '–'}</strong>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="ip-quiet" data-testid="own-d8-hidden">
              Hidden on this sheet. The scores stay on the student profile.
            </p>
          )}
        </section>
      ) : null}

      <section className="ip-card" aria-label="Notes">
        <h2>Notes</h2>
        <label className="ip-quiet" htmlFor="instructor-sheet-notes">
          Write-in for this preview only. Nothing is stored.
        </label>
        <textarea
          id="instructor-sheet-notes"
          data-testid="sheet-notes"
          rows={4}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </section>
    </main>
  );
}
