import assert from 'node:assert/strict';
import test from 'node:test';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import type { BenchmarkStage, RubricCheckpoint, RubricCriterion, StudentProgressReport } from './progress/types.ts';
import {
  BENCHMARK_DISCLAIMER_MEDIUM,
  BENCHMARK_DISCLAIMER_SHORT,
  BLACK_BELT_AGE_NOTE,
  adultStarterLevels,
  benchmarkGroups,
  benchmarkNoGiLine,
  benchmarkView,
  benchmarkVisible,
  catalogLevelMap,
  checkpointsForProgress,
  criterionCounts,
  ageIllegalTechniques,
  defaultTechniquePolicy,
  benchmarkAnchorFromHash,
  stripeHeading,
  visibleTechniqueNames,
} from './studentBenchmarks.ts';
import { currentKidsBelt, kidsBenchmarksOf, removeKidsBenchmark, setBeltMode, setBirthYear } from './beltBook.ts';
import { blankStudentReport, fundamentalsBoard, setFundamentalLevel, setTechniquePolicy, setTrainingStyle } from './studentEdition.ts';
import { setRankBelt } from './studentRank.ts';
import {
  STARTER_RUBRIC_LEVELS,
  addCheckpoint,
  beltLevel,
  beltProgressSummary,
  beltRequirementProgress,
  removeCheckpoint,
  removeGoal,
  goalsForBelt,
  goalsForKidsBelt,
  addedMetLine,
  SEED_LINE,
  STARTER_BENCHMARK_PROMPTS,
  STARTER_GOAL_PROMPTS,
  withStarterRubric,
} from './studentTools.ts';

const LEGACY_IDS = [
  'pos.closed-guard', 'pos.open-guard', 'pos.half-guard', 'pos.mount', 'pos.side-control', 'pos.back-control', 'pos.knee-on-belly', 'pos.standing',
  'sweep.scissor', 'sweep.hip-bump', 'sweep.pendulum', 'sweep.flower', 'sweep.tripod',
  'escape.mount', 'escape.side-control', 'escape.back', 'escape.headlock',
  'pass.torreando', 'pass.knee-slice', 'pass.leg-drag', 'pass.stack',
  'sub.armbar-guard', 'sub.triangle', 'sub.kimura', 'sub.guillotine', 'sub.rear-naked-choke', 'sub.cross-collar',
  'td.double-leg', 'td.single-leg', 'td.arm-drag', 'td.hip-throw',
];

/** A row shaped like one an older build saved into a student's file. Test data only. */
function savedRow(
  belt: 'white' | 'blue' | 'purple' | 'brown' | 'black',
  slug: string,
  stage: BenchmarkStage | undefined,
  extra: Partial<RubricCheckpoint> = {},
  criterion?: Partial<RubricCriterion>,
): RubricCheckpoint {
  const row: RubricCheckpoint = {
    id: `checkpoint.${belt}.${slug}`,
    name: `Saved benchmark ${slug}`,
    met: null,
    note: '',
    criteria: criterion
      ? [{ id: `rubric.${belt}.${slug}`, requirement: '', techniqueRefs: [], met: null, note: '', ...criterion }]
      : [],
    ...extra,
  };
  if (stage) row.stage = stage;
  return row;
}

/** An existing file that already holds 33 saved white rows across the five stages, plus a marked row. */
function fileWithSavedWhite(): StudentProgressReport {
  const stages: BenchmarkStage[] = ['stripe-1', 'stripe-2', 'stripe-3', 'stripe-4', 'promotion'];
  const rows = Array.from({ length: 33 }, (_, index) =>
    savedRow('white', `saved-${index + 1}`, stages[index % stages.length], index === 0 ? { met: true, note: 'kept' } : {}),
  );
  const report = blankStudentReport(1);
  report.rubric.levels = [{ id: 'level.white', name: 'White', belt: 'white', checkpoints: rows }];
  return report;
}

