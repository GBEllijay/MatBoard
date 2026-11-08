import { useMemo, useState } from 'react';
import { BeltHeader } from '../../components/BeltHeader';
import { WheelPicker } from '../../components/WheelPicker';
import {
  DOCUMENT_FIELDS,
  INSTRUCTOR,
  PREVIEW_BANNER,
  PREVIEW_PATH,
  PREVIEW_YEAR,
  SAMPLE_WEEK_START,
  SHEET_TITLE,
  combinedHours,
  dayLabel,
  durationLabel,
  estimatedClasses,
  estimatedHours,
  formatHourCount,
  instructionBackupPreview,
  listedUpdates,
  logLessonHours,
  loggedClassCount,
  loggedMinutesTotal,
  planLog,
  previewInstructionRestore,
  profilePolicyLines,
  sampleClasses,
  sampleEstimate,
  samplePlan,
  sampleUpdates,
  setClassMinutes,
  statusLabel,
  studentIdentity,
  teachingDurationOptions,
  teachingTallies,
  teachingYears,
  weekDays,
  weekMinutes,
  type EstimateInput,
  type TeachingClass,
} from './model';
import './instructorProfile.css';

const DURATION_OPTIONS = teachingDurationOptions();
const POLICY = profilePolicyLines();
const PLAN_BLOCKS = [
  ['Warm-up', '10 min'],
  ['Technique', '20 min'],
  ['Drilling', '15 min'],
  ['Live rounds', '15 min'],
] as const;

