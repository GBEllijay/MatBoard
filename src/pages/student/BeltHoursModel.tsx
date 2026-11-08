import { useState } from 'react';
import { BELT_SPANS, HOURS_PER_WEEK, IBJJF_GRADUATION_URL, spanHours, spanWeeks, type HoursPerWeek } from '../../lib/beltHoursModel';

/** Calendar estimate on the report card. It does not read or write the journal. */
export function BeltHoursModel() {
  const [rate, setRate] = useState<HoursPerWeek>(2);
  return (
    <section className="report__section" aria-label="Planning model" data-testid="belt-hours-model">
      <h3 className="report__title">
        Planning model <span className="report__source">Not your log</span>
      </h3>
      <p className="report__private">
        Hours = years × 52 × hours a week. 18 months is 1.5 years. At 3 hours a week the totals are 1.5× the 2-hour totals. At 4 hours a week they are 2×. This estimate is not added to your journal hours.
      </p>
      <div className="report__target" role="group" aria-label="Hours per week">
        <span>Hours a week</span>
        {HOURS_PER_WEEK.map((choice) => (
          <button key={choice} type="button" className="report__chip" aria-pressed={rate === choice} onClick={() => setRate(choice)}>
            {choice} hours
          </button>
        ))}
      </div>
      <div className="report__stats">
        {BELT_SPANS.map((span) => (
          <p className="report__stat" key={span.id} data-testid={`belt-hours-${span.id}`}>
            <strong>
              {span.label} · {spanHours(span.years, rate)}
            </strong>
            <span>
              {spanWeeks(span.years)} weeks
              {span.basis === 'assumption'
                ? ' · 2 years is a planning assumption. IBJJF lists no time minimum at white.'
                : ' · Adult IBJJF calendar minimum for this belt.'}
            </span>
          </p>
        ))}
      </div>
      <p className="report__private">
        Blue is 2 years, purple is 18 months, and brown is 1 year. Those are standard adult IBJJF calendar minimums for the current belt, counted from belt registration. Exceptions apply. They are not training-hour requirements and not a guaranteed promotion.{' '}
        <a href={IBJJF_GRADUATION_URL}>IBJJF graduation system</a>, June 2026 PDF, articles 2 and 3.
      </p>
    </section>
  );
}