test('no benchmark list ships: every starter level is empty and the preface says so', () => {
  assert.equal(BENCHMARK_DISCLAIMER_SHORT, 'General guidelines only.');
  assert.equal(
    BENCHMARK_DISCLAIMER_MEDIUM,
    'Advantage does not set requirements. Your federation and your instructor decide all actual promotion requirements.',
  );
  assert.equal(BLACK_BELT_AGE_NOTE, 'Age 19+. An Adult Brown Belt World Champion may be promoted at 18.');
  assert.deepEqual(adultStarterLevels().map((level) => level.belt), ['white', 'blue', 'purple', 'brown']);
  for (const level of adultStarterLevels()) {
    assert.equal(level.checkpoints.length, 0, `${level.belt} ships empty`);
    assert.equal(level.starterAck, undefined);
  }
  for (const level of STARTER_RUBRIC_LEVELS) assert.equal(level.checkpoints.length, 0, `${level.belt} ships empty`);
  assert.deepEqual(
    STARTER_RUBRIC_LEVELS.map((level) => level.belt),
    ['white', 'blue', 'purple', 'brown', 'black', 'coral', 'redWhite', 'red', 'grey', 'yellow', 'orange', 'green'],
  );
  assert.equal(stripeHeading('white', 'stripe-1'), 'Stripe 1');
  assert.equal(stripeHeading('brown', 'promotion'), 'Promotion');
  // The Fundamentals catalog is a separate feature and is unchanged.
  const ids = FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items.map((item) => item.id));
  assert.deepEqual(ids.filter((id) => LEGACY_IDS.includes(id)), LEGACY_IDS);
  assert.ok(ids.includes('move.shrimp'));
  assert.equal(FUNDAMENTALS_CATALOG.categories.find((category) => category.id === 'positions')?.items[0]?.name, 'Closed guard');
});

test('a new file gets three editable seed cards and three goal seeds once, never again after a delete', () => {
  const fresh = withStarterRubric(blankStudentReport(10), 10);
  for (const belt of ['white', 'blue', 'purple', 'brown'] as const) {
    const level = beltLevel(fresh, belt);
    assert.deepEqual(level?.checkpoints.map((row) => row.name), [...STARTER_BENCHMARK_PROMPTS], `${belt} seeds`);
    assert.equal(level?.promptsSeeded, true);
    assert.equal(level?.starterAck, true);
    assert.ok(level?.checkpoints.every((row) => row.met === null && row.criteria.length === 0 && !row.stage));
    assert.deepEqual(goalsForBelt(fresh, belt).map((goal) => goal.name), [...STARTER_GOAL_PROMPTS], `${belt} goal seeds`);
  }
  for (const belt of ['grey', 'yellow', 'orange', 'green'] as const) {
    assert.equal(beltLevel(fresh, belt)?.checkpoints.length, 0, `${belt} stays empty`);
  }
  for (const text of [...STARTER_BENCHMARK_PROMPTS, ...STARTER_GOAL_PROMPTS, SEED_LINE]) assert.doesNotMatch(text, /stripe/i);
  assert.equal(withStarterRubric(fresh, 11), fresh);

  // Reload through the saved file format: no duplicates.
  const parsed = parseProgressPacket(exportProgressPacket(fresh));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const reloaded = withStarterRubric(parsed.value, 12);
  assert.equal(beltLevel(reloaded, 'white')?.checkpoints.length, 3);
  assert.equal(goalsForBelt(reloaded, 'white').length, 3);

  // Deleting a seed never brings it back, and an emptied list stays empty.
  let cleared = fresh;
  for (const row of beltLevel(fresh, 'white')!.checkpoints) cleared = removeCheckpoint(cleared, row.id, 13);
  for (const goal of goalsForBelt(fresh, 'white')) cleared = removeGoal(cleared, goal.id, 14);
  assert.equal(beltLevel(cleared, 'white')?.checkpoints.length, 0);
  assert.equal(withStarterRubric(cleared, 15), cleared);
  assert.equal(goalsForBelt(withStarterRubric(cleared, 16), 'white').length, 0);
  const white = beltLevel(cleared, 'white');
  assert.equal(beltProgressSummary(white, catalogLevelMap(cleared)), '');
  assert.deepEqual(beltRequirementProgress(white, catalogLevelMap(cleared)), {
    requirements: 0,
    counted: 0,
    fromFundamentals: 0,
    checkpoints: 0,
    checkpointsFilled: 0,
  });
  assert.deepEqual(benchmarkGroups([], 'white'), []);

  assert.equal(addedMetLine('benchmark', 0, 0), 'No practical benchmarks added yet.');
  assert.equal(addedMetLine('goal', 0, 0), 'No personal goals added yet.');
  assert.equal(addedMetLine('benchmark', 1, 0), '1 practical benchmark added, 0 met.');
  assert.equal(addedMetLine('benchmark', 3, 1), '3 practical benchmarks added, 1 met.');
  assert.equal(addedMetLine('goal', 2, 0), '2 personal goals added, 0 met.');

  const added = addCheckpoint(cleared, 'white', 'Lead the warm-up', 17);
  const summary = beltProgressSummary(beltLevel(added, 'white'), catalogLevelMap(added));
  assert.equal(summary, '0 of 1 practical benchmarks filled.');
  assert.doesNotMatch(summary, /NaN|of 0/);
});

