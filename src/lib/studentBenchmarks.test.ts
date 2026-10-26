import assert from 'node:assert/strict';
import test from 'node:test';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import type { RubricCheckpoint, RubricCriterion } from './progress/types.ts';
import {
  BENCHMARK_DISCLAIMER_MEDIUM,
  BENCHMARK_DISCLAIMER_SHORT,
  BLACK_BELT_AGE_NOTE,
  COMPETITION_PROMPT,
  adultStarterLevels,
  benchmarkNoGiLine,
  benchmarkView,
  benchmarkVisible,
  catalogLevelMap,
  checkpointsForProgress,
  criterionCounts,
  ageIllegalTechniques,
  defaultTechniquePolicy,
  benchmarkAnchorFromHash,
  starterCheckpoint,
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
  isUntouchedLegacyBrown,
  removeCheckpoint,
  restoreStarterBenchmarks,
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

function legacyBrown(): RubricCheckpoint[] {
  const row = (slug: string, name: string, criteria: RubricCriterion[]): RubricCheckpoint => ({
    id: `checkpoint.brown.${slug}`,
    name,
    met: null,
    note: '',
    criteria,
  });
  const item = (slug: string, requirement: string, id: string, name: string): RubricCriterion => ({
    id: `rubric.brown.${slug}`,
    requirement,
    techniqueRefs: [{ id, name }],
    met: null,
    note: '',
  });
  return [
    row('top', 'Top', [item('mount', 'Hold mount.', 'pos.mount', 'Mount'), item('knee-on-belly', 'Hold knee on belly.', 'pos.knee-on-belly', 'Knee on belly')]),
    row('standing', 'Standing', [
      item('standing', 'Work standing.', 'pos.standing', 'Standing'),
      item('double-leg', 'Finish a double leg.', 'td.double-leg', 'Double leg'),
      item('hip-throw', 'Finish a hip throw.', 'td.hip-throw', 'Hip throw'),
    ]),
    row('chokes', 'Chokes', [
      item('guillotine', 'Finish a guillotine.', 'sub.guillotine', 'Guillotine'),
      item('cross-collar', 'Finish a cross collar choke.', 'sub.cross-collar', 'Cross collar choke'),
    ]),
  ];
}

test('starter lists keep the approved sentences, links, and kids belts', () => {
  assert.equal(BENCHMARK_DISCLAIMER_SHORT, 'Suggested benchmarks are general guidance, reviewed by black belts. Always review them with your coach, who has the final say.');
  assert.match(BENCHMARK_DISCLAIMER_MEDIUM, /starting point, not a requirement or a promotion standard/);
  assert.equal(BLACK_BELT_AGE_NOTE, 'Age 19+. An Adult Brown Belt World Champion may be promoted at 18.');
  const white = adultStarterLevels().find((level) => level.belt === 'white');
  assert.ok(white);
  assert.equal(white.checkpoints[0]?.name.startsWith('Name the four basic control positions'), true);
  const movement = starterCheckpoint('white', 's2-movement');
  const defense = starterCheckpoint('white', 's3-defense');
  assert.equal(movement?.criteria[0]?.match, 'all');
  assert.equal(defense?.criteria[0]?.match, 'all');
  assert.equal(starterCheckpoint('white', 's1-guard-attack')?.criteria[0]?.match, undefined);
  assert.equal(starterCheckpoint('blue', 's1-turtle')?.name.includes('Properly utilize Turtle Position'), true);
  assert.equal(starterCheckpoint('blue', 's1-escapes')?.name.startsWith('Close the gaps'), false);
  assert.match(starterCheckpoint('blue', 's1-escapes')?.name ?? '', /Escape heavy pins/);
  assert.equal(starterCheckpoint('brown', 's2-finishes')?.criteria[0]?.catalogNeed?.count, 1);
  assert.equal(starterCheckpoint('brown', 's2-finishes')?.criteria[0]?.catalogNeed?.level, 5);
  assert.equal(starterCheckpoint('brown', 's4-teach')?.criteria[0]?.catalogNeed?.count, 3);
  assert.equal(starterCheckpoint('brown', 'promo-teach')?.criteria[0]?.catalogNeed?.count, 5);
  assert.equal(starterCheckpoint('brown', 's3-leglock')?.policy, 'leg-lock');
  assert.equal(starterCheckpoint('brown', 's3-competition')?.optional, true);
  assert.equal(starterCheckpoint('brown', 's3-competition')?.name, COMPETITION_PROMPT);
  assert.equal(beltLevel({ ...blankStudentReport(), rubric: { id: 'r', levels: STARTER_RUBRIC_LEVELS } }, 'black')?.checkpoints.length, 0);
  assert.equal(STARTER_RUBRIC_LEVELS.find((level) => level.belt === 'grey')?.checkpoints[0]?.id, 'checkpoint.grey.positions');
  assert.equal(STARTER_RUBRIC_LEVELS.find((level) => level.belt === 'green')?.checkpoints[0]?.id, 'checkpoint.green.takedowns');
  const ids = FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items.map((item) => item.id));
  assert.deepEqual(ids.filter((id) => LEGACY_IDS.includes(id)), LEGACY_IDS);
  assert.ok(ids.includes('move.shrimp'));
  assert.ok(ids.includes('sweep.butterfly'));
  assert.equal(FUNDAMENTALS_CATALOG.categories.find((category) => category.id === 'positions')?.items[0]?.name, 'Closed guard');
});

