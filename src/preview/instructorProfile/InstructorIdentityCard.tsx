import { useMemo } from 'react';
import {
  INSTRUCTOR,
  PREVIEW_YEAR,
  SHEET_TITLE,
  combinedHours,
  estimatedClasses,
  estimatedHours,
  formatHourCount,
  loggedClassCount,
  loggedMinutesTotal,
  sampleClasses,
  sampleEstimate,
  sampleUpdates,
  teachingTallies,
  teachingYears,
} from './model';
import './instructorProfile.css';

/**
 * The identity block from the instructor profile preview.
 * Same fictional person and the same hour fields. Nothing is stored.
 */
export function InstructorIdentityCard() {
  const classes = useMemo(() => sampleClasses(), []);
  const estimate = useMemo(() => sampleEstimate(), []);
  const updates = useMemo(() => sampleUpdates(), []);
  const tallies = useMemo(() => teachingTallies(updates), [updates]);
  const loggedTotal = loggedMinutesTotal(classes);
  const years = teachingYears(estimate.teachingAroundYear);
  const classEstimate = estimatedClasses(estimate);
  const hourEstimate = estimatedHours(classEstimate, estimate.minutesPerClass);
  const combined = combinedHours(hourEstimate, loggedTotal);
  const hourAssumption = estimate.minutesPerClass === 60 && classEstimate === 2028;

  return (
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
          <em>Official: {INSTRUCTOR.officialStartYear}</em>
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
        {hourAssumption ? ' 2,028 hours only under the 1 hour assumption.' : ' Hours follow the example class length.'} Official start {INSTRUCTOR.officialStartYear} is not in that formula. The estimate ends when logging begins, so those weeks are not in both numbers.
      </p>
      <div className="ip-side">
        <div>
          <span>Classes / week</span>
          <strong>3+</strong>
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
      <p className="ip-quiet">Completed only. Pending and declined are not counted. Fictional totals from the instructor profile preview.</p>
    </section>
  );
}