test('saved benchmarks are never reseeded, replaced or rewritten on load', () => {
  const existing = fileWithSavedWhite();
  const before = structuredClone(existing.rubric.levels[0]!.checkpoints);
  const loaded = withStarterRubric(existing, 2);
  assert.deepEqual(beltLevel(loaded, 'white')?.checkpoints, before);
  assert.equal(beltLevel(loaded, 'white')?.checkpoints[0]?.met, true);
  assert.equal(beltLevel(loaded, 'white')?.checkpoints[0]?.note, 'kept');
  // White already had rows, so it gets no seeds and no goal seeds. Missing belts get seeds.
  assert.equal(beltLevel(loaded, 'white')?.promptsSeeded, undefined);
  assert.equal(goalsForBelt(loaded, 'white').length, 0);
  assert.equal(beltLevel(loaded, 'blue')?.checkpoints.length, 3);

  // A file an older build already settled (every adult belt acked) gets nothing new.
  const settledFile = blankStudentReport(5);
  settledFile.rubric.levels = (['white', 'blue', 'purple', 'brown'] as const).map((belt) => ({
    id: `level.${belt}`,
    name: belt,
    belt,
    checkpoints: belt === 'white' ? structuredClone(before) : [],
    starterAck: true,
  }));
  const settledLoad = withStarterRubric(settledFile, 6);
  for (const belt of ['white', 'blue', 'purple', 'brown'] as const) {
    assert.deepEqual(beltLevel(settledLoad, belt)?.checkpoints, beltLevel(settledFile, belt)?.checkpoints);
  }
  // Settled adult belts get no goal seeds. The black-and-up levels the file was missing get theirs once.
  assert.deepEqual([...new Set(settledLoad.goals.map((goal) => goal.belt))], ['black', 'coral', 'redWhite', 'red']);

  // A round trip through the saved file format keeps every row too.
  const parsed = parseProgressPacket(exportProgressPacket(loaded));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const reloaded = withStarterRubric(parsed.value, 3);
  assert.deepEqual(beltLevel(reloaded, 'white')?.checkpoints, before);
  assert.equal(withStarterRubric(reloaded, 4), reloaded);

  // Saved stripe groups still render with plain stage names.
  const groups = benchmarkGroups(before, 'white');
  assert.deepEqual(groups.map((group) => group.title), ['Stripe 1', 'Stripe 2', 'Stripe 3', 'Stripe 4', 'Promotion']);
  assert.equal(groups.reduce((sum, group) => sum + group.rows.length, 0), 33);
  const mixed = benchmarkGroups([...before.slice(0, 2), savedRow('white', 'mine', undefined)], 'white');
  assert.equal(mixed.at(-1)?.title, 'Your benchmarks');
  const summary = beltProgressSummary(beltLevel(reloaded, 'white'), catalogLevelMap(reloaded));
  assert.equal(summary, '1 of 33 practical benchmarks filled.');

  // An old prefilled brown list stays as saved.
  const oldBrown = blankStudentReport(22);
  const legacy = [
    savedRow('brown', 'top', undefined, { name: 'Top' }, { requirement: 'Hold mount.', techniqueRefs: [{ id: 'pos.mount', name: 'Mount' }] }),
  ];
  oldBrown.rubric.levels = [{ id: 'level.brown', name: 'Brown', belt: 'brown', checkpoints: structuredClone(legacy) }];
  assert.deepEqual(beltLevel(withStarterRubric(oldBrown, 23), 'brown')?.checkpoints, legacy);
});

