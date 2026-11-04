import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_MARKUP,
  REPLAY_HEADING,
  addStroke,
  arrowHead,
  canClear,
  canUndo,
  clampTime,
  cleanReplay,
  clearMarkup,
  ellipseFromDrag,
  extendStroke,
  formatClock,
  normPoint,
  registerTap,
  replayFileName,
  replayForDrive,
  replayHeading,
  replaySaveTargets,
  scrubKey,
  scrubTime,
  seekBy,
  tapZone,
  undoMarkup,
  type MarkupStroke,
} from './replayAnalysis.ts';

test('double-tap seek moves 10 seconds and stays inside the clip', () => {
  assert.equal(seekBy(30, 1, 120), 40);
  assert.equal(seekBy(30, -1, 120), 20);
  assert.equal(seekBy(4, -1, 120), 0);
  assert.equal(seekBy(115, 1, 120), 120);
  assert.equal(seekBy(0, -1, 0), 0);
  // Duration not loaded yet: never negative, forward still moves.
  assert.equal(seekBy(3, 1, Number.NaN), 13);
  assert.equal(seekBy(3, -1, Number.NaN), 0);
  assert.equal(clampTime(Number.NaN, 50), 0);
});

test('tap zones: left 40% back, right 40% forward, middle plays or pauses', () => {
  assert.equal(tapZone(10, 100), -1);
  assert.equal(tapZone(39, 100), -1);
  assert.equal(tapZone(50, 100), 0);
  assert.equal(tapZone(61, 100), 1);
  assert.equal(tapZone(99, 100), 1);
  assert.equal(tapZone(10, 0), 0);
});

test('only a second tap on the same side within the window seeks', () => {
  let step = registerTap(null, 1, 1000);
  assert.equal(step.seek, 0);
  step = registerTap(step.memory, 1, 1200);
  assert.equal(step.seek, 1);
  // A third quick tap keeps skipping.
  step = registerTap(step.memory, 1, 1400);
  assert.equal(step.seek, 1);
  // Too slow.
  step = registerTap(step.memory, 1, 2000);
  assert.equal(step.seek, 0);
  // Other side does not count as a double tap.
  step = registerTap(step.memory, -1, 2100);
  assert.equal(step.seek, 0);
  step = registerTap(step.memory, -1, 2200);
  assert.equal(step.seek, -1);
  // Middle resets.
  assert.deepEqual(registerTap(step.memory, 0, 2300), { memory: null, seek: 0 });
});

test('dragging the scrub bar maps pointer x to clip time, clamped', () => {
  assert.equal(scrubTime(150, 100, 200, 60), 15);
  assert.equal(scrubTime(50, 100, 200, 60), 0);
  assert.equal(scrubTime(400, 100, 200, 60), 60);
  assert.equal(scrubTime(150, 100, 0, 60), 0);
  assert.equal(scrubTime(150, 100, 200, Number.NaN), 0);
});

test('scrub keys step 5s, page keys 10s, Home/End jump', () => {
  assert.equal(scrubKey('ArrowRight', 10, 60), 15);
  assert.equal(scrubKey('ArrowLeft', 2, 60), 0);
  assert.equal(scrubKey('PageUp', 10, 60), 20);
  assert.equal(scrubKey('PageDown', 10, 60), 0);
  assert.equal(scrubKey('Home', 30, 60), 0);
  assert.equal(scrubKey('End', 30, 60), 60);
  assert.equal(scrubKey('a', 30, 60), null);
  assert.equal(formatClock(75.9), '1:15');
  assert.equal(formatClock(-3), '0:00');
});

function stroke(tool: MarkupStroke['tool'], points: [number, number][]): MarkupStroke {
  return { tool, color: '#ffd400', points };
}

test('markup: add, undo, clear, and undo after clear brings the drawing back', () => {
  let state = EMPTY_MARKUP;
  assert.equal(canUndo(state), false);
  assert.equal(canClear(state), false);
  state = addStroke(state, stroke('circle', [[0.1, 0.1], [0.4, 0.4]]));
  state = addStroke(state, stroke('arrow', [[0.5, 0.5], [0.9, 0.2]]));
  state = addStroke(state, stroke('pen', [[0.1, 0.9], [0.2, 0.8], [0.3, 0.85]]));
  assert.deepEqual(state.strokes.map((s) => s.tool), ['circle', 'arrow', 'pen']);
  state = undoMarkup(state);
  assert.deepEqual(state.strokes.map((s) => s.tool), ['circle', 'arrow']);
  state = clearMarkup(state);
  assert.equal(state.strokes.length, 0);
  assert.equal(canClear(state), false);
  assert.equal(canUndo(state), true);
  state = undoMarkup(state);
  assert.deepEqual(state.strokes.map((s) => s.tool), ['circle', 'arrow']);
  state = undoMarkup(state);
  state = undoMarkup(state);
  assert.equal(state.strokes.length, 0);
  assert.equal(canUndo(state), false);
  assert.equal(undoMarkup(state), state);
  assert.equal(clearMarkup(state), state);
});

