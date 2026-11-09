import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  centeredScrollTop,
  DEFAULT_REST_MS,
  DEFAULT_ROUNDS,
  DEFAULT_WORK_MS,
  detentIndex,
  durationOptions,
  MATCH_LENGTH_RANGE,
  nearestRowIndex,
  REST_RANGE,
  ROUND_COUNT_OPTIONS,
  ROUND_LENGTH_RANGE,
  settleRowIndex,
  shouldSettleWheel,
  snapDurationMs,
  snapRounds,
  wheelDeltaPx,
  wheelGestureMoved,
  wheelGestureSpeed,
  WHEEL_DELTA_GAIN_MAX,
  WHEEL_FLICK_PX_PER_MS,
  WHEEL_ITEM_PX,
  WHEEL_WINDOW_PX,
  DURATION_STEP_MS,
} from './timeWheel.ts';

/** One-second rows with a mark every 10 seconds, so detent math stays testable on its own. */
function tensSecondOptions(seconds: number) {
  return Array.from({ length: seconds + 1 }, (_, index) => ({
    value: index * 1_000,
    label: String(index),
    detent: index % 10 === 0,
  }));
}

test('round length wheel is 1:00 to 60:00 in 15-second steps, default 5:00', () => {
  assert.equal(DURATION_STEP_MS, 15_000);
  assert.equal(DEFAULT_WORK_MS, 5 * 60_000);
  assert.equal(ROUND_LENGTH_RANGE.minMs, 60_000);
  assert.equal(ROUND_LENGTH_RANGE.maxMs, 60 * 60_000);
  assert.equal(ROUND_LENGTH_RANGE.stepMs, DURATION_STEP_MS);
  const options = durationOptions(ROUND_LENGTH_RANGE);
  assert.equal(options[0].label, '1:00');
  assert.equal(options[1].label, '1:15');
  assert.equal(options[2].label, '1:30');
  assert.equal(options.at(-1)?.label, '60:00');
  assert.equal(options.length, ((60 * 60 - 60) / 15) + 1);
  assert.equal(options.find((option) => option.value === 5 * 60_000)?.label, '5:00');
  assert.equal(options.find((option) => option.value === 6 * 60_000)?.label, '6:00');
  assert.equal(options.every((option) => option.detent !== true), true);
  assert.equal(options.filter((option) => option.snap).length, 0);
  for (let index = 1; index < options.length; index += 1) {
    assert.equal(options[index].value - options[index - 1].value, DURATION_STEP_MS);
  }
});

test('rest wheel is 0:00 to 10:00 in 15-second steps, default 0:30', () => {
  assert.equal(DEFAULT_REST_MS, 30_000);
  const options = durationOptions(REST_RANGE);
  assert.equal(options[0].label, '0:00');
  assert.equal(options[1].label, '0:15');
  assert.equal(options.find((option) => option.value === 30_000)?.label, '0:30');
  assert.equal(options.find((option) => option.value === 60_000)?.label, '1:00');
  assert.equal(options.at(-1)?.label, '10:00');
  assert.equal(options.length, (10 * 60) / 15 + 1);
  assert.equal(REST_RANGE.stepMs, DURATION_STEP_MS);
  assert.equal(options.every((option) => option.detent !== true), true);
});