test('saved rows still follow the counting and visibility rules', () => {
  let report = withStarterRubric(blankStudentReport(10), 10);
  const learned = () => catalogLevelMap(report);
  const bundle = savedRow('white', 'bundle', 'stripe-2', {}, {
    match: 'all',
    techniqueRefs: ['move.breakfalls', 'move.shrimp', 'move.bridge', 'move.technical-standup'].map((id) => ({ id, name: id })),
  });
  report = setFundamentalLevel(report, { catalogItemId: 'move.breakfalls', categoryId: 'movement', name: 'Breakfalls' }, 3, 11);
  assert.equal(criterionCounts(bundle.criteria[0]!, learned()), false);
  for (const id of ['move.shrimp', 'move.bridge', 'move.technical-standup']) {
    report = setFundamentalLevel(report, { catalogItemId: id, categoryId: 'movement', name: id }, 3, 12);
  }
  assert.equal(criterionCounts(bundle.criteria[0]!, learned()), true);

  const target = savedRow('white', 'target', 'promotion', {}, {
    targetLevel: 4,
    techniqueRefs: [{ id: 'pos.closed-guard', name: 'Closed guard' }],
  });
  report = setFundamentalLevel(report, { catalogItemId: 'pos.closed-guard', categoryId: 'positions', name: 'Closed guard' }, 3, 14);
  assert.equal(criterionCounts(target.criteria[0]!, learned()), false);
  report = setFundamentalLevel(report, { catalogItemId: 'pos.closed-guard', categoryId: 'positions', name: 'Closed guard' }, 4, 15);
  assert.equal(criterionCounts(target.criteria[0]!, learned()), true);

  const gi = savedRow('white', 'gi', 'stripe-2', { noGiVariant: 'No-gi: Guillotine instead.' }, {
    techniqueRefs: [
      { id: 'sub.cross-collar', name: 'Cross collar choke', style: 'gi' },
      { id: 'sub.guillotine', name: 'Guillotine' },
    ],
  });
  assert.equal(visibleTechniqueNames(gi, 'both').includes('Cross collar choke'), true);
  assert.equal(visibleTechniqueNames(gi, 'nogi').includes('Cross collar choke'), false);
  assert.match(benchmarkNoGiLine(gi, 'both'), /^No-gi: Guillotine/);
  assert.equal(benchmarkNoGiLine(gi, 'gi'), '');

  report = setRankBelt(report, 'brown', 16);
  const view = benchmarkView(report);
  const leg = savedRow('brown', 'leg', 'stripe-3', { policy: 'leg-lock' });
  const comp = savedRow('brown', 'comp', 'stripe-3', { policy: 'competition', optional: true });
  const plain = savedRow('brown', 'plain', 'stripe-1');
  assert.equal(benchmarkVisible(leg, view), false);
  assert.equal(benchmarkVisible(comp, view), false);
  assert.equal(checkpointsForProgress([comp, leg, plain], view).length, 1);
  report = setTechniquePolicy(report, 'competition', true);
  report = setTechniquePolicy(report, 'legLocks', true);
  const open = benchmarkView(report);
  assert.equal(benchmarkVisible(comp, open), true);
  assert.equal(benchmarkVisible(leg, open), true);
  report = setTrainingStyle(report, 'gi');
  assert.equal(benchmarkVisible(leg, benchmarkView(report)), false);
  assert.equal(checkpointsForProgress([comp], benchmarkView(report)).length, 0);

  const year = new Date().getFullYear();
  const ankle = savedRow('white', 'ankle', 'stripe-4', { policy: 'straight-ankle' });
  const youth = { ...report, profile: { ...report.profile, belt: 'white' as const }, beltBook: { birthYear: year - 15 } };
  assert.equal(defaultTechniquePolicy('white', 15).straightAnkleLock, false);
  assert.equal(benchmarkVisible(ankle, benchmarkView(youth)), false);
  const adult = { ...youth, beltBook: { birthYear: year - 16 } };
  assert.equal(benchmarkVisible(ankle, benchmarkView(adult)), true);
  assert.equal(defaultTechniquePolicy('white', null).wristLocks, false);
  assert.equal(defaultTechniquePolicy('blue', null).wristLocks, true);

  report = setRankBelt(withStarterRubric(blankStudentReport(30), 30), 'brown', 31);
  const finishes = savedRow('brown', 'finishes', 'stripe-2', {}, { catalogNeed: { categoryId: 'submissions', count: 1, level: 5 } });
  assert.equal(criterionCounts(finishes.criteria[0]!, catalogLevelMap(report)), false);
  report = setFundamentalLevel(report, { catalogItemId: 'sub.kimura', categoryId: 'submissions', name: 'Kimura' }, 5, 32);
  assert.equal(criterionCounts(finishes.criteria[0]!, catalogLevelMap(report)), true);
  const summary = beltProgressSummary({ ...beltLevel(report, 'brown')!, checkpoints: [finishes] }, catalogLevelMap(report));
  assert.match(summary, /from fundamentals/);
});

