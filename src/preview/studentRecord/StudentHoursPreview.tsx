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
          Logged hours are an example of time already in Advantage. Estimated hours are an example of time from before the app. They are not added together unless the combined total is on. This is not a promotion rule.
        </p>
        <section className="srec-card" aria-label="Advantage logged hours">
          <h2>Advantage logged hours</h2>
          <p className="srec-logged">
            <span>From the example journal. Not editable here.</span>
            <strong data-testid="logged-hours">{formatHours(EXAMPLE_LOGGED_HOURS)}</strong>
          </p>
        </section>
        <section className="srec-card srec-estimate" aria-label="Estimated hours before this app">
          <h2>Estimated hours before this app</h2>
          <p className="srec-note">Type an estimate for a belt, or leave it blank. A blank belt adds nothing.</p>
          <div className="srec-hours">
            {BELT_INTERVALS.map((belt) => (
              <label className="srec-hour" key={belt}>
                <span className={`srec-belt srec-belt--${belt}`} aria-hidden="true" />
                <span>{BELT_INTERVAL_LABEL[belt]}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  aria-label={`${BELT_INTERVAL_LABEL[belt]} estimated hours`}
                  value={estimates[belt]}
                  onChange={(event) => setEstimates((current) => ({ ...current, [belt]: event.target.value }))}
                />
              </label>
            ))}
          </div>
          <p className="srec-logged">
            <span>Estimated total</span>
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
              <span>Example logged plus example estimated</span>
              <strong>{formatHours(combined)}</strong>
            </p>
          ) : (
            <p className="srec-note" data-testid="combined-hidden">
              Combined total is hidden. Logged hours and estimated hours stay separate.
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
