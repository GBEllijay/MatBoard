import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sharedCheckpointId } from './progress/format.ts';
import { blankStudentReport } from './studentEdition.ts';
import { withStarterRubric } from './studentTools.ts';
import {
  ASSESSMENT_AREAS,
  ASSESSMENT_MAX,
  ASSESSMENT_STORAGE_KEY,
  assessmentAverage,
  assessmentTrend,
  checkpointLinks,
  emptyAssessments,
  loadAssessments,
  removeAssessment,
  saveAssessment,
  writeAssessments,
  type AssessmentDraft,
  type AssessmentScores,
} from './studentAssessment.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  };
}

function scores(value: AssessmentScores[keyof AssessmentScores] = 4): AssessmentScores {
  return {
    guard: value,
    passing: value,
    takedowns: value,
    escapes: value,
    submissions: value,
    conditioning: value,
    mindset: value,
  };
}

function draft(date: string, note = '', value: AssessmentScores[keyof AssessmentScores] = 4): AssessmentDraft {
  return { date, note, scores: scores(value) };
}

test('a check-in stays on this phone and reloads', () => {
  const storage = memory();
  const saved = writeAssessments(storage, saveAssessment(emptyAssessments(), draft('2026-10-16', 'calm rounds', 3)));
  assert.equal(storage.getItem(ASSESSMENT_STORAGE_KEY)?.includes('calm rounds'), true);
  const loaded = loadAssessments(storage);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].date, '2026-10-16');
  assert.equal(loaded.entries[0].note, 'calm rounds');
  assert.equal(loaded.entries[0].scores.guard, 3);
  assert.equal(saved.entries[0].id, loaded.entries[0].id);
  assert.equal(assessmentAverage(loaded.entries[0].scores), 3);
});

test('the same date replaces that day and a later date stays in history', () => {
  let state = saveAssessment(emptyAssessments(), draft('2026-10-01', 'first', 2), 10);
  const id = state.entries[0].id;
  state = saveAssessment(state, draft('2026-10-03', 'third', 5), 11);
  state = saveAssessment(state, draft('2026-10-01', 'updated', 4), 12);
  assert.equal(state.entries.length, 2);
  assert.equal(state.entries[0].date, '2026-10-03');
  assert.equal(state.entries[1].date, '2026-10-01');
  assert.equal(state.entries[1].id, id);
  assert.equal(state.entries[1].note, 'updated');
  assert.deepEqual(
    assessmentTrend(state.entries).map((point) => point.date),
    ['2026-10-01', '2026-10-03'],
  );
  assert.equal(assessmentTrend(state.entries)[1].average, 5);
});

test('a missing rating, a bad date, and a long note are refused', () => {
  const partial = draft('2026-10-16');
  delete partial.scores.mindset;
  assert.throws(() => saveAssessment(emptyAssessments(), partial), /Mindset/);
  assert.throws(() => saveAssessment(emptyAssessments(), draft('10/16/2026')), /YYYY-MM-DD/);
  assert.throws(() => saveAssessment(emptyAssessments(), draft('2026-10-16', 'x'.repeat(501))), /too long/);
  assert.throws(() => saveAssessment(emptyAssessments(), { ...draft('2026-10-16'), scores: { ...scores(), guard: 0 } }), /Guard/);
});

test('junk in storage is ignored and a removal drops one day', () => {
  const storage = memory();
  storage.setItem(ASSESSMENT_STORAGE_KEY, '{"entries":[{"id":"","date":"nope"},{"id":"a","date":"2026-10-02","note":"ok","scores":{"guard":2,"passing":2,"takedowns":2,"escapes":2,"submissions":2,"conditioning":2,"mindset":2}}]}');
  const loaded = loadAssessments(storage);
  assert.equal(loaded.entries.length, 1);
  const removed = removeAssessment(loaded, loaded.entries[0].id);
  assert.equal(removed.entries.length, 0);
  assert.deepEqual(loadAssessments(memory()), emptyAssessments());
});

function isoOffset(offset: number): string {
  const date = new Date(2020, 0, 1 + offset);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

test('history keeps the newest days when the list is full', () => {
  let state = emptyAssessments();
  for (let index = 0; index < ASSESSMENT_MAX + 5; index += 1) {
    state = saveAssessment(state, draft(isoOffset(index), String(index), 3), index + 1);
  }
  assert.equal(state.entries.length, ASSESSMENT_MAX);
  assert.equal(state.entries[0].date > state.entries[state.entries.length - 1].date, true);
  assert.equal(state.entries[0].date, isoOffset(ASSESSMENT_MAX + 4));
});

test('starter checkpoints link the matching areas and skip conditioning and mindset', () => {
  const report = withStarterRubric(blankStudentReport());
  const links = checkpointLinks(report);
  assert.equal(links.find((link) => link.areaId === 'guard')?.checkpointId, sharedCheckpointId('white', 'guard'));
  assert.equal(links.find((link) => link.areaId === 'passing')?.checkpointName, 'Passes');
  assert.equal(links.find((link) => link.areaId === 'escapes')?.checkpointId, sharedCheckpointId('white', 'escapes'));
  assert.equal(links.find((link) => link.areaId === 'takedowns')?.checkpointId, sharedCheckpointId('blue', 'takedowns'));
  assert.equal(links.find((link) => link.areaId === 'submissions')?.checkpointId, sharedCheckpointId('blue', 'submissions'));
  assert.equal(links.find((link) => link.areaId === 'conditioning'), undefined);
  assert.equal(links.find((link) => link.areaId === 'mindset'), undefined);
  assert.equal(checkpointLinks(blankStudentReport()).length, 0);
});

test('a blue belt prefers the checkpoints on that belt', () => {
  const report = withStarterRubric(blankStudentReport());
  report.profile.belt = 'blue';
  const links = checkpointLinks(report);
  assert.equal(links.find((link) => link.areaId === 'guard')?.checkpointId, sharedCheckpointId('blue', 'half-guard'));
  assert.equal(links.find((link) => link.areaId === 'takedowns')?.checkpointName, 'Takedowns');
  assert.equal(links.find((link) => link.areaId === 'submissions')?.checkpointName, 'Submissions');
});

test('the competitor skin keeps 56px targets and leaves the hub notebook alone', () => {
  const arena = readFileSync(new URL('../pages/student/arena.css', import.meta.url), 'utf8');
  const hub = readFileSync(new URL('../student-edition.css', import.meta.url), 'utf8');
  assert.match(arena, /\.assess-tap[\s\S]{0,240}min-height:\s*56px/);
  assert.match(arena, /\.ink-btn[\s\S]{0,400}min-height:\s*56px/);
  assert.match(arena, /\.arena-journal/);
  assert.match(arena, /Patrick Hand/);
  const journal = readFileSync(new URL('../pages/StudentEdition.tsx', import.meta.url), 'utf8');
  const today = journal.slice(journal.indexOf('function JournalToday'), journal.indexOf('function JournalList'));
  assert.match(today, /student-paper/);
  assert.doesNotMatch(today, /student--arena/);
  const hubLink = hub.slice(hub.indexOf('.student-hub__link {'), hub.indexOf('.student-hub__link::before'));
  assert.match(hubLink, /Patrick Hand/);
  assert.match(hubLink, /#f4f0e4/);
  assert.equal(ASSESSMENT_AREAS.length, 7);
});