test('kids default to gi and hide techniques that are illegal at their age', () => {
  const kids = setBeltMode(blankStudentReport(1), 'kids', 2);
  assert.equal(kids.profile.trainingStyle, undefined);
  assert.equal(benchmarkView(kids).trainingStyle, 'gi');
  assert.equal(benchmarkView(blankStudentReport()).trainingStyle, 'both');
  const chosen = setTrainingStyle(kids, 'both', 3);
  assert.equal(chosen.profile.trainingStyle, 'both');
  assert.equal(benchmarkView(chosen).trainingStyle, 'both');
  const cleared = setTrainingStyle(chosen, 'gi', 4);
  assert.equal(cleared.profile.trainingStyle, undefined);

  assert.deepEqual(
    ageIllegalTechniques(kids).map((row) => row.name),
    ['Straight ankle lock', 'Wrist lock', 'Leg locks', 'Heel hooks'],
  );
  const names = fundamentalsBoard(kids).find((category) => category.id === 'submissions')?.items.map((item) => item.name) ?? [];
  assert.equal(names.includes('Straight ankle lock'), false);
  assert.equal(names.includes('Wrist lock'), false);
  assert.equal(names.includes('Armbar from guard'), true);
  const unlocked = setTechniquePolicy(kids, 'straightAnkleLock', true, 5);
  assert.equal(unlocked.profile.techniquePolicy?.straightAnkleLock, true);
  const back = fundamentalsBoard(unlocked).find((category) => category.id === 'submissions')?.items.map((item) => item.name) ?? [];
  assert.equal(back.includes('Straight ankle lock'), true);
  assert.equal(back.includes('Wrist lock'), false);

  const blue = setBeltMode(setRankBelt(blankStudentReport(6), 'blue', 7), 'kids', 8);
  assert.equal(benchmarkView(blue).policy.wristLocks, false);
  const older = setBirthYear(kids, new Date().getFullYear() - 16, 9);
  assert.equal(benchmarkView(older).policy.straightAnkleLock, true);
  assert.equal(ageIllegalTechniques(older).some((row) => row.name === 'Straight ankle lock'), false);
  const copy = [...ageIllegalTechniques(kids).map((row) => `${row.name} ${row.reason}`), 'IBJJF kids'].join(' ');
  assert.doesNotMatch(copy, /Gracie Barra|Alliance|Checkmat/i);
});

test('new benchmark fields round-trip, and a student-added row keeps its marks', () => {
  let report = setTrainingStyle(setRankBelt(withStarterRubric(blankStudentReport(10), 10), 'blue', 11), 'nogi', 12);
  report = setTechniquePolicy(report, 'legLocks', true, 13);
  report = addCheckpoint(report, 'white', 'Grip fighting', 14);
  const marked = beltLevel(report, 'white');
  assert.ok(marked);
  const gripRow = marked.checkpoints.find((row) => row.name === 'Grip fighting')!;
  gripRow.met = true;
  gripRow.note = 'kept';
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.profile.trainingStyle, 'nogi');
  assert.equal(parsed.value.profile.techniquePolicy?.legLocks, true);
  const white = beltLevel(withStarterRubric(parsed.value, 15), 'white');
  assert.equal(white?.starterAck, true);
  const grip = white?.checkpoints.find((row) => row.name === 'Grip fighting');
  assert.equal(white?.checkpoints.length, 4);
  assert.equal(grip?.met, true);
  assert.equal(grip?.note, 'kept');
  const bare = parseProgressPacket(exportProgressPacket(blankStudentReport(1)));
  assert.equal(bare.ok, true);
  if (bare.ok && bare.value.kind === 'student-progress-report') {
    assert.equal(bare.value.profile.trainingStyle, undefined);
    assert.equal(benchmarkView(bare.value).trainingStyle, 'both');
  }
});

test('a benchmark hash names the belt and the card, including the short blue turtle anchor', () => {
  assert.deepEqual(benchmarkAnchorFromHash('#checkpoint.white.s1-guard-attack'), {
    belt: 'white',
    elementId: 'checkpoint.white.s1-guard-attack',
  });
  assert.deepEqual(benchmarkAnchorFromHash('checkpoint.blue.s1-turtle'), {
    belt: 'blue',
    elementId: 'checkpoint.blue.s1-turtle',
  });
  assert.deepEqual(benchmarkAnchorFromHash('#blue.s1-turtle'), {
    belt: 'blue',
    elementId: 'checkpoint.blue.s1-turtle',
  });
  assert.deepEqual(benchmarkAnchorFromHash('#rubric.blue.s1-turtle'), {
    belt: 'blue',
    elementId: 'checkpoint.blue.s1-turtle',
  });
  assert.equal(benchmarkAnchorFromHash(''), null);
  assert.equal(benchmarkAnchorFromHash('#assess-guard'), null);
  assert.equal(benchmarkAnchorFromHash('#checkpoint.not-a-belt.s1-turtle'), null);
});