test('saved whole minutes stay put, and other values snap to 15 seconds', () => {
  assert.equal(snapDurationMs(5 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 5 * 60_000);
  assert.equal(snapDurationMs(6 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 6 * 60_000);
  assert.equal(snapDurationMs(7 * 60_000 + 15_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 15_000);
  assert.equal(snapDurationMs(7 * 60_000 + 7_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000);
  assert.equal(snapDurationMs(7 * 60_000 + 8_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 15_000);
  assert.equal(snapDurationMs(7 * 60_000 + 7_600, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 7 * 60_000 + 15_000);
  assert.equal(snapDurationMs(30_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 60_000);
  assert.equal(snapDurationMs(61 * 60_000, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), 60 * 60_000);
  assert.equal(snapDurationMs(Number.NaN, ROUND_LENGTH_RANGE, DEFAULT_WORK_MS), DEFAULT_WORK_MS);

  assert.equal(snapDurationMs(0, REST_RANGE, DEFAULT_REST_MS), 0);
  assert.equal(snapDurationMs(4_000, REST_RANGE, DEFAULT_REST_MS), 0);
  assert.equal(snapDurationMs(8_000, REST_RANGE, DEFAULT_REST_MS), 15_000);
  assert.equal(snapDurationMs(30_000, REST_RANGE, DEFAULT_REST_MS), 30_000);
  assert.equal(snapDurationMs(25_000, REST_RANGE, DEFAULT_REST_MS), 30_000);
  assert.equal(snapDurationMs(60_000, REST_RANGE, DEFAULT_REST_MS), 60_000);
  assert.equal(snapDurationMs(10 * 60_000 + 6_000, REST_RANGE, DEFAULT_REST_MS), 10 * 60_000);
});

test('a slow scroll catches a tens mark, and a fast flick does not', () => {
  const options = tensSecondOptions(600);
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

test('a coast settles on the nearest row, and a slow stop can still catch a detent', () => {
  const options = tensSecondOptions(600);
  const top = (seconds: number) => seconds * WHEEL_ITEM_PX;
  assert.equal(WHEEL_ITEM_PX, 48);
  assert.equal(WHEEL_WINDOW_PX, 240);
  assert.equal(nearestRowIndex(0, options.length), 0);
  assert.equal(nearestRowIndex(top(8) + 23, options.length), 8);
  assert.equal(nearestRowIndex(top(8) + 24, options.length), 9);
  assert.equal(nearestRowIndex(-40, options.length), 0);
  assert.equal(nearestRowIndex(99_999, 5), 4);
  assert.equal(centeredScrollTop(8), top(8));

  // A flick that crosses many seconds stays where it stops, including past the tens marks.
  assert.equal(settleRowIndex(top(37), options, 2, false), 37);
  assert.equal(settleRowIndex(top(38) + 20, options, WHEEL_FLICK_PX_PER_MS + 0.2, false), 38);
  // The same stop, taken slowly, is inside two seconds of :40.
  assert.equal(settleRowIndex(top(38), options, 0.1, false), 40);
  assert.equal(settleRowIndex(top(8) + 10, options, 0.1, false), 10);
  // A tap or arrow key is precise and does not get pulled onto the mark.
  assert.equal(settleRowIndex(top(8), options, 0.1, true), 8);

  assert.equal(wheelGestureMoved([]), false);
  assert.equal(wheelGestureMoved([{ t: 0, top: top(8) }]), false);
  assert.equal(
    wheelGestureMoved([
      { t: 0, top: top(8) },
      { t: 40, top: top(8) },
    ]),
    false,
  );
  assert.equal(
    wheelGestureMoved([
      { t: 0, top: top(8) },
      { t: 30, top: top(8) + 40 },
    ]),
    true,
  );
  // Opening the wheel and lifting a finger that never moved must not re-snap.
  assert.equal(shouldSettleWheel(top(8), options.length, [], false, top(8)), false);
  assert.equal(shouldSettleWheel(top(8), options.length, [], true, top(8)), true);
  assert.equal(shouldSettleWheel(top(12), options.length, [], false, top(8)), true);
  assert.equal(shouldSettleWheel(top(8) + 20, options.length, [], false, top(8) + 20), true);
});

test('mouse-wheel and trackpad deltas stay proportional, with a modest gain on a hard flick', () => {
  assert.equal(wheelDeltaPx(0, 0), 0);
  assert.equal(wheelDeltaPx(24, 0), 24);
  assert.equal(wheelDeltaPx(-WHEEL_ITEM_PX, 0), -WHEEL_ITEM_PX);
  assert.equal(wheelDeltaPx(3, 1), WHEEL_ITEM_PX);
  assert.equal(wheelDeltaPx(-3, 1), -WHEEL_ITEM_PX);
  assert.equal(wheelDeltaPx(1, 2), WHEEL_WINDOW_PX);
  const boosted = wheelDeltaPx(96, 0);
  assert.ok(Math.abs(boosted - 105.6) < 1e-9);
  assert.ok(boosted > 96);
  assert.ok(boosted <= 96 * WHEEL_DELTA_GAIN_MAX);
  assert.ok(Math.abs(wheelDeltaPx(-96, 0) + 105.6) < 1e-9);
  assert.equal(wheelDeltaPx(10_000, 0), 10_000 * WHEEL_DELTA_GAIN_MAX);
  assert.ok(WHEEL_DELTA_GAIN_MAX < 2);
});

test('match length steps by 15 seconds, still snaps to 3:00, 5:00, and 10:00, and the wheel no longer mandatory-snaps each row', () => {
  const match = durationOptions(MATCH_LENGTH_RANGE);
  assert.equal(MATCH_LENGTH_RANGE.stepMs, DURATION_STEP_MS);
  assert.equal(MATCH_LENGTH_RANGE.minMs, DURATION_STEP_MS);
  assert.equal(match[0].label, '0:15');
  assert.equal(match[1].label, '0:30');
  assert.equal(match.find((option) => option.value === 5 * 60_000)?.label, '5:00');
  assert.equal(match.find((option) => option.value === 60_000)?.label, '1:00');
  assert.equal(match.at(-1)?.label, '180:00');
  assert.equal(match.length, ((180 * 60 - 15) / 15) + 1);
  for (let index = 1; index < match.length; index += 1) {
    assert.equal(match[index].value - match[index - 1].value, DURATION_STEP_MS);
  }
  assert.deepEqual(
    match.filter((option) => option.snap).map((option) => option.label),
    ['3:00', '5:00', '10:00'],
  );
  assert.equal(match.some((option) => option.detent), false);
  assert.equal(durationOptions(ROUND_LENGTH_RANGE).filter((option) => option.snap).length, 0);

  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const scroller = css.slice(css.indexOf('.wheel-scroller {'), css.indexOf('.wheel-scroller::-webkit-scrollbar'));
  assert.match(scroller, /scroll-snap-type:\s*none/);
  assert.doesNotMatch(scroller, /mandatory/);
  assert.match(scroller, /height:\s*240px/);
  const item = css.slice(css.indexOf('.wheel-item {'), css.indexOf('.wheel-tick'));
  assert.match(item, /scroll-snap-align:\s*none/);
  assert.match(item, /height:\s*48px/);
  assert.doesNotMatch(item, /scroll-snap-align:\s*center/);

  const picker = readFileSync(new URL('../components/WheelPicker.tsx', import.meta.url), 'utf8');
  assert.match(picker, /settleRowIndex/);
  assert.match(picker, /shouldSettleWheel/);
  assert.match(picker, /wheelDeltaPx/);
  assert.match(picker, /setTimeout\(commit, 80\)/);
  assert.match(picker, /scrollend/);
  assert.match(picker, /role="listbox"/);
  assert.match(picker, /role="option"/);
  assert.match(picker, /event\.key === 'ArrowDown' \? 1 : -1/);
  assert.match(picker, /precise\.current = true/);
  assert.match(picker, /pointerType !== 'mouse'/);
  assert.match(picker, /el\.scrollTop = active\.top - dy/);
  assert.match(picker, /option\.snap/);
  assert.match(picker, /option\.detent/);
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
