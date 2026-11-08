import { useMemo, useState } from 'react';
import { WheelPicker } from '../../components/WheelPicker';
import { formatHours } from '../../lib/matHours';
import {
  DOCUMENT_FIELDS,
  INSTRUCTOR,
  PREVIEW_BANNER,
  PREVIEW_PATH,
  PREVIEW_YEAR,
  SAMPLE_WEEK_START,
  SHEET_TITLE,
  dayLabel,
  durationLabel,
  estimatedClasses,
  estimatedHours,
  logLessonHours,
  profilePolicyLines,
  sampleClasses,
  sampleEstimate,
  samplePlan,
  sampleUpdates,
  setClassMinutes,
  statusLabel,
  teachingDurationOptions,
  teachingTallies,
  teachingYears,
  weekDays,
  weekMinutes,
  loggedMinutes,
  planLog,
  type EstimateInput,
  type TeachingClass,
} from './model';
import './instructorProfile.css';

const DURATION_OPTIONS = teachingDurationOptions();
const POLICY = profilePolicyLines();

export function InstructorProfilePreviewPage() {
  const updates = useMemo(() => sampleUpdates(), []);
  const tallies = useMemo(() => teachingTallies(updates), [updates]);
  const plan = useMemo(() => samplePlan(), []);
  const [lineageOn, setLineageOn] = useState(true);
  const [classes, setClasses] = useState<TeachingClass[]>(() => sampleClasses());
  const [planMinutes, setPlanMinutes] = useState(60);
  const [estimate, setEstimate] = useState<EstimateInput>(() => sampleEstimate());
  const [officialStart, setOfficialStart] = useState<number>(INSTRUCTOR.officialStartYear);
  const [logNote, setLogNote] = useState('Not logged yet.');

  const logged = planLog(classes, plan.planId, plan.date);
  const week = weekMinutes(classes, SAMPLE_WEEK_START);
  const loggedTotal = loggedMinutes(classes);
  const years = teachingYears(estimate.teachingAroundYear);
  const classesEstimate = estimatedClasses(estimate);
  const hoursEstimate = estimatedHours(classesEstimate, estimate.minutesPerClass);
  const hourAssumption = estimate.minutesPerClass === 60;

  const applyPlanMinutes = (minutes: number, fromButton: boolean) => {
    setPlanMinutes(minutes);
    const already = planLog(classes, plan.planId, plan.date);
    if (!already && !fromButton) return;
    const result = logLessonHours(classes, { ...plan, minutes });
    setClasses(result.classes);
    if (result.outcome === 'added') setLogNote('Logged once for this plan and day.');
    else if (result.outcome === 'replaced') setLogNote('Duration replaced. The week total uses the new length.');
    else if (result.outcome === 'removed') setLogNote('Untimed. This class is off the teaching total.');
    else if (fromButton) setLogNote('Already logged at this length. Not counted twice.');
  };

  return (
    <main className="ip-preview">
      <p className="ip-banner" role="note" data-testid="preview-banner">
        {PREVIEW_BANNER}
      </p>
      <p className="ip-kicker">Advantage · Instructor Edition concept</p>
      <h1 data-testid="sheet-title">{SHEET_TITLE}</h1>
      <p className="ip-path" data-testid="preview-path">
        {PREVIEW_PATH}
      </p>
      <p className="ip-quiet">
        Student identity and training history stay on the student file. This sheet adds teaching stats. The academy profile stays the gym and owner record. Brown belt is the instructor in this demo. Blue is the student. A black belt is not a requirement.
      </p>

      <div className="ip-grid">
        <section className="ip-card" aria-label="Identity" data-testid="identity">
          <h2>Identity</h2>
          <p className="ip-quiet">Continues from the student profile. Not copied into the academy profile.</p>
          <dl className="ip-facts">
            <div>
              <dt>Name</dt>
              <dd>{INSTRUCTOR.name}</dd>
            </div>
            <div>
              <dt>Gym</dt>
              <dd>{INSTRUCTOR.gym}</dd>
            </div>
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
              <dt>Belt</dt>
              <dd>
                {INSTRUCTOR.belt} · {INSTRUCTOR.stripes} stripes
              </dd>
            </div>
            <div>
              <dt>Belt date</dt>
              <dd>{INSTRUCTOR.beltAwardedOn}</dd>
            </div>
            <div>
              <dt>Trains</dt>
              <dd>{INSTRUCTOR.trains}</dd>
            </div>
            <div>
              <dt>Competitor</dt>
              <dd>{INSTRUCTOR.competitor}</dd>
            </div>
            <div>
              <dt>No photos</dt>
              <dd>{INSTRUCTOR.noPhotos}</dd>
            </div>
            <div>
              <dt>Teaching around</dt>
              <dd>{INSTRUCTOR.teachingAroundYear}</dd>
            </div>
            <div>
              <dt>Official start</dt>
              <dd>{INSTRUCTOR.officialStartYear}</dd>
            </div>
          </dl>
          <p className="ip-quiet">{INSTRUCTOR.seatNote}</p>
          <h3>Own rank history</h3>
          <p className="ip-quiet">Belts this person received. These are not stripes or promotions given.</p>
          <ul className="ip-list">
            {INSTRUCTOR.history.map((row) => (
              <li key={row.belt}>
                {row.belt} · {row.detail}
              </li>
            ))}
          </ul>
          <h3>Profile switches</h3>
          <p className="ip-quiet">Adult brown defaults when the student file has no saved override. This page does not read a file.</p>
          <ul className="ip-list">
            {POLICY.map((row) => (
              <li key={row.label}>
                <strong>{row.label}</strong> · {row.on ? 'On' : 'Off'}. {row.note}
              </li>
            ))}
          </ul>
        </section>

        <section className="ip-card" aria-label="Teaching tallies">
          <h2>Teaching tallies</h2>
          <div className="ip-stats">
            <p data-testid="stripes-given">
              <strong>{tallies.stripes}</strong>
              <span>Stripes given</span>
            </p>
            <p data-testid="belts-given">
              <strong>{tallies.belts}</strong>
              <span>Promotions given</span>
            </p>
          </div>
          <p className="ip-quiet">
            A stripe tally is more stripes on the same belt. A promotion is a belt change, including one that resets stripes. Pending and declined rows are not in these numbers. A retry of the same student, kind, belt, stripe target, and date counts once.
          </p>
        </section>
      </div>

      <section className="ip-card" aria-label="Lineage">
        <h2>Lineage</h2>
        <p className="ip-quiet">
          Your instructor first, then their instructor. Teaching ancestry, not students taught and not the academy founding line. Hide keeps the names.
        </p>
        <button
          type="button"
          className="ip-switch"
          role="switch"
          aria-checked={lineageOn}
          data-testid="lineage-switch"
          onClick={() => setLineageOn((on) => !on)}
        >
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
          Fiction only. Today a coach rank update is one packet. The student accepts or dismisses it. Accept writes that student&apos;s rank. A parent gate can hold the packet when it is already on. The gate defaults off, and its switch is not on Student Edition pages. Adult students are not automatically in that gate. Nothing below was sent.
        </p>
        <ul className="ip-updates">
          {updates.map((row) => (
            <li key={row.id} data-testid="update-row" data-status={row.status} data-parent={row.parentGateOn ? 'on' : 'off'}>
              <span className={`ip-status ip-status--${row.status}`}>{statusLabel(row)}</span>
              <span>
                {row.studentName} · {row.kind === 'belt' ? `Blue to ${row.belt}` : `${row.belt} stripe ${row.stripeFrom} to ${row.stripeTo}`} · {row.date}
                {row.attempt > 1 ? ` · retry ${row.attempt}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="ip-card" aria-label="Teaching journal">
        <h2>Teaching journal</h2>
        <p className="ip-quiet">
          Instructor-side mirror of the student journal for this sample week. Logged minutes stay separate from the estimate below. The live student journal stores minutes on the student file. This list does not.
        </p>
        <p className="ip-week" data-testid="week-total">
          Week of {SAMPLE_WEEK_START}: <strong>{formatHours(week)} h</strong> logged · {week} min
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
        <p data-testid="logged-hours">
          Logged teaching hours, all sample classes: <strong>{formatHours(loggedTotal)}</strong> ({loggedTotal} min). Not the estimate.
        </p>
      </section>

      <section className="ip-card" aria-label="Sample daily lesson plan">
        <h2>Sample daily lesson plan</h2>
        <p className="ip-quiet">
          {plan.name} · {plan.designation} · {plan.date}. The live plan at /notes has Save, Submit for review, and Upload for instructor distribution. It has I taught this. It does not have Log hours. Expected Duration there is a 30-second wheel stored on the plan. This control is the student 15-minute wheel, and it stays in preview memory.
        </p>
        <div className="ip-log">
          <WheelPicker
            label="Class length"
            value={planMinutes}
            options={DURATION_OPTIONS}
            onChange={(minutes) => applyPlanMinutes(minutes, false)}
          />
          <button type="button" className="ip-log-btn" data-testid="log-hours" onClick={() => applyPlanMinutes(planMinutes, true)}>
            Log hours
          </button>
          <p role="status" data-testid="log-note">
            {logNote} Current length {durationLabel(planMinutes)}.
            {logged ? ` Recorded ${durationLabel(logged.minutes)}.` : ''}
          </p>
        </div>
        <p className="ip-quiet">
          The 1:00 starting length is an example assumption. No class length was supplied. A second tap at the same length does not add another class. Changing the length replaces the minutes.
        </p>
      </section>

      <section className="ip-card" aria-label="Teaching estimate">
        <h2>On-your-honor estimate</h2>
        <p className="ip-quiet">
          Same idea as the student report planning model: a calendar estimate, not journal hours, not a saved history, and not added to the log. 52 weeks is a year-length approximation. 2028 hours appears only while each class is assumed to be 1 hour.
        </p>
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
              value={officialStart}
              data-testid="official-start"
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
              value={estimate.activeWeeksPerYear}
              data-testid="active-weeks"
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
        <p data-testid="estimate-formula">
          {years} years ({PREVIEW_YEAR} − {estimate.teachingAroundYear}) × {estimate.activeWeeksPerYear} weeks × {estimate.classesPerWeek} classes ={' '}
          <strong data-testid="estimated-classes">{classesEstimate}</strong> estimated classes. Official start {officialStart} is not in that formula.
        </p>
        <p data-testid="estimated-hours">
          Estimated hours: <strong>{hoursEstimate}</strong>
          {hourAssumption && classesEstimate === 2028
            ? ' · 2028 hours only under the 1 hour assumption, 52 weeks, 3 classes a week, and 13 years.'
            : hourAssumption
              ? ' · Hours match classes because the example length is still 1 hour.'
              : ' · 2028 hours needs the 1 hour example. This length is different.'}
        </p>
        <p className="ip-quiet">Logged {formatHours(loggedTotal)} h and estimated {hoursEstimate} h are not added together.</p>
      </section>

      <section className="ip-card" aria-label="Document fields">
        <h2>Fields for a later printable sheet</h2>
        <p className="ip-quiet">A separate document preview can use these names. This page does not generate a PDF.</p>
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
