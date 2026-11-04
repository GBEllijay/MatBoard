import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REST_MS,
  DEFAULT_ROUNDS,
  DEFAULT_WORK_MS,
  detentIndex,
  durationOptions,
  REST_RANGE,
  ROUND_COUNT_OPTIONS,
  ROUND_LENGTH_RANGE,
  snapDurationMs,
  snapRounds,
  wheelGestureSpeed,
  WHEEL_FLICK_PX_PER_MS,
} from './timeWheel.ts';

test('round length wheel is 1:00 to 60:00 in 1-second steps, default 5:00', () => {
  assert.equal(DEFAULT_WORK_MS, 5 * 60_000);
  assert.equal(ROUND_LENGTH_RANGE.minMs, 60_000);
  assert.equal(ROUND_LENGTH_RANGE.maxMs, 60 * 60_000);
  assert.equal(ROUND_LENGTH_RANGE.stepMs, 1_000);
  const options = durationOptions(ROUND_LENGTH_RANGE);
  assert.equal(options[0].label, '1:00');
  assert.equal(options[1].label, '1:01');
  assert.equal(options.at(-1)?.label, '60:00');
  assert.equal(options.length, 59 * 60 + 1);
  assert.equal(options[0].detent, true);
  assert.equal(options[1].detent, false);
  assert.equal(options.find((option) => option.label === '1:10')?.detent, true);
  assert.equal(options.find((option) => option.label === '1:50')?.detent, true);
  assert.equal(options.filter((option) => option.snap).length, 0);
});

test('rest wheel is 0:00 to 10:00 in 1-second steps, default 0:30', () => {
  assert.equal(DEFAULT_REST_MS, 30_000);
  const options = durationOptions(REST_RANGE);
  assert.equal(options[0].label, '0:00');
  assert.equal(options[0].detent, true);
  assert.equal(options.find((option) => option.value === 30_000)?.label, '0:30');
  assert.equal(options.find((option) => option.value === 30_000)?.detent, true);
  assert.equal(options.find((option) => option.value === 31_000)?.detent, false);
  assert.equal(options.at(-1)?.label, '10:00');
  assert.equal(options.length, 10 * 60 + 1);
});

test('saved lengths stay on the second, and out-of-range values still clamp', () => {
  assert.equal(snapDurationMs(5 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 5 * 60_000);
  assert.equal(snapDurationMs(7 * 60_000 + 7_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 7_000);
  assert.equal(snapDurationMs(7 * 60_000 + 4_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 4_000);
  assert.equal(snapDurationMs(7 * 60_000 + 7_600, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 8_000);
  assert.equal(snapDurationMs(30_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 60_000);
  assert.equal(snapDurationMs(61 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 60 * 60_000);
  assert.equal(snapDurationMs(Number.NaN, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), DEFAULT_WORK_MS);

  assert.equal(snapDurationMs(0, REST_RANGE, DEFAULT_REST_MS), 0);
  assert.equal(snapDurationMs(4_000, REST_RANGE, DEFAULT_REST_MS), 4_000);
  assert.equal(snapDurationMs(7_000, REST_RANGE, DEFAULT_REST_MS), 7_000);
  assert.equal(snapDurationMs(25_000, REST_RANGE, DEFAULT_REST_MS), 25_000);
  assert.equal(snapDurationMs(10 * 60_000 + 6_000, REST_RANGE, DEFAULT_REST_MS), 10 * 60_000);
});

test('a slow scroll catches a tens mark, and a fast flick does not', () => {
  const options = durationOptions(REST_RANGE);
  const at = (seconds: number) => options.findIndex((option) => option.value === seconds * 1_000);
  assert.equal(detentIndex(at(2), options, 0.1), at(0));
  assert.equal(detentIndex(at(8), options, 0.1), at(10));
  assert.equal(detentIndex(at(9), options, 0.2), at(10));
  assert.equal(detentIndex(at(4), options, 0.1), at(4));
  assert.equal(detentIndex(at(5), options, 0.1), at(5));
  assert.equal(detentIndex(at(9), options, WHEEL_FLICK_PX_PER_MS + 0.2), at(9));
  const flick = [
    { t: 0, top: 0 },
    { t: 40, top: 400 },
    { t: 80, top: 900 },
    { t: 200, top: 960 },
  ];
  assert.ok(wheelGestureSpeed(flick) > WHEEL_FLICK_PX_PER_MS);
  const creep = [
    { t: 0, top: 0 },
    { t: 120, top: 8 },
    { t: 240, top: 14 },
    { t: 300, top: 14 },
  ];
  assert.ok(wheelGestureSpeed(creep) < WHEEL_FLICK_PX_PER_MS);
});

test('rounds wheel is the integers 1 through 99', () => {
  assert.equal(DEFAULT_ROUNDS, 5);
  assert.equal(ROUND_COUNT_OPTIONS.length, 99);
  assert.equal(ROUND_COUNT_OPTIONS[0].value, 1);
  assert.equal(ROUND_COUNT_OPTIONS.at(-1)?.value, 99);
  assert.equal(snapRounds(5.4), 5);
  assert.equal(snapRounds(0), 1);
  assert.equal(snapRounds(100), 99);
  assert.equal(snapRounds(Number.NaN), 5);
});
