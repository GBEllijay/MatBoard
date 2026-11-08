import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BELT_INTERVALS,
  BELT_INTERVAL_LABEL,
  EARLIER_HOURS_PLAYFUL,
  EXAMPLE_ESTIMATES,
  EXAMPLE_LOGGED_HOURS,
  HOURS_PER_WEEK,
  IBJJF_GRADUATION_URL,
  PLANNING_SPANS,
  PREVIEW_ANCESTRY_PATH,
  PREVIEW_HOURS_PATH,
  PREVIEW_NOTE,
  combinedHours,
  estimateStatus,
  estimatedHours,
  formatHours,
  parseEstimate,
  planningHours,
  planningWeeks,
  type HoursPerWeek,
} from './model';
import './studentRecord.css';

export function StudentHoursPreview() {
  const [estimates, setEstimates] = useState({ ...EXAMPLE_ESTIMATES });
  const [showCombined, setShowCombined] = useState(true);
  const [rate, setRate] = useState<HoursPerWeek>(2);
  const estimated = estimatedHours(estimates);
  const combined = combinedHours(EXAMPLE_LOGGED_HOURS, estimates);

  return (
    <main className="srec">
      <div className="srec-shell">
        <p className="srec-banner" role="note" data-testid="preview-banner">
          {PREVIEW_NOTE}
        </p>
        <p className="srec-kicker">Student preview</p>
        <h1 data-testid="training-hours">Training hours</h1>
        <p className="srec-quiet" data-testid="preview-path">
          {PREVIEW_HOURS_PATH}
        </p>
        <p className="srec-note">
          Logged hours stay the example journal total. Earlier hours are what you type for your own history. The planning model is a separate calendar estimate. It does not fill those boxes, and it is not a guaranteed promotion.
        </p>
        <section className="srec-card" aria-label="advantage hours logged">
          <h2>advantage hours logged</h2>
          <p className="srec-logged">
            <span>advantage hours logged</span>
            <strong data-testid="logged-hours">{formatHours(EXAMPLE_LOGGED_HOURS)}</strong>
          </p>
        </section>
        <section className="srec-card" aria-label="Training hours based on general calendar minimums (for reference)" data-testid="general-model">
          <h2>Training hours based on general calendar minimums (for reference)</h2>
          <p className="srec-note">
            Hours = years × 52 × hours a week. 18 months is 1.5 years. At 3 hours a week the totals are 1.5× the 2-hour totals. At 4 hours a week they are 2×.
          </p>
          <div className="srec-rates" role="group" aria-label="Hours per week">
            {HOURS_PER_WEEK.map((choice) => (
              <button
                key={choice}
                type="button"
                className="srec-rate"
                aria-pressed={rate === choice}
                onClick={() => setRate(choice)}
              >
                {choice} hours
              </button>
            ))}
          </div>
          <h3 data-testid="general-timelines">General timelines</h3>
          <ul className="srec-model">
            {PLANNING_SPANS.map((span) => (
              <li className="srec-model-row" key={span.id}>
                <span className={`srec-belt srec-belt--${span.id}`} aria-hidden="true" />
                <span>
                  <b>{span.label}</b>
                  <small>
                    {planningWeeks(span.years)} weeks
                    {span.basis === 'assumption'
                      ? ' · 2 years is a planning assumption. IBJJF lists no time minimum at white.'
                      : ' · Adult IBJJF calendar minimum for this belt.'}
                  </small>
                </span>
                <strong data-testid={`planning-${span.id}`}>{planningHours(span.years, rate)}</strong>
              </li>
            ))}
          </ul>
          <p className="srec-note">
            Blue is 2 years, purple is 18 months, and brown is 1 year. Those are standard adult IBJJF calendar minimums for the current belt, counted from belt registration. Exceptions apply. They are not training-hour requirements and not a guaranteed promotion.{' '}
            <a href={IBJJF_GRADUATION_URL}>IBJJF graduation system</a>, June 2026 PDF, articles 2 and 3.
          </p>
        </section>
        <section className="srec-card srec-estimate" aria-label="Pre-Advantage estimated hours">
          <h2>Pre-Advantage estimated hours</h2>
          <p className="srec-note" data-testid="hours-example-label">
            Optional. Type your own history or leave the belt blank.
          </p>
          <p className="srec-word" data-testid="wording-playful">
            <span>{EARLIER_HOURS_PLAYFUL}</span>
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
                <span className="srec-unit">hours</span>
              </label>
            ))}
          </div>
          <p className="srec-note">Change a number to replace it. Clear the box to leave that belt out.</p>
          <ul className="srec-review" data-testid="estimate-review">
            {BELT_INTERVALS.map((belt) => {
              const status = estimateStatus(estimates[belt]);
              const counted = parseEstimate(estimates[belt]);
              const detail = status === 'blank' ? 'left blank' : status === 'counted' ? `${formatHours(counted ?? 0)} hours` : 'not included';
              return (
                <li key={belt} data-status={status}>
                  {BELT_INTERVAL_LABEL[belt]} · {detail}
                </li>
              );
            })}
          </ul>
          <p className="srec-note" data-testid="save-outcome">
            Not saved. Earlier hours on this screen are not written to advantage hours logged, and there is no backup of them.
          </p>
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
              <span>Example logged hours plus the earlier hours you typed</span>
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