test('saved benchmarks stay, empty brown is seeded once, and a cleared list stays clear', () => {
  const seeded = withStarterRubric(blankStudentReport(10), 10);
  const whiteIds = beltLevel(seeded, 'white')?.checkpoints.map((row) => row.id) ?? [];
  assert.equal(whiteIds[0], 'checkpoint.white.s1-positions');
  assert.ok((beltLevel(seeded, 'brown')?.checkpoints.length ?? 0) > 0);
  const again = withStarterRubric(seeded, 11);
  assert.equal(again, seeded);

  const cleared = removeCheckpoint(
    { ...seeded, rubric: { ...seeded.rubric, levels: seeded.rubric.levels.map((level) => (level.belt === 'white' ? { ...level, checkpoints: level.checkpoints.slice(0, 1) } : level)) } },
    'checkpoint.white.s1-positions',
    12,
  );
  assert.equal(beltLevel(cleared, 'white')?.checkpoints.length, 0);
  assert.equal(beltLevel(cleared, 'white')?.starterAck, true);
  assert.equal(withStarterRubric(cleared, 13), cleared);

  const emptyBrown = blankStudentReport(20);
  emptyBrown.rubric.levels = [{ id: 'level.brown', name: 'Brown', belt: 'brown', checkpoints: [] }];
  const filledBrown = withStarterRubric(emptyBrown, 21);
  assert.equal(beltLevel(filledBrown, 'brown')?.checkpoints[0]?.id, 'checkpoint.brown.s1-game');

  const legacy = structuredClone(seeded);
  const brown = beltLevel(legacy, 'brown');
  assert.ok(brown);
  brown.checkpoints = legacyBrown();
  assert.equal(isUntouchedLegacyBrown(brown), true);
  const replaced = withStarterRubric(legacy, 22);
  assert.equal(beltLevel(replaced, 'brown')?.checkpoints[0]?.id, 'checkpoint.brown.s1-game');
  assert.equal(beltLevel(replaced, 'white')?.checkpoints[0]?.id, 'checkpoint.white.s1-positions');

  const edited = structuredClone(legacy);
  beltLevel(edited, 'brown')!.checkpoints[0]!.met = true;
  const kept = withStarterRubric(edited, 23);
  assert.equal(beltLevel(kept, 'brown')?.checkpoints.length, 3);
  assert.equal(beltLevel(kept, 'brown')?.checkpoints[0]?.name, 'Top');
  assert.equal(beltLevel(kept, 'brown')?.checkpoints[0]?.met, true);
});

