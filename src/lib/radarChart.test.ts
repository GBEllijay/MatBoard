import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { radarPoint, radarPoints, radarSeriesLabel, selfAssessmentShapeLabel } from './radarChart.ts';
import type { AssessmentScores } from './studentAssessment.ts';

const fives: AssessmentScores = {
  guard: 5,
  passing: 5,
  takedowns: 5,
  escapes: 5,
  submissions: 5,
  conditioning: 5,
  mindset: 5,
};

test('radar spokes stay where the self-assessment chart drew them', () => {
  const top = radarPoint(0, 5);
  assert.ok(Math.abs(top.x - 160) < 1e-6);
  assert.ok(Math.abs(top.y - 52) < 1e-6);
  const inner = radarPoint(0, 1);
  assert.ok(Math.abs(inner.x - 160) < 1e-6);
  assert.ok(Math.abs(inner.y - 138.4) < 1e-6);
  const ring = radarPoints([5, 5, 5, 5, 5, 5, 5]);
  assert.equal(ring.split(' ').length, 7);
  assert.ok(ring.startsWith(`${top.x},${top.y}`));
});

test('the self-assessment shape label stays the original sentence', () => {
  assert.equal(selfAssessmentShapeLabel(null), 'Self-assessment shape. No saved ratings yet.');
  assert.equal(
    selfAssessmentShapeLabel(fives),
    'Self-assessment shape, Guard 5, Passing 5, Takedowns 5, Escapes 5, Submissions 5, Conditioning 5, Mindset 5',
  );
});

test('an overlay label names Me and the opponent', () => {
  const sam: AssessmentScores = { ...fives, guard: 2, passing: 4 };
  assert.equal(
    radarSeriesLabel([
      { name: 'Me', scores: fives },
      { name: 'Sam', scores: sam },
    ]),
    'Me versus Sam. Me: Guard 5, Passing 5, Takedowns 5, Escapes 5, Submissions 5, Conditioning 5, Mindset 5. Sam: Guard 2, Passing 4, Takedowns 5, Escapes 5, Submissions 5, Conditioning 5, Mindset 5',
  );
  assert.equal(
    radarSeriesLabel([{ name: 'Sam', scores: sam }]),
    'Sam shape, Guard 2, Passing 4, Takedowns 5, Escapes 5, Submissions 5, Conditioning 5, Mindset 5',
  );
  assert.equal(radarSeriesLabel([{ name: 'Sam', scores: null }]), 'Sam has no ratings');
});

test('self-assessment renders the shared radar instead of a private one', () => {
  const source = readFileSync(new URL('../pages/student/SelfAssessment.tsx', import.meta.url), 'utf8');
  assert.match(source, /RadarChart/);
  assert.equal(source.includes('function Radar('), false);
});
