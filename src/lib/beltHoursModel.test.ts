import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { BELT_SPANS, HOURS_PER_WEEK, MAT_TIME_ONLY, spanHours, spanWeeks } from './beltHoursModel.ts';

test('belt planning hours match 2, 3, and 4 hours a week', () => {
  assert.deepEqual(BELT_SPANS.map((span) => spanWeeks(span.years)), [104, 104, 78, 52]);
  assert.deepEqual(
    HOURS_PER_WEEK.map((rate) => BELT_SPANS.map((span) => spanHours(span.years, rate))),
    [
      [208, 208, 156, 104],
      [312, 312, 234, 156],
      [416, 416, 312, 208],
    ],
  );
  const at2 = BELT_SPANS.map((span) => spanHours(span.years, 2));
  assert.deepEqual(
    BELT_SPANS.map((span) => spanHours(span.years, 3)),
    at2.map((hours) => hours * 1.5),
  );
  assert.deepEqual(
    BELT_SPANS.map((span) => spanHours(span.years, 4)),
    at2.map((hours) => hours * 2),
  );
  assert.equal(MAT_TIME_ONLY, 'Driving time doesn\u2019t count\u2014mat time only.');
  assert.equal(spanHours(2, 2), 208);
  const formula = spanHours.toString();
  assert.doesNotMatch(formula, /driv|commute|subtract/i);
  const screen = readFileSync(new URL('../pages/student/BeltHoursModel.tsx', import.meta.url), 'utf8');
  assert.match(screen, /\{MAT_TIME_ONLY\}/);
  assert.match(screen, /not a guaranteed promotion/);
  assert.equal(BELT_SPANS[0]?.basis, 'assumption');
  assert.deepEqual(
    BELT_SPANS.slice(1).map((span) => span.basis),
    ['ibjjf', 'ibjjf', 'ibjjf'],
  );
});