test('all-of bundles, target levels, gi names, and optional prompts follow the rules', () => {
  let report = withStarterRubric(blankStudentReport(10), 10);
  const learned = () => catalogLevelMap(report);
  const movement = starterCheckpoint('white', 's2-movement')!;
  report = setFundamentalLevel(report, { catalogItemId: 'move.breakfalls', categoryId: 'movement', name: 'Breakfalls' }, 3, 11);
  assert.equal(criterionCounts(movement.criteria[0]!, learned()), false);
  for (const id of ['move.shrimp', 'move.bridge', 'move.technical-standup']) {
    report = setFundamentalLevel(report, { catalogItemId: id, categoryId: 'movement', name: id }, 3, 12);
  }
  assert.equal(criterionCounts(movement.criteria[0]!, learned()), true);

  const pass = starterCheckpoint('white', 's1-pass')!;
  report = setFundamentalLevel(report, { catalogItemId: 'pass.knee-slice', categoryId: 'passes', name: 'Knee slice pass' }, 2, 13);
  assert.equal(criterionCounts(pass.criteria[0]!, learned()), true);
  const keep = starterCheckpoint('white', 'promo-keep-guard')!;
  report = setFundamentalLevel(report, { catalogItemId: 'pos.closed-guard', categoryId: 'positions', name: 'Closed guard' }, 3, 14);
  assert.equal(criterionCounts(keep.criteria[0]!, learned()), false);
  report = setFundamentalLevel(report, { catalogItemId: 'pos.closed-guard', categoryId: 'positions', name: 'Closed guard' }, 4, 15);
  assert.equal(criterionCounts(keep.criteria[0]!, learned()), true);

  const attack = starterCheckpoint('white', 's2-second-attack')!;
  assert.deepEqual(visibleTechniqueNames(attack, 'both').includes('Cross collar choke'), true);
  assert.equal(visibleTechniqueNames(attack, 'nogi').includes('Cross collar choke'), false);
  assert.match(benchmarkNoGiLine(attack, 'both'), /^No-gi: Guillotine/);
  assert.equal(benchmarkNoGiLine(attack, 'gi'), '');

  report = setRankBelt(report, 'brown', 16);
  const view = benchmarkView(report);
  const leg = starterCheckpoint('brown', 's3-leglock')!;
  const comp = starterCheckpoint('brown', 's3-competition')!;
  assert.equal(benchmarkVisible(leg, view), false);
  assert.equal(benchmarkVisible(comp, view), false);
  assert.equal(checkpointsForProgress([comp, leg, starterCheckpoint('brown', 's1-game')!], view).length, 1);
  report = setTechniquePolicy(report, 'competition', true);
  report = setTechniquePolicy(report, 'legLocks', true);
  const open = benchmarkView(report);
  assert.equal(benchmarkVisible(comp, open), true);
  assert.equal(benchmarkVisible(leg, open), true);
  report = setTrainingStyle(report, 'gi');
  assert.equal(benchmarkVisible(leg, benchmarkView(report)), false);
  assert.equal(checkpointsForProgress([comp], benchmarkView(report)).length, 0);

  const year = new Date().getFullYear();
  const youth = { ...report, profile: { ...report.profile, belt: 'white' as const }, beltBook: { birthYear: year - 15 } };
  assert.equal(defaultTechniquePolicy('white', 15).straightAnkleLock, false);
  assert.equal(benchmarkVisible(starterCheckpoint('white', 's4-ankle')!, benchmarkView(youth)), false);
  const adult = { ...youth, beltBook: { birthYear: year - 16 } };
  assert.equal(benchmarkVisible(starterCheckpoint('white', 's4-ankle')!, benchmarkView(adult)), true);
  assert.equal(benchmarkVisible(starterCheckpoint('white', 's4-ankle')!, benchmarkView(withStarterRubric(blankStudentReport()))), true);
  assert.equal(defaultTechniquePolicy('white', null).wristLocks, false);
  assert.equal(defaultTechniquePolicy('blue', null).wristLocks, true);

  report = setRankBelt(withStarterRubric(blankStudentReport(30), 30), 'brown', 31);
  const finishes = starterCheckpoint('brown', 's2-finishes')!;
  assert.equal(criterionCounts(finishes.criteria[0]!, catalogLevelMap(report)), false);
  report = setFundamentalLevel(report, { catalogItemId: 'sub.kimura', categoryId: 'submissions', name: 'Kimura' }, 5, 32);
  assert.equal(criterionCounts(finishes.criteria[0]!, catalogLevelMap(report)), true);
  const summary = beltProgressSummary(
    { ...beltLevel(report, 'brown')!, checkpoints: checkpointsForProgress(beltLevel(report, 'brown')!.checkpoints, benchmarkView(report)) },
    catalogLevelMap(report),
  );
  assert.match(summary, /from fundamentals/);
  assert.equal(summary.includes(COMPETITION_PROMPT), false);
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

test('new benchmark fields round-trip, and restore keeps marks', () => {
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
  assert.equal(parsed.value.rubric.levels.find((level) => level.belt === 'white')?.checkpoints[0]?.stage, 'stripe-1');
  assert.equal(parsed.value.rubric.levels.find((level) => level.belt === 'white')?.starterAck, true);
  const restored = restoreStarterBenchmarks(parsed.value, 'white', 15);
  const white = beltLevel(restored, 'white');
  assert.equal(white?.checkpoints[0]?.met, true);
  assert.equal(white?.checkpoints[0]?.note, 'kept');
  assert.equal(white?.checkpoints.some((row) => row.name === 'Grip fighting'), false);
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
