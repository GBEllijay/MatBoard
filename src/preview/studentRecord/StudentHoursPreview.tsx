import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BELT_INTERVALS,
  BELT_INTERVAL_LABEL,
  EXAMPLE_ESTIMATES,
  EXAMPLE_LOGGED_HOURS,
  PREVIEW_ANCESTRY_PATH,
  PREVIEW_HOURS_PATH,
  PREVIEW_NOTE,
  combinedHours,
  estimatedHours,
  formatHours,
} from './model';
import './studentRecord.css';

export function StudentHoursPreview() {
  const [estimates, setEstimates] = useState({ ...EXAMPLE_ESTIMATES });
  const [showCombined, setShowCombined] = useState(true);
  const estimated = estimatedHours(estimates);
  const combined = combinedHours(EXAMPLE_LOGGED_HOURS, estimates);

  return (
    <main className="srec">
      <div className="srec-shell">
        <p className="srec-banner" role="note" data-testid="preview-banner">
          {PREVIEW_NOTE}
        </p>
        <p className="srec-kicker">Student preview</p>
        <h1>Training hours</h1>
        <p className="srec-quiet" data-testid="preview-path">
          {PREVIEW_HOURS_PATH}
        </p>
        <p className="srec-note">
          Logged hours are a fictional example of time already in Advantage. Earlier hours are optional, and the numbers already filled in are fictional examples for this screen. They are not a recommended amount of training, and they are not a promotion benchmark. Nothing is added together unless the combined total is on.
        </p>
        <section className="srec-card" aria-label="Advantage logged hours">
          <h2>Advantage logged hours</h2>
          <p className="srec-logged">
            <span>From the example journal. Not editable here.</span>
            <strong data-testid="logged-hours">{formatHours(EXAMPLE_LOGGED_HOURS)}</strong>
          </p>
        </section>
        <section className="srec-card srec-estimate" aria-label="Earlier hours">
          <h2>Earlier hours</h2>
          <p className="srec-note" data-testid="hours-example-label">
            Type your own history, or leave a belt blank. A blank belt adds nothing. The sample numbers are not a training target.
          </p>
          <div className="srec-hours">
            {BELT_INTERVALS.map((belt) => (
              <label className="srec-hour" key={belt}>
                <span className={`srec-belt srec-belt--${belt}`} aria-hidden="true" />
                <span>{BELT_INTERVAL_LABEL[belt]}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${BELT_INTERVAL_LABEL[belt]} earlier hours`}
                  value={estimates[belt]}
                  onChange={(event) => setEstimates((current) => ({ ...current, [belt]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <p className="srec-logged">
            <span>Earlier hours on this screen</span>
            <strong data-testid="estimated-hours">{formatHours(estimated)}</strong>
          </p>
        </section>
        <section className="srec-card" aria-label="Combined total">
          <h2>Combined total</h2>
          <label className="srec-switch">
            <input type="checkbox" checked={showCombined} onChange={(event) => setShowCombined(event.target.checked)} />
            Show combined total
          </label>
          {showCombined ? (
            <p className="srec-total" data-testid="combined-hours">
              <span>Fictional logged hours plus the earlier hours on this screen</span>
              <strong>{formatHours(combined)}</strong>
            </p>
          ) : (
            <p className="srec-note" data-testid="combined-hidden">
              Combined total is hidden. Logged hours and earlier hours stay separate.
            </p>
          )}
        </section>
        <p className="srec-note">
          <Link to={PREVIEW_ANCESTRY_PATH}>Teaching ancestry preview</Link>
        </p>
      </div>
    </main>
  );
}
