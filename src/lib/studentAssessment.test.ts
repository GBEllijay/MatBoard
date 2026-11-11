import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { sharedCheckpointId } from './progress/format.ts';
import { PROGRESS_BELTS } from './progress/types.ts';
import { blankStudentReport } from './studentEdition.ts';
import { withStarterRubric } from './studentTools.ts';
import { INDEX_CARDS_STORAGE_KEY } from './indexCards.ts';
import { selfAssessmentLines } from './studentReport.ts';
import {
  ASSESSMENT_AREAS,
  ASSESSMENT_MAX,
  ASSESSMENT_STORAGE_KEY,
  CONDITIONING_ITEMS,
  MINDSET_GOALS,
  assessmentAverage,
  assessmentChartScores,
  assessmentDraftScores,
  assessmentTrend,
  checkpointLinks,
  conditioningContextText,
  conditioningItemsForDate,
  conditioningScoreFromItems,
  displayedAssessmentScores,
  emptyAssessments,
  loadAssessments,
  mindsetGoalsForDate,
  mindsetScoreFromGoals,
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

test('starter checkpoints link the matching areas on the belt being worn', () => {
  const report = withStarterRubric(blankStudentReport());
  const links = checkpointLinks(report);
  assert.equal(links.find((link) => link.areaId === 'guard')?.checkpointId, 'checkpoint.white.s1-positions');
  assert.equal(links.find((link) => link.areaId === 'passing')?.checkpointId, 'checkpoint.white.s1-pass');
  assert.equal(links.find((link) => link.areaId === 'escapes')?.checkpointId, 'checkpoint.white.s2-escape-resist');
  assert.equal(links.find((link) => link.areaId === 'takedowns')?.checkpointId, 'checkpoint.white.promo-standing');
  assert.equal(links.find((link) => link.areaId === 'submissions')?.checkpointId, 'checkpoint.white.s1-guard-attack');
  assert.equal(links.find((link) => link.areaId === 'conditioning'), undefined);
  assert.equal(links.find((link) => link.areaId === 'mindset'), undefined);
  assert.equal(links.some((link) => link.checkpointId.includes('.blue.')), false);
  assert.equal(checkpointLinks(blankStudentReport()).length, 0);
});

test('a white belt does not receive a checkpoint from another belt', () => {
  const white = withStarterRubric(blankStudentReport());
  white.profile.belt = 'white';
  assert.equal(checkpointLinks(white).every((link) => link.checkpointId.includes('.white.')), true);
  const green = withStarterRubric(blankStudentReport());
  green.profile.belt = 'green';
  const links = checkpointLinks(green);
  assert.equal(links.find((link) => link.areaId === 'takedowns')?.checkpointId, sharedCheckpointId('green', 'takedowns'));
  assert.equal(links.some((link) => link.checkpointId.includes('.blue.')), false);
});

test('every belt links only to checkpoints on that belt', () => {
  for (const belt of PROGRESS_BELTS) {
    const report = withStarterRubric(blankStudentReport());
    report.profile.belt = belt;
    const links = checkpointLinks(report);
    assert.equal(
      links.every((link) => link.checkpointId.startsWith(`checkpoint.${belt}.`)),
      true,
      belt,
    );
  }
});

test('a blue belt prefers the checkpoints on that belt', () => {
  const report = withStarterRubric(blankStudentReport());
  report.profile.belt = 'blue';
  const links = checkpointLinks(report);
  assert.equal(links.find((link) => link.areaId === 'guard')?.checkpointId, 'checkpoint.blue.s1-half-bottom');
  assert.equal(links.find((link) => link.areaId === 'takedowns')?.checkpointId, 'checkpoint.blue.s4-takedowns');
  assert.equal(links.find((link) => link.areaId === 'submissions')?.checkpointId, 'checkpoint.blue.s1-defend');
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

test('an older assessment file still loads, and a saved day beats the tracker', () => {
  const storage = memory();
  const older = JSON.stringify({
    entries: [
      {
        id: 'old.1',
        date: '2024-05-01',
        note: 'kept from an older phone',
        scores: { guard: 1, passing: 2, takedowns: 3, escapes: 4, submissions: 5, conditioning: 1, mindset: 2 },
      },
    ],
  });
  storage.setItem(ASSESSMENT_STORAGE_KEY, older);
  const loaded = loadAssessments(storage);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].note, 'kept from an older phone');
  assert.equal(loaded.entries[0].scores.guard, 1);
  assert.equal(loaded.entries[0].scores.mindset, 2);
  assert.equal(loaded.entries[0].scores.sweeps, undefined);
  assert.equal(assessmentAverage(loaded.entries[0].scores), 2.6);
  const written = writeAssessments(storage, loaded);
  assert.equal(written.entries[0].id, 'old.1');
  assert.equal(written.entries[0].scores.submissions, 5);
  assert.equal(Object.hasOwn(written.entries[0].scores, 'sweeps'), false);
  const raw = storage.getItem(ASSESSMENT_STORAGE_KEY) ?? '';
  assert.match(raw, /kept from an older phone/);
  assert.equal(raw.includes('sweeps'), false);

  const tracker = { guard: 5 as const, passing: 5 as const, takedowns: 5 as const, escapes: 5 as const, submissions: 5 as const, conditioning: 5 as const };
  const savedDay = assessmentDraftScores(loaded.entries, '2024-05-01', '2026-11-01', tracker);
  assert.equal(savedDay.guard, 1);
  assert.equal(savedDay.mindset, 2);
  const today = assessmentDraftScores(loaded.entries, '2026-11-01', '2026-11-01', tracker);
  assert.equal(today.guard, 5);
  assert.equal(today.mindset, undefined);
  const otherDay = assessmentDraftScores(loaded.entries, '2026-10-01', '2026-11-01', tracker);
  assert.deepEqual(otherDay, {});
  assert.equal(assessmentChartScores(today, undefined, loaded.entries[0].scores)?.guard, 5);
  assert.equal(assessmentChartScores({}, loaded.entries[0].scores, undefined)?.guard, 1);
  assert.equal(assessmentChartScores({}, undefined, loaded.entries[0].scores)?.mindset, 2);
  assert.equal(assessmentChartScores({}, undefined, undefined), null);
});

test('sweeps is stored only when that day was rated, and it is not passing', () => {
  const seven = scores(3);
  seven.passing = 5;
  const legacy = saveAssessment(emptyAssessments(), { date: '2026-11-07', note: 'seven', scores: seven }, 30);
  assert.equal(Object.hasOwn(legacy.entries[0].scores, 'sweeps'), false);
  assert.equal(legacy.entries[0].scores.passing, 5);
  assert.equal(assessmentAverage(legacy.entries[0].scores), Math.round(((3 * 6 + 5) / 7) * 10) / 10);

  const withSweeps = saveAssessment(legacy, { date: '2026-11-07', note: 'seven', scores: { ...seven, sweeps: 1 } }, 31);
  assert.equal(withSweeps.entries.length, 1);
  assert.equal(withSweeps.entries[0].id, legacy.entries[0].id);
  assert.equal(withSweeps.entries[0].scores.passing, 5);
  assert.equal(withSweeps.entries[0].scores.sweeps, 1);
  assert.notEqual(withSweeps.entries[0].scores.sweeps, withSweeps.entries[0].scores.passing);
  assert.equal(withSweeps.entries[0].scores.guard, 3);
  assert.equal(withSweeps.entries[0].scores.escapes, 3);

  const storage = memory();
  writeAssessments(storage, withSweeps);
  const reloaded = loadAssessments(storage);
  assert.equal(reloaded.entries[0].scores.sweeps, 1);
  assert.equal(reloaded.entries[0].scores.passing, 5);
  assert.equal(assessmentAverage(reloaded.entries[0].scores), Math.round(((3 * 6 + 5 + 1) / 8) * 10) / 10);

  const otherDay = saveAssessment(reloaded, { date: '2026-11-01', note: 'older', scores: seven }, 32);
  assert.equal(otherDay.entries.find((entry) => entry.date === '2026-11-01')?.scores.sweeps, undefined);
  assert.equal(otherDay.entries.find((entry) => entry.date === '2026-11-07')?.scores.sweeps, 1);

  assert.throws(() => saveAssessment(emptyAssessments(), { date: '2026-11-08', note: '', scores: { ...seven, sweeps: 0 } }), /Sweeps/);
  const junk = JSON.stringify({
    entries: [
      {
        id: 'old.2',
        date: '2026-10-02',
        note: 'kept',
        scores: { ...seven, sweeps: 0 },
      },
    ],
  });
  const junkStore = memory();
  junkStore.setItem(ASSESSMENT_STORAGE_KEY, junk);
  const kept = loadAssessments(junkStore);
  assert.equal(kept.entries.length, 1);
  assert.equal(kept.entries[0].scores.passing, 5);
  assert.equal(Object.hasOwn(kept.entries[0].scores, 'sweeps'), false);
});

test('mindset goals stay on the day and do not replace the Mindset face', () => {
  assert.equal(MINDSET_GOALS.length, 6);
  assert.deepEqual(
    MINDSET_GOALS.map((goal) => goal.label),
    [
      "I've formed a routine and habit that keeps me calm and focused",
      'I was intentional with my decisions throughout the roll',
      'I drilled with my game plan in mind',
      "I've done everything I could to be prepared for my challenge",
      "I listened to and followed my coach's instructions",
      'I approach training with an open mind, ready to receive new information',
    ],
  );
  assert.equal(mindsetScoreFromGoals({}), null);
  assert.equal(mindsetScoreFromGoals({ 'calm-focused': 5, 'intentional-roll': 2 }), 4);
  assert.equal(mindsetScoreFromGoals({ 'calm-focused': 1, 'intentional-roll': 2 }), 2);
  assert.equal(mindsetScoreFromGoals({ 'calm-focused': 5, 'game-plan': 4, prepared: 4 }), 4);

  const storage = memory();
  const older = JSON.stringify({
    entries: [
      {
        id: 'old.3',
        date: '2024-05-01',
        note: 'kept from an older phone',
        scores: { guard: 1, passing: 2, takedowns: 3, escapes: 4, submissions: 5, conditioning: 1, mindset: 2 },
        mindsetGoals: { 'calm-focused': 0, missing: 5 },
      },
    ],
  });
  storage.setItem(ASSESSMENT_STORAGE_KEY, older);
  const loaded = loadAssessments(storage);
  assert.equal(loaded.entries.length, 1);
  assert.equal(loaded.entries[0].scores.mindset, 2);
  assert.equal(loaded.entries[0].scores.guard, 1);
  assert.equal(loaded.entries[0].mindsetGoals, undefined);
  assert.deepEqual(mindsetGoalsForDate(loaded.entries, '2024-05-01'), {});
  const kept = writeAssessments(storage, loaded);
  assert.equal(kept.entries[0].id, 'old.3');
  assert.equal((storage.getItem(ASSESSMENT_STORAGE_KEY) ?? '').includes('mindsetGoals'), false);

  const base = scores(3);
  assert.throws(
    () =>
      saveAssessment(emptyAssessments(), {
        date: '2026-11-09',
        note: 'goals',
        scores: { ...base, mindset: 1 },
        mindsetGoals: { 'calm-focused': 5, 'open-mind': 9 },
      }),
    /open mind/,
  );

  const saved = saveAssessment(
    emptyAssessments(),
    {
      date: '2026-11-09',
      note: 'goals',
      scores: { ...base, mindset: 1 },
      mindsetGoals: { 'calm-focused': 5, 'intentional-roll': 2 },
    },
    81,
  );
  assert.equal(saved.entries[0].scores.mindset, 1);
  assert.equal(saved.entries[0].scores.guard, 3);
  assert.equal(saved.entries[0].scores.conditioning, 3);
  assert.equal(saved.entries[0].mindsetGoals?.['calm-focused'], 5);
  assert.equal(saved.entries[0].mindsetGoals?.['intentional-roll'], 2);
  assert.equal(saved.entries[0].mindsetGoals?.['game-plan'], undefined);
  assert.equal(Object.keys(saved.entries[0].mindsetGoals ?? {}).length, 2);
  assert.equal(displayedAssessmentScores(saved.entries[0]).mindset, 4);
  assert.equal(displayedAssessmentScores(saved.entries[0]).guard, 3);

  const preserved = saveAssessment(saved, { date: '2026-11-09', note: 'goals', scores: { ...base, mindset: 1 } }, 82);
  assert.equal(preserved.entries[0].scores.mindset, 1);
  assert.equal(preserved.entries[0].mindsetGoals?.['calm-focused'], 5);

  const cleared = saveAssessment(
    preserved,
    { date: '2026-11-09', note: 'goals', scores: { ...base, mindset: 2 }, mindsetGoals: {} },
    83,
  );
  assert.equal(cleared.entries[0].scores.mindset, 2);
  assert.equal(cleared.entries[0].mindsetGoals, undefined);
  assert.equal(cleared.entries[0].scores.passing, 3);

  const lines = selfAssessmentLines(blankStudentReport(), saved);
  assert.equal(lines.some((line) => line.includes("I've formed a routine and habit that keeps me calm and focused: 5")), true);
  assert.equal(lines.some((line) => line.includes('I drilled with my game plan in mind')), false);
  const oldLines = selfAssessmentLines(blankStudentReport(), loaded);
  assert.equal(oldLines.some((line) => line.includes('Mindset: 2')), true);
  assert.equal(oldLines.some((line) => line.includes('calm and focused')), false);
});

test('conditioning items stay on the day and do not replace the Conditioning face', () => {
  assert.deepEqual(
    CONDITIONING_ITEMS.map((item) => item.label),
    [
      'Warm-up difficulty — ability to complete the warm-up',
      'Recovery time — tracked only, no benchmark',
      'Speed',
      'Stamina during live rolls',
      'Power',
      'Flexibility',
    ],
  );
  assert.equal(conditioningScoreFromItems({}), null);
  assert.equal(conditioningScoreFromItems({ speed: 5, power: 1 }), 3);
  assert.equal(conditioningScoreFromItems({ stamina: 5 }), 5);

  const storage = memory();
  storage.setItem(
    ASSESSMENT_STORAGE_KEY,
    JSON.stringify({
      entries: [
        {
          id: 'old.4',
          date: '2024-06-01',
          note: 'kept from an older phone',
          scores: scores(2),
          conditioningItems: { speed: 0, warmup: 'fast' },
        },
      ],
    }),
  );
  const loaded = loadAssessments(storage);
  assert.equal(loaded.entries[0].scores.conditioning, 2);
  assert.equal(loaded.entries[0].conditioningItems, undefined);
  assert.deepEqual(conditioningItemsForDate(loaded.entries, '2024-06-01'), {});
  assert.equal((storage.getItem(ASSESSMENT_STORAGE_KEY) ?? '').includes('conditioningItems'), true);
  const rewritten = writeAssessments(storage, loaded);
  assert.equal(rewritten.entries[0].id, 'old.4');
  assert.equal((storage.getItem(ASSESSMENT_STORAGE_KEY) ?? '').includes('conditioningItems'), false);

  const base = scores(4);
  assert.throws(
    () =>
      saveAssessment(emptyAssessments(), {
        date: '2026-11-09',
        note: '',
        scores: base,
        conditioningItems: { speed: 5, power: 0 },
      }),
    /Power/,
  );
  const saved = saveAssessment(
    emptyAssessments(),
    { date: '2026-11-09', note: 'engine', scores: { ...base, conditioning: 1 }, conditioningItems: { speed: 5, power: 1 } },
    90,
  );
  assert.equal(saved.entries[0].scores.conditioning, 1);
  assert.equal(saved.entries[0].scores.mindset, 4);
  assert.equal(saved.entries[0].conditioningItems?.speed, 5);
  assert.equal(saved.entries[0].conditioningItems?.power, 1);
  assert.equal(saved.entries[0].conditioningItems?.flexibility, undefined);
  assert.equal(saved.entries[0].mindsetGoals, undefined);
  assert.equal(displayedAssessmentScores(saved.entries[0]).conditioning, 3);
  const kept = saveAssessment(saved, { date: '2026-11-09', note: 'engine', scores: { ...base, conditioning: 1 } }, 91);
  assert.equal(kept.entries[0].scores.conditioning, 1);
  assert.equal(kept.entries[0].conditioningItems?.speed, 5);
  const lines = selfAssessmentLines(blankStudentReport(), saved);
  assert.equal(lines.some((line) => line.includes('Speed: 5')), true);
  assert.equal(lines.some((line) => line.includes('Flexibility')), false);
});

test('older sub-line scores load, average into the face, and export without loss', () => {
  assert.equal(conditioningContextText(), 'Stamina, power, and flexibility.');
  const storage = memory();
  storage.setItem(INDEX_CARDS_STORAGE_KEY, '{"version":1,"cards":[{"id":"sweep.hip-bump","faceId":"sweeps","name":"Hip bump sweep","rating":4,"tree":null}]}');
  storage.setItem(
    ASSESSMENT_STORAGE_KEY,
    JSON.stringify({
      entries: [
        {
          id: 'old.lines',
          date: '2024-07-01',
          note: 'kept from an older phone',
          scores: { guard: 2, passing: 2, takedowns: 2, escapes: 2, submissions: 2, conditioning: 1, mindset: 5 },
          conditioningItems: { stamina: 5, power: 1, flexibility: 3, speed: 5 },
          mindsetGoals: { 'calm-focused': 5, 'intentional-roll': 2, 'game-plan': 4 },
        },
      ],
    }),
  );
  const loaded = loadAssessments(storage);
  const entry = loaded.entries[0];
  assert.equal(entry.scores.conditioning, 1);
  assert.equal(entry.scores.mindset, 5);
  assert.equal(entry.scores.guard, 2);
  assert.equal(entry.conditioningItems?.stamina, 5);
  assert.equal(entry.conditioningItems?.power, 1);
  assert.equal(entry.conditioningItems?.flexibility, 3);
  assert.equal(entry.conditioningItems?.speed, 5);
  assert.equal(entry.mindsetGoals?.['calm-focused'], 5);
  assert.equal(entry.mindsetGoals?.['intentional-roll'], 2);
  assert.equal(entry.mindsetGoals?.['game-plan'], 4);
  assert.equal(displayedAssessmentScores(entry).conditioning, 4);
  assert.equal(displayedAssessmentScores(entry).mindset, 4);
  assert.equal(displayedAssessmentScores(entry).guard, 2);

  const lines = selfAssessmentLines(blankStudentReport(), loaded);
  assert.equal(lines.some((line) => line.includes('Conditioning: 1')), true);
  assert.equal(lines.some((line) => line.includes('Mindset: 5')), true);
  assert.equal(lines.some((line) => line.includes('Stamina during live rolls: 5')), true);
  assert.equal(lines.some((line) => line.includes('Power: 1')), true);
  assert.equal(lines.some((line) => line.includes('Flexibility: 3')), true);
  assert.equal(lines.some((line) => line.includes('Speed: 5')), true);
  assert.equal(lines.some((line) => line.includes("I've formed a routine and habit that keeps me calm and focused: 5")), true);
  assert.equal(lines.some((line) => line.includes('I was intentional with my decisions throughout the roll: 2')), true);
  assert.equal(lines.some((line) => line.includes('I drilled with my game plan in mind: 4')), true);

  const rewritten = writeAssessments(storage, loaded);
  const raw = storage.getItem(ASSESSMENT_STORAGE_KEY) ?? '';
  assert.equal(rewritten.entries[0].id, 'old.lines');
  assert.match(raw, /"stamina":5/);
  assert.match(raw, /"power":1/);
  assert.match(raw, /"flexibility":3/);
  assert.match(raw, /"calm-focused":5/);
  assert.equal(storage.getItem(INDEX_CARDS_STORAGE_KEY), '{"version":1,"cards":[{"id":"sweep.hip-bump","faceId":"sweeps","name":"Hip bump sweep","rating":4,"tree":null}]}');

  const rated = saveAssessment(
    rewritten,
    {
      date: '2024-07-01',
      note: 'kept from an older phone',
      scores: { ...entry.scores, conditioning: 5 },
      directFaces: { conditioning: true },
    },
    70,
  );
  assert.equal(rated.entries[0].scores.conditioning, 5);
  assert.equal(rated.entries[0].scores.mindset, 5);
  assert.equal(rated.entries[0].conditioningItems?.stamina, 5);
  assert.equal(rated.entries[0].conditioningItems?.flexibility, 3);
  assert.equal(rated.entries[0].mindsetGoals?.['game-plan'], 4);
  assert.equal(rated.entries[0].directFaces?.conditioning, true);
  assert.equal(displayedAssessmentScores(rated.entries[0]).conditioning, 5);
  assert.equal(displayedAssessmentScores(rated.entries[0]).mindset, 4);
  const again = selfAssessmentLines(blankStudentReport(), rated);
  assert.equal(again.some((line) => line.includes('Stamina during live rolls: 5')), true);
  assert.equal(again.some((line) => line.includes('Flexibility: 3')), true);
  assert.equal(again.some((line) => line.includes("I've formed a routine and habit that keeps me calm and focused: 5")), true);
});
