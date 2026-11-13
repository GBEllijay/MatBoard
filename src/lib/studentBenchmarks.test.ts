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
import { setBeltMode, setBirthYear } from './beltBook.ts';
import { blankStudentReport, fundamentalsBoard, setFundamentalLevel, setTechniquePolicy, setTrainingStyle } from './studentEdition.ts';
import { setRankBelt } from './studentRank.ts';
import {
  STARTER_RUBRIC_LEVELS,
  addCheckpoint,
  beltLevel,
  beltProgressSummary,
  beltRequirementProgress,
  removeCheckpoint,
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
  belt: 'white' | 'blue' | 'purple' | 'brown',
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
    'General guidelines only. Advantage does not set requirements and does not include a benchmark list. Your federation and your instructor decide all actual requirements, stripes and promotions. Add the benchmarks your instructor gives you.',
  );
  assert.equal(BLACK_BELT_AGE_NOTE, 'Age 19+. An Adult Brown Belt World Champion may be promoted at 18.');
  assert.deepEqual(adultStarterLevels().map((level) => level.belt), ['white', 'blue', 'purple', 'brown']);
  for (const level of adultStarterLevels()) {
    assert.equal(level.checkpoints.length, 0, `${level.belt} ships empty`);
    assert.equal(level.starterAck, true);
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

test('a new file starts empty, with no 0 of 0 count and no groups', () => {
  const fresh = withStarterRubric(blankStudentReport(10), 10);
  for (const level of fresh.rubric.levels) assert.equal(level.checkpoints.length, 0, `${level.belt} is empty`);
  assert.equal(withStarterRubric(fresh, 11), fresh);
  const white = beltLevel(fresh, 'white');
  assert.equal(beltProgressSummary(white, catalogLevelMap(fresh)), '');
  assert.equal(beltProgressSummary(null, catalogLevelMap(fresh)), '');
  assert.deepEqual(beltRequirementProgress(white, catalogLevelMap(fresh)), {
    requirements: 0,
    counted: 0,
    fromFundamentals: 0,
    checkpoints: 0,
    checkpointsFilled: 0,
  });
  assert.deepEqual(benchmarkGroups([], 'white'), []);
  for (const belt of ['blue', 'purple', 'brown'] as const) {
    const moved = withStarterRubric(setRankBelt(fresh, belt, 12), 13);
    assert.equal(beltLevel(moved, belt)?.checkpoints.length, 0);
  }

  const added = addCheckpoint(fresh, 'white', 'Lead the warm-up', 14);
  const summary = beltProgressSummary(beltLevel(added, 'white'), catalogLevelMap(added));
  assert.equal(summary, '0 of 1 practical benchmarks filled.');
  assert.doesNotMatch(summary, /NaN|of 0/);
  const cleared = removeCheckpoint(added, beltLevel(added, 'white')!.checkpoints[0]!.id, 15);
  assert.equal(beltLevel(cleared, 'white')?.checkpoints.length, 0);
  assert.equal(withStarterRubric(cleared, 16), cleared);
});

test('saved benchmarks are never reseeded, replaced or rewritten on load', () => {
  const existing = fileWithSavedWhite();
  const before = structuredClone(existing.rubric.levels[0]!.checkpoints);
  const loaded = withStarterRubric(existing, 2);
  assert.deepEqual(beltLevel(loaded, 'white')?.checkpoints, before);
  assert.equal(beltLevel(loaded, 'white')?.checkpoints[0]?.met, true);
  assert.equal(beltLevel(loaded, 'white')?.checkpoints[0]?.note, 'kept');
  assert.equal(beltLevel(loaded, 'blue')?.checkpoints.length, 0);

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

  // An empty brown is not filled, and an old prefilled brown list stays as saved.
  const emptyBrown = blankStudentReport(20);
  emptyBrown.rubric.levels = [{ id: 'level.brown', name: 'Brown', belt: 'brown', checkpoints: [] }];
  const settled = withStarterRubric(emptyBrown, 21);
  assert.equal(beltLevel(settled, 'brown')?.checkpoints.length, 0);
  assert.equal(beltLevel(settled, 'brown')?.starterAck, true);
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
  marked.checkpoints[0]!.met = true;
  marked.checkpoints[0]!.note = 'kept';
  const parsed = parseProgressPacket(exportProgressPacket(report));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.profile.trainingStyle, 'nogi');
  assert.equal(parsed.value.profile.techniquePolicy?.legLocks, true);
  const white = beltLevel(withStarterRubric(parsed.value, 15), 'white');
  assert.equal(white?.starterAck, true);
  assert.equal(white?.checkpoints.length, 1);
  assert.equal(white?.checkpoints[0]?.name, 'Grip fighting');
  assert.equal(white?.checkpoints[0]?.met, true);
  assert.equal(white?.checkpoints[0]?.note, 'kept');
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