export function InstructorProfilePreviewPage() {
  const updates = useMemo(() => sampleUpdates(), []);
  const listed = useMemo(() => listedUpdates(updates), [updates]);
  const tallies = useMemo(() => teachingTallies(updates), [updates]);
  const plan = useMemo(() => samplePlan(), []);
  const identity = useMemo(() => studentIdentity(), []);
  const [lineageOn, setLineageOn] = useState(true);
  const [classes, setClasses] = useState<TeachingClass[]>(() => sampleClasses());
  const [planMinutes, setPlanMinutes] = useState(60);
  const [estimate, setEstimate] = useState<EstimateInput>(() => sampleEstimate());
  const [officialStart, setOfficialStart] = useState<number>(INSTRUCTOR.officialStartYear);
  const [notes, setNotes] = useState('');
  const [logNote, setLogNote] = useState('Not logged yet.');
  const [backupNote, setBackupNote] = useState('No instruction backup has been built. Nothing is downloaded.');
  const [restoreNote, setRestoreNote] = useState('');

  const logged = planLog(classes, plan.planId, plan.date);
  const week = weekMinutes(classes, SAMPLE_WEEK_START);
  const loggedTotal = loggedMinutesTotal(classes);
  const years = teachingYears(estimate.teachingAroundYear);
  const classEstimate = estimatedClasses(estimate);
  const hourEstimate = estimatedHours(classEstimate, estimate.minutesPerClass);
  const combined = combinedHours(hourEstimate, loggedTotal);
  const hourAssumption = estimate.minutesPerClass === 60 && classEstimate === 2028;

  const applyPlanMinutes = (minutes: number, fromButton: boolean) => {
    setPlanMinutes(minutes);
    const already = planLog(classes, plan.planId, plan.date);
    if (!already && !fromButton) return;
    const result = logLessonHours(classes, { ...plan, minutes });
    setClasses(result.classes);
    if (result.outcome === 'added') setLogNote('Logged once for this plan and day.');
    else if (result.outcome === 'replaced') setLogNote('Duration replaced. The logged total uses the new length.');
    else if (result.outcome === 'removed') setLogNote('Untimed. This class is off the teaching total.');
    else if (fromButton) setLogNote('Already logged at this length. Not counted twice.');
  };

  const showBackup = () => {
    const file = instructionBackupPreview({
      estimate,
      classes,
      notes,
      stripesGiven: tallies.stripes,
      promotionsGiven: tallies.belts,
    });
    setBackupNote(`Preview only. Kind ${file.advantage}. Not downloaded and not saved. Logged minutes in that preview: ${file.loggedMinutes}.`);
    setRestoreNote('');
  };

  const showRestore = (raw: string) => {
    const result = previewInstructionRestore(raw, identity);
    setRestoreNote(`${result.title}. ${result.detail}`);
  };

  return (
    <main className="ip-preview">
      <p className="ip-banner" role="note" data-testid="preview-banner">
        {PREVIEW_BANNER}
      </p>
      <BeltHeader kind="brown" title="Instructor Edition" />
      <p className="ip-path" data-testid="preview-path">
        {PREVIEW_PATH}
      </p>

      <section className="ip-sheet" aria-label="Instructor stat card" data-testid="stat-card">
        <header className="ip-sheet__head">
          <p className="ip-kicker">Advantage · Instructor Edition</p>
          <h1 data-testid="sheet-title">{SHEET_TITLE}</h1>
          <p className="ip-quiet">Teaching profile · fictional example. Same person as the student profile.</p>
        </header>
        <div className="ip-id">
          <p>
            <span>Instructor name</span>
            <strong>{INSTRUCTOR.name}</strong>
          </p>
          <p>
            <span>Academy</span>
            <strong>{INSTRUCTOR.gym}</strong>
          </p>
          <p>
            <span>Belt</span>
            <strong>{INSTRUCTOR.belt}</strong>
          </p>
          <p className="ip-since" data-testid="teaching-since">
            <span>Started instructing</span>
            <strong>c. {INSTRUCTOR.teachingAroundYear}</strong>
            <em>Official: {officialStart}</em>
          </p>
        </div>
        <p className="ip-quiet">
          Training start {INSTRUCTOR.startedOn} stays on the student profile. It is not when instructing started. A black belt is not a requirement.
        </p>
        <div className="ip-hours" data-testid="teaching-hours">
          <div>
            <span>Combined teaching hours (example)</span>
            <strong data-testid="combined-hours">{formatHourCount(combined)} h</strong>
            <small>
              = {formatHourCount(hourEstimate)} h pre-app estimate + {formatHourCount(loggedTotal / 60)} h logged
            </small>
          </div>
          <div>
            <span>Pre-app estimate</span>
            <strong data-testid="estimated-classes">{formatHourCount(classEstimate)}</strong>
            <small>classes · {formatHourCount(hourEstimate)} h at this example length</small>
          </div>
          <div>
            <span>Logged in Advantage</span>
            <strong data-testid="logged-hours">{loggedClassCount(classes)}</strong>
            <small>classes · {formatHourCount(loggedTotal / 60)} h logged</small>
          </div>
        </div>
        <p className="ip-quiet" data-testid="estimate-formula">
          {years} years ({PREVIEW_YEAR} − {estimate.teachingAroundYear}) × {estimate.activeWeeksPerYear} weeks × {estimate.classesPerWeek} classes = {classEstimate} estimated classes.
          {hourAssumption ? ' 2,028 hours only under the 1 hour assumption.' : ' Hours follow the example class length.'} Official start {officialStart} is not in that formula. The estimate ends when logging begins, so those weeks are not in both numbers.
        </p>
        <div className="ip-side">
          <div>
            <span>Classes / week</span>
            <strong>3+</strong>
            <small>Sample minimum. This week {classes.filter((row) => weekDays(SAMPLE_WEEK_START).includes(row.date) && row.minutes > 0).length} logged.</small>
          </div>
          <p data-testid="stripes-given">
            <span>Stripes given</span>
            <strong>{tallies.stripes}</strong>
          </p>
          <p data-testid="belts-given">
            <span>Promotions given</span>
            <strong>{tallies.belts}</strong>
          </p>
        </div>
        <p className="ip-quiet">Completed only. Pending and declined are not counted. A retry of the same promotion counts once. Fictional totals.</p>
      </section>

      <section className="ip-card" aria-label="Sample daily lesson plan" data-testid="lesson-plan">
        <h2>Daily lesson plan</h2>
        <p className="ip-quiet">
          {plan.name} · {plan.designation} · {plan.date}. Next after the stat card, the way the student home opens on the belt and then the sheet. The live plan at /notes has Save, Submit for review, and Upload for instructor distribution. It has I taught this. It does not have Log hours.
        </p>
        <ul className="ip-blocks">
          {PLAN_BLOCKS.map(([name, length]) => (
            <li key={name}>
              <span>{name}</span>
              <span>{length}</span>
            </li>
          ))}
        </ul>
        <p className="ip-quiet">Those four lengths are the sheet’s example and add to 60 minutes. They are not the live Expected Duration wheel. Log hours uses the student 15-minute wheel.</p>
        <div className="ip-log">
          <WheelPicker label="Class length" value={planMinutes} options={DURATION_OPTIONS} onChange={(minutes) => applyPlanMinutes(minutes, false)} />
          <button type="button" className="ip-log-btn" data-testid="log-hours" onClick={() => applyPlanMinutes(planMinutes, true)}>
            Log hours
          </button>
          <p role="status" data-testid="log-note">
            {logNote} Current length {durationLabel(planMinutes)}.
            {logged ? ` Recorded ${durationLabel(logged.minutes)}.` : ''}
          </p>
        </div>
      </section>

      <section className="ip-card" aria-label="Teaching journal">
        <h2>Weekly teaching journal</h2>
        <p className="ip-week" data-testid="week-total">
          Week of {SAMPLE_WEEK_START}: <strong>{week} min</strong>
        </p>
        <ul className="ip-days">
          {weekDays(SAMPLE_WEEK_START).map((date) => {
            const rows = classes.filter((row) => row.date === date);
            return (
              <li key={date}>
                <span className="ip-day">{dayLabel(date)}</span>
                {rows.length === 0 ? (
                  <span className="ip-quiet">No class logged</span>
                ) : (
                  rows.map((row) => (
                    <label key={row.id} className="ip-class">
                      <span>{row.name}</span>
                      <select
                        aria-label={`${row.name} duration`}
                        value={row.minutes}
                        onChange={(event) => {
                          const minutes = Number(event.target.value);
                          setClasses((current) => setClassMinutes(current, row.id, minutes));
                          if (row.planId === plan.planId) setPlanMinutes(minutes);
                        }}
                      >
                        {DURATION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))
                )}
              </li>
            );
          })}
        </ul>
        <div className="ip-estimate">
          <label>
            Teaching around
            <input
              aria-label="Teaching around"
              inputMode="numeric"
              value={estimate.teachingAroundYear}
              onChange={(event) => {
                const teachingAroundYear = Number(event.target.value);
                if (Number.isFinite(teachingAroundYear)) setEstimate((current) => ({ ...current, teachingAroundYear }));
              }}
            />
          </label>
          <label>
            Official start
            <input
              aria-label="Official start"
              inputMode="numeric"
              data-testid="official-start"
              value={officialStart}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (Number.isFinite(next)) setOfficialStart(next);
              }}
            />
          </label>
          <label>
            Classes a week
            <input
              aria-label="Classes a week"
              inputMode="numeric"
              value={estimate.classesPerWeek}
              onChange={(event) => {
                const classesPerWeek = Number(event.target.value);
                if (Number.isFinite(classesPerWeek)) setEstimate((current) => ({ ...current, classesPerWeek }));
              }}
            />
          </label>
          <label>
            Active weeks a year
            <input
              aria-label="Active weeks a year"
              inputMode="numeric"
              data-testid="active-weeks"
              value={estimate.activeWeeksPerYear}
              onChange={(event) => {
                const activeWeeksPerYear = Number(event.target.value);
                if (Number.isFinite(activeWeeksPerYear)) setEstimate((current) => ({ ...current, activeWeeksPerYear }));
              }}
            />
          </label>
          <div>
            <span className="ip-field-label">Example class length</span>
            <WheelPicker
              label="Example class length"
              value={estimate.minutesPerClass}
              options={DURATION_OPTIONS}
              onChange={(minutesPerClass) => setEstimate((current) => ({ ...current, minutesPerClass }))}
            />
          </div>
        </div>
      </section>

      <section className="ip-card" aria-label="Lineage">
        <h2>Lineage</h2>
        <p className="ip-quiet">Teaching ancestry, including this instructor. Not a list of students. Not the academy founding line. Hiding it does not delete it. No black-belt prerequisite.</p>
        <button type="button" className="ip-switch" role="switch" aria-checked={lineageOn} data-testid="lineage-switch" onClick={() => setLineageOn((on) => !on)}>
          <span>Show lineage</span>
          <span>{lineageOn ? 'On' : 'Off'}</span>
        </button>
        {lineageOn ? (
          <ol className="ip-list" data-testid="lineage-text">
            {INSTRUCTOR.lineage.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ol>
        ) : (
          <p data-testid="lineage-hidden">Hidden on this sheet.</p>
        )}
      </section>

      <section className="ip-card" aria-label="Promotion updates">
        <h2>Promotion updates</h2>
        <p className="ip-quiet">
          Sample rows from the stat sheet, plus other completed fiction so the card can read 24 and 7. Today a coach rank update is one packet. The student accepts or dismisses it. A parent gate can hold a packet only when that gate is already on. It defaults off, and its switch is not on Student Edition pages. It is not automatically on for minors or off for adults. Nothing here was sent.
        </p>
        <ul className="ip-updates">
          {listed.map((row) => (
            <li key={row.id} data-testid="update-row" data-status={row.status} data-parent={row.parentGateOn ? 'on' : 'off'}>
              <span className={`ip-status ip-status--${row.status}`}>{statusLabel(row)}</span>
              <span>
                {row.studentName} · {row.change} · {row.date.slice(0, 7)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ip-card" aria-label="Student profile">
        <h2>Student profile, same person</h2>
        <p className="ip-quiet">These stay the student record. Instruction details above do not replace them.</p>
        <dl className="ip-facts">
          <div>
            <dt>Training start</dt>
            <dd>{INSTRUCTOR.startedOn}</dd>
          </div>
          <div>
            <dt>Birth year</dt>
            <dd>{INSTRUCTOR.birthYear}</dd>
          </div>
          <div>
            <dt>Kid or Adult</dt>
            <dd>{INSTRUCTOR.ageBand}</dd>
          </div>
          <div>
            <dt>Own belt</dt>
            <dd>
              {INSTRUCTOR.belt} · {INSTRUCTOR.stripes} stripes · {INSTRUCTOR.beltAwardedOn}
            </dd>
          </div>
          <div>
            <dt>Trains</dt>
            <dd>{INSTRUCTOR.trains}</dd>
          </div>
          <div>
            <dt>Programs taught</dt>
            <dd>{INSTRUCTOR.programs}</dd>
          </div>
        </dl>
        <ul className="ip-list">
          {INSTRUCTOR.history.map((row) => (
            <li key={row.belt}>
              {row.belt} · {row.detail}
            </li>
          ))}
          {POLICY.map((row) => (
            <li key={row.label}>
              {row.label} · {row.on ? 'On' : 'Off'}. {row.note}
            </li>
          ))}
        </ul>
      </section>

      <section className="ip-card" aria-label="Notes">
        <h2>Notes</h2>
        <label>
          Notes
          <textarea aria-label="Notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <p className="ip-quiet">Write-in for this preview only. The locked sheet labels this Notes.</p>
      </section>

      <section className="ip-card" aria-label="Instruction backup" data-testid="instruction-backup">
        <h2>Instruction backup concept</h2>
        <p className="ip-quiet">
          Student Edition restores from Back up my journal, a JSON file named student-journal-backup. A progress PDF cannot restore that phone. This would be a separate instruction file. It would cover teaching since, the estimate, logged hours, the teaching journal, promotion totals, and notes. It would not replace the student name, training start, belt, or student journal.
        </p>
        <div className="ip-log">
          <button type="button" className="ip-log-btn" data-testid="preview-backup" onClick={showBackup}>
            Preview instruction backup
          </button>
          <button type="button" className="ip-switch" data-testid="try-pdf" onClick={() => showRestore('%PDF-1.4 INSTRUCTOR PROFILE AND STAT SHEET')}>
            Try the stat-sheet PDF
          </button>
          <button
            type="button"
            className="ip-switch"
            data-testid="try-student-backup"
            onClick={() => showRestore('{"advantage":"student-journal-backup","version":1}')}
          >
            Try a student journal backup
          </button>
          <button
            type="button"
            className="ip-switch"
            data-testid="try-instruction-backup"
            onClick={() =>
              showRestore(
                JSON.stringify({
                  advantage: 'instructor-teaching-backup',
                  version: 1,
                  displayName: 'Someone Else',
                  notes: 'sample',
                }),
              )
            }
          >
            Try an instruction backup
          </button>
        </div>
        <p role="status" data-testid="backup-note">
          {backupNote}
        </p>
        <p role="status" data-testid="restore-note">
          {restoreNote}
        </p>
      </section>

      <section className="ip-card" aria-label="Document fields">
        <h2>Fields for the printable sheet</h2>
        <p className="ip-quiet">The dark and light PDFs are the locked Notes design. This page does not generate or restore them.</p>
        <dl className="ip-facts">
          {DOCUMENT_FIELDS.map((field) => (
            <div key={field.name}>
              <dt>{field.name}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
