import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REST_MS,
  DEFAULT_ROUNDS,
  DEFAULT_WORK_MS,
  durationOptions,
  REST_RANGE,
  ROUND_COUNT_OPTIONS,
  ROUND_LENGTH_RANGE,
  snapDurationMs,
  snapRounds,
} from './timeWheel.ts';

test('round length wheel is 1:00 to 60:00 in 10-second steps, default 5:00', () => {
  assert.equal(DEFAULT_WORK_MS, 5 * 60_000);
  assert.equal(ROUND_LENGTH_RANGE.minMs, 60_000);
  assert.equal(ROUND_LENGTH_RANGE.maxMs, 60 * 60_000);
  assert.equal(ROUND_LENGTH_RANGE.stepMs, 10_000);
  const options = durationOptions(ROUND_LENGTH_RANGE);
  assert.equal(options[0].label, '1:00');
  assert.equal(options.at(-1)?.label, '60:00');
  assert.equal(options.length, (59 * 60) / 10 + 1);
  assert.ok(options.every((option, index) => option.value === 60_000 + index * 10_000));
});

test('rest wheel is 0:00 to 10:00 in 10-second steps, default 0:30', () => {
  assert.equal(DEFAULT_REST_MS, 30_000);
  const options = durationOptions(REST_RANGE);
  assert.equal(options[0].label, '0:00');
  assert.equal(options.find((option) => option.value === 30_000)?.label, '0:30');
  assert.equal(options.at(-1)?.label, '10:00');
});

test('saved lengths snap to the nearest wheel value', () => {
  assert.equal(snapDurationMs(5 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 5 * 60_000);
  assert.equal(snapDurationMs(7 * 60_000 + 7_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 10_000);
  assert.equal(snapDurationMs(7 * 60_000 + 4_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000);
  assert.equal(snapDurationMs(30_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 60_000);
  assert.equal(snapDurationMs(61 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 60 * 60_000);
  assert.equal(snapDurationMs(Number.NaN, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), DEFAULT_WORK_MS);

  assert.equal(snapDurationMs(0, REST_RANGE, DEFAULT_REST_MS), 0);
  assert.equal(snapDurationMs(4_000, REST_RANGE, DEFAULT_REST_MS), 0);
  assert.equal(snapDurationMs(7_000, REST_RANGE, DEFAULT_REST_MS), 10_000);
  assert.equal(snapDurationMs(25_000, REST_RANGE, DEFAULT_REST_MS), 30_000);
  assert.equal(snapDurationMs(10 * 60_000 + 6_000, REST_RANGE, DEFAULT_REST_MS), 10 * 60_000);
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