test('a tap without a drag is not a mark', () => {
  const tap = stroke('circle', [[0.5, 0.5], [0.5, 0.5]]);
  assert.equal(addStroke(EMPTY_MARKUP, tap), EMPTY_MARKUP);
  assert.equal(addStroke(EMPTY_MARKUP, stroke('pen', [[0.5, 0.5]])), EMPTY_MARKUP);
});

test('circle and arrow keep start and end; pen keeps every point', () => {
  let circle = stroke('circle', [[0.1, 0.1]]);
  circle = extendStroke(circle, [0.2, 0.2]);
  circle = extendStroke(circle, [0.3, 0.3]);
  assert.deepEqual(circle.points, [[0.1, 0.1], [0.3, 0.3]]);
  let pen = stroke('pen', [[0.1, 0.1]]);
  pen = extendStroke(pen, [0.2, 0.2]);
  pen = extendStroke(pen, [0.3, 0.3]);
  assert.equal(pen.points.length, 3);
  assert.deepEqual(normPoint(50, 300, 100, 200), [0.5, 1]);
  assert.deepEqual(ellipseFromDrag([0, 0], [0.5, 1], 200, 100), { cx: 50, cy: 50, rx: 50, ry: 50 });
  const [l, r] = arrowHead([0, 0.5], [1, 0.5], 100, 100, 10);
  assert.ok(l[0] < 100 && r[0] < 100);
  assert.ok(Math.abs(l[1] - 50 + (r[1] - 50)) < 1e-9);
});

test('save targets follow the existing Cloud gate and connected folders only', () => {
  assert.deepEqual(replaySaveTargets({ cloudUpload: false, driveConnected: false, oneDriveConnected: false }), []);
  assert.deepEqual(replaySaveTargets({ cloudUpload: true, driveConnected: true, oneDriveConnected: true }), [
    'advantage-cloud',
    'google-drive',
    'onedrive',
  ]);
  assert.deepEqual(replaySaveTargets({ cloudUpload: false, driveConnected: true, oneDriveConnected: false }), ['google-drive']);
});

test('replay records sanitize, and the Drive copy has no stray bytes', () => {
  const cleaned = cleanReplay({
    id: 'replay-1',
    title: 'Round 2',
    notes: 'Watch the frames',
    clip: { localId: 'rclip-1', name: 'r2.mp4', mime: 'video/mp4', size: 123, source: 'record', saved: { kind: 'google-drive', ref: 'abc' } },
  });
  assert.ok(cleaned);
  assert.equal(cleaned.repaired, false);
  assert.equal(cleaned.replay.clip?.saved?.kind, 'google-drive');
  const bad = cleanReplay({ id: 'r', title: 5, clip: { name: 'no id' } });
  assert.ok(bad);
  assert.equal(bad.repaired, true);
  assert.equal(bad.replay.title, '');
  assert.equal(bad.replay.clip, undefined);
  assert.equal(cleanReplay(null), null);
  const odd = cleanReplay({ id: 'r', title: '', notes: '', clip: { localId: 'x', mime: 'text/html', saved: { kind: 'ftp', ref: 'y' } } });
  assert.equal(odd?.replay.clip?.mime, 'video/mp4');
  assert.equal(odd?.replay.clip?.saved, undefined);
  const withBlob = { ...cleaned.replay, blob: 'bytes' } as unknown as Parameters<typeof replayForDrive>[0];
  assert.equal('blob' in replayForDrive(withBlob), false);
});

test('headings and file names', () => {
  assert.equal(replayHeading(1), REPLAY_HEADING);
  assert.equal(replayHeading(2), `${REPLAY_HEADING} 2`);
  assert.equal(replayFileName('2026-11-04', 'Round 2 / Finals!', 'video/webm', 'replay-abc-123'), 'replay-2026-11-04-round-2-finals-abc123.webm');
  assert.equal(replayFileName('2026-11-04', '', 'video/quicktime', 'r'), 'replay-2026-11-04-analysis-r.mov');
});