test('black belt and up: one blank practical benchmark that is not counted, three goal prompts, seeded once', () => {
  const fresh = withStarterRubric(blankStudentReport(400), 400);
  for (const belt of ['black', 'coral', 'redWhite', 'red'] as const) {
    const level = beltLevel(fresh, belt);
    assert.deepEqual(level?.checkpoints.map((row) => row.name), [''], `${belt} gets one blank card`);
    assert.equal(level?.promptsSeeded, true);
    assert.deepEqual(goalsForBelt(fresh, belt).map((goal) => goal.name), [...STARTER_GOAL_PROMPTS], `${belt} goal prompts`);
    assert.equal(level?.checkpoints.some((row) => STARTER_BENCHMARK_PROMPTS.includes(row.name as never)), false);
  }
  const black = setRankBelt(fresh, 'black', 401);
  const view = benchmarkView(black);
  assert.equal(checkpointsForProgress(beltLevel(black, 'black')!.checkpoints, view).length, 0, 'a blank card is not added');
  // Reload keeps one blank card; deleting it never brings it back.
  const parsed = parseProgressPacket(exportProgressPacket(black));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(withStarterRubric(parsed.value, 402), parsed.value);
  const blank = beltLevel(black, 'black')!.checkpoints[0]!;
  const cleared = removeCheckpoint(black, blank.id, 403);
  assert.equal(beltLevel(cleared, 'black')?.checkpoints.length, 0);
  assert.equal(withStarterRubric(cleared, 404), cleared);
  // A saved black-belt list is left exactly as it was: no blank card on top.
  const saved = blankStudentReport(410);
  saved.rubric.levels = [{ id: 'level.black', name: 'Black', belt: 'black', checkpoints: [savedRow('black', 'mine', undefined)] }];
  const loaded = withStarterRubric(saved, 411);
  assert.deepEqual(beltLevel(loaded, 'black')?.checkpoints, saved.rubric.levels[0]!.checkpoints);
});

test('kids belts get the three practical benchmark and goal prompts once, in the kids belt book', () => {
  const kids = setBeltMode(blankStudentReport(500), 'kids', 501);
  const beltId = currentKidsBelt(kids).beltId;
  const seeded = withStarterRubric(kids, 502);
  assert.deepEqual(kidsBenchmarksOf(seeded, beltId).map((row) => row.name), [...STARTER_BENCHMARK_PROMPTS]);
  assert.deepEqual(goalsForKidsBelt(seeded, beltId).map((goal) => goal.name), [...STARTER_GOAL_PROMPTS]);
  assert.deepEqual(seeded.beltBook?.promptsSeeded, [beltId]);
  assert.equal(withStarterRubric(seeded, 503), seeded);
  // Reload through the file format: no duplicates.
  const parsed = parseProgressPacket(exportProgressPacket(seeded));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  const reloaded = withStarterRubric(parsed.value, 504);
  assert.equal(kidsBenchmarksOf(reloaded, beltId).length, 3);
  assert.equal(goalsForKidsBelt(reloaded, beltId).length, 3);
  // Delete every prompt: nothing comes back.
  let cleared = reloaded;
  for (const row of kidsBenchmarksOf(reloaded, beltId)) cleared = removeKidsBenchmark(cleared, row.id, 505);
  for (const goal of goalsForKidsBelt(reloaded, beltId)) cleared = removeGoal(cleared, goal.id, 506);
  assert.equal(withStarterRubric(cleared, 507), cleared);
  assert.equal(kidsBenchmarksOf(cleared, beltId).length, 0);
  // Saved kids rows are kept as they are: the belt is only marked seeded.
  const saved = setBeltMode(blankStudentReport(510), 'kids', 511);
  saved.beltBook = { ...saved.beltBook, benchmarks: [{ id: 'kids.mine', beltId, name: 'Breakfall', met: true, note: 'kept' }] };
  const loaded = withStarterRubric(saved, 512);
  assert.deepEqual(kidsBenchmarksOf(loaded, beltId), [{ id: 'kids.mine', beltId, name: 'Breakfall', met: true, note: 'kept' }]);
  assert.deepEqual(loaded.beltBook?.promptsSeeded, [beltId]);
});
