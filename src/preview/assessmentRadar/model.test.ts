import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ASSESSMENT_AREAS } from '../../lib/studentAssessment.ts';
import { blankStudentReport, fundamentalsBoard, setFundamentalLevel } from '../../lib/studentEdition.ts';
import { radarPoints } from '../../lib/radarChart.ts';
import { RATING_WORDS } from '../../lib/techniqueTreePreview.ts';
import {
  AXES,
  OCTAGON_CENTER,
  OCTAGON_RADIUS,
  SAMPLE_GUARD_NAME,
  TECHNIQUE_RATING_WORDS,
  averageRatings,
  axisAngle,
  categorySummary,
  chartLabel,
  closedRatingPoints,
  contiguousRuns,
  contributionSlotCount,
  detailCopy,
  journalCardCount,
  latestCard,
  legacyControlMissing,
  outerOctagon,
  pointOnAxis,
  ratedTechniqueIds,
  ratingDots,
  ratingSegments,
  SHEET_EXAMPLE_SCORES,
  SUGGESTED_REQUIREMENTS,
  suggestedCountByBelt,
  catalogCoverage,
  categoryDestination,
  seedPreview,
  setLatestRating,
  setManualScore,
  setTechniqueCategories,
  shapeValues,
  techniqueCount,
} from './model.ts';

const TAU = Math.PI * 2;

function near(a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  return Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
}

function radiusOf(point: { x: number; y: number }): number {
  return Math.hypot(point.x - OCTAGON_CENTER, point.y - OCTAGON_CENTER);
}

test('the outer grid is a regular octagon and the live chart stays seven axes', () => {
  const outer = outerOctagon();
  assert.equal(outer.length, 8);
  assert.equal(AXES.length, 8);
  for (const point of outer) assert.ok(Math.abs(radiusOf(point) - OCTAGON_RADIUS) < 1e-6);
  const angles = outer.map((point) => Math.atan2(point.y - OCTAGON_CENTER, point.x - OCTAGON_CENTER));
  for (let index = 0; index < outer.length; index += 1) {
    let step = angles[(index + 1) % outer.length] - angles[index];
    while (step <= 0) step += TAU;
    assert.ok(Math.abs(step - Math.PI / 4) < 1e-6, `step ${step}`);
  }
  const top = pointOnAxis(0, 5);
  assert.ok(Math.abs(top.x - OCTAGON_CENTER) < 1e-9);
  assert.ok(Math.abs(top.y - (OCTAGON_CENTER - OCTAGON_RADIUS)) < 1e-9);
  assert.ok(Math.abs(axisAngle(1) - (-Math.PI / 4)) < 1e-9);
  const three = pointOnAxis(0, 3);
  assert.ok(Math.abs(radiusOf(three) - OCTAGON_RADIUS * 0.6) < 1e-6);
  assert.equal(ASSESSMENT_AREAS.length, 7);
  assert.equal(ASSESSMENT_AREAS.some((area) => area.id === 'control'), false);
  assert.equal(radarPoints([5, 5, 5, 5, 5, 5, 5, 5]).split(' ').length, 8);
});

test('a partial rating leaves a gap instead of a zero at the middle', () => {
  const seed = seedPreview();
  const manual = shapeValues(seed, 'manual');
  assert.deepEqual(manual, [null, 3, null, 4, 2, 4, 2, 3]);
  assert.equal(closedRatingPoints(manual), null);
  const segments = ratingSegments(manual);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].length, 5);
  const dots = ratingDots(manual);
  assert.equal(dots.length, 6);
  assert.equal(dots.some((dot) => dot.index === 0 || dot.index === 2), false);
  for (const dot of dots) assert.ok(radiusOf(dot) > 20);
  const radii = new Set(dots.map((dot) => Math.round(radiusOf(dot) * 1000)));
  assert.ok(radii.size >= 3);
  assert.deepEqual(contiguousRuns([null, null, null, null, null, null, null, null]), []);
  assert.deepEqual(contiguousRuns([1, null, null, null, null, null, null, null]), [[0]]);
  assert.deepEqual(contiguousRuns([1, 2, null, 4, 5, null, null, 3]), [
    [3, 4],
    [7, 0, 1],
  ]);
});

test('a complete shape closes and a missing score is not stored as zero', () => {
  const seed = seedPreview();
  assert.equal(legacyControlMissing(seed), true);
  assert.equal(Object.hasOwn(seed.manual, 'guard-control'), false);
  const drafted = setManualScore(setManualScore(seed, 'guard-control', 4), 'sweeps', 3);
  assert.equal(drafted.manual['guard-control'], 4);
  assert.equal(seed.manual.passing, 3);
  assert.equal(Object.hasOwn(seed.manual, 'guard-control'), false);
  assert.equal(drafted.cards.length, seed.cards.length);
  assert.equal(drafted.cards[1].rating, seed.cards[1].rating);
  const closed = closedRatingPoints(shapeValues(drafted, 'manual'));
  assert.ok(closed);
  assert.equal(closed?.length, 8);
  assert.equal(ratingSegments(shapeValues(drafted, 'manual')).length, 0);
  const cleared = setManualScore(drafted, 'guard-control', null);
  assert.equal(cleared.manual['guard-control'], undefined);
  assert.equal(legacyControlMissing(cleared), true);
  assert.equal(shapeValues(cleared, 'manual')[0], null);
  assert.equal(closedRatingPoints(shapeValues(cleared, 'manual')), null);
});

test('Deep half guard is an explicit Guard sample and categories stay distinct', () => {
  const seed = seedPreview();
  const deep = seed.techniques.find((row) => row.name === SAMPLE_GUARD_NAME);
  assert.ok(deep);
  assert.equal(deep?.sample, true);
  assert.equal(deep?.kind, 'position');
  assert.deepEqual(deep?.categories, ['guard-control']);
  const rejected = setTechniqueCategories(seed, deep?.id ?? '', ['guard-control', 'conditioning', 'mindset', 'passing']);
  assert.deepEqual(rejected.techniques.find((row) => row.id === deep?.id)?.categories, ['guard-control', 'passing']);
  assert.equal(seed.techniques.find((row) => row.id === deep?.id)?.categories.join(), 'guard-control');
  const guard = AXES.find((axis) => axis.id === 'guard-control');
  const escapes = AXES.find((axis) => axis.id === 'escapes-defense');
  const passing = AXES.find((axis) => axis.id === 'passing');
  const sweeps = AXES.find((axis) => axis.id === 'sweeps');
  assert.match(guard?.meaning ?? '', /not a ninth area/i);
  assert.match(escapes?.meaning ?? '', /Turtle is defense/i);
  assert.match(passing?.meaning ?? '', /Sweeps are a separate area/i);
  assert.match(sweeps?.meaning ?? '', /Sit-up sweep/i);
  assert.equal(AXES.find((axis) => axis.id === 'conditioning')?.manualOnly, true);
  assert.equal(AXES.find((axis) => axis.id === 'mindset')?.manualOnly, true);
});

test('category scores use the latest card once and do not treat a gap as zero', () => {
  const seed = seedPreview();
  const deepId = seed.techniques.find((row) => row.name === SAMPLE_GUARD_NAME)?.id ?? '';
  const deepCards = seed.cards.filter((row) => row.techniqueId === deepId);
  assert.equal(deepCards.length, 2);
  assert.equal(latestCard(deepCards)?.rating, 4);
  const guard = categorySummary(seed, 'guard-control');
  assert.equal(guard.score, 4);
  assert.equal(guard.ratedCount, 4);
  assert.equal(guard.taggedCount, 5);
  assert.equal(guard.formula, '(4 + 3 + 4 + 5) / 4 = 4.0');
  assert.equal(guard.contributors.some((row) => row.earlier.some((card) => card.rating === 2)), true);
  assert.deepEqual(guard.unrated.map((row) => row.name), ['Back control']);
  assert.notEqual(guard.score, averageRatings([4, 3, 4, 5, 0]));
  const passing = categorySummary(seed, 'passing');
  assert.equal(passing.score, 4);
  assert.equal(passing.formula, '(5 + 3) / 2 = 4.0');
  assert.equal(categorySummary(seed, 'sweeps').status, 'not-rated');
  const conditioning = categorySummary(seed, 'conditioning');
  assert.equal(conditioning.status, 'manual-only');
  assert.equal(conditioning.score, null);
  assert.equal(conditioning.manualScore, 2);
  const mindset = categorySummary(seed, 'mindset');
  assert.equal(mindset.score, null);
  assert.equal(mindset.status, 'manual-only');
  const cleared = ['tech-deep-half', 'tech-closed', 'tech-side', 'tech-mount'].reduce((model, id) => setLatestRating(model, id, null), seed);
  const emptyGuard = categorySummary(cleared, 'guard-control');
  assert.equal(emptyGuard.score, null);
  assert.equal(emptyGuard.status, 'not-rated');
  assert.equal(emptyGuard.taggedCount, 5);
  assert.equal(shapeValues(cleared, 'techniques')[0], null);
  assert.equal(cleared.manual['guard-control'], undefined);
});

test('a technique is counted once even when two categories receive its rating', () => {
  const seed = seedPreview();
  assert.equal(techniqueCount(seed), 13);
  assert.equal(journalCardCount(seed), 13);
  assert.equal(ratedTechniqueIds(seed).length, 12);
  assert.equal(contributionSlotCount(seed), 12);
  assert.equal(ratedTechniqueIds(seed).filter((id) => id === 'tech-arm-drag').length, 1);
  const drag = seed.techniques.find((row) => row.id === 'tech-arm-drag');
  assert.deepEqual(drag?.categories, ['takedowns']);
  assert.equal(categorySummary(seed, 'takedowns').contributors.filter((row) => row.techniqueId === 'tech-arm-drag').length, 1);
  const edited = setLatestRating(seed, 'tech-deep-half', 1);
  assert.equal(categorySummary(edited, 'guard-control').score, 3.3);
  assert.equal(edited.manual['guard-control'], undefined);
  assert.equal(latestCard(seed.cards.filter((row) => row.techniqueId === 'tech-deep-half'))?.rating, 4);
  assert.equal(setLatestRating(seed, 'missing', 3), seed);
  assert.equal(setManualScore(seed, 'passing', 1).cards[0].rating, seed.cards[0].rating);
});

test('manual and technique shapes stay separate, including a missing Control score', () => {
  const seed = seedPreview();
  assert.deepEqual(shapeValues(seed, 'techniques'), [4, 4, null, 3.5, 3, 3.5, null, null]);
  const manualDetail = detailCopy(seed, 'guard-control', 'manual');
  assert.match(manualDetail.scoreLine, /not rated/);
  assert.match(manualDetail.how, /not a score of 0/);
  assert.match(manualDetail.how, /not rewritten/);
  const guardDetail = detailCopy(seed, 'guard-control', 'techniques');
  assert.match(guardDetail.scoreLine, /4/);
  assert.match(guardDetail.how, /Deep half guard 4/);
  assert.match(guardDetail.how, /not a second vote/);
  assert.equal(guardDetail.techniques.some((row) => row.name === SAMPLE_GUARD_NAME), true);
  const manualGuard = detailCopy(setManualScore(seed, 'guard-control', 5), 'guard-control', 'manual');
  assert.match(manualGuard.scoreLine, /Manual check-in draft: 5/);
  assert.match(manualGuard.how, /not written onto a saved check-in/);
  const conditioning = detailCopy(seed, 'conditioning', 'techniques');
  assert.match(conditioning.scoreLine, /manual only/);
  assert.match(conditioning.how, /does not invent a number/);
  assert.equal(conditioning.techniques.length, 0);
  const label = chartLabel(seed, 'manual');
  assert.match(label, /Regular octagon/);
  assert.match(label, /Guard\/Control Not rated/);
  assert.match(label, /Sweeps Not rated/);
  assert.doesNotMatch(label, / 0/);
  assert.deepEqual(TECHNIQUE_RATING_WORDS, RATING_WORDS);
});

test('the preview stays off the live assessment save path and reuses the chart colors', () => {
  const page = readFileSync(new URL('./AssessmentRadarPreview.tsx', import.meta.url), 'utf8');
  const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
  const css = readFileSync(new URL('./assessmentRadar.css', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  const live = readFileSync(new URL('../../pages/student/SelfAssessment.tsx', import.meta.url), 'utf8');
  const arena = readFileSync(new URL('../../pages/student/arena.css', import.meta.url), 'utf8');
  const radar = readFileSync(new URL('../../lib/radarChart.ts', import.meta.url), 'utf8');
  assert.match(app, /\/preview\/assessment-radar/);
  assert.match(live, /1 is early\. 5 is ready to rely on\./);
  assert.doesNotMatch(live, /assessmentRadar|oct-preview|Eight-area shape/);
  assert.match(radar, /ASSESSMENT_FORM_AREAS\.length/);
  assert.doesNotMatch(`${page}\n${model}\n${css}`, /ASSESSMENT_STORAGE_KEY|writeAssessments|saveAssessment|localStorage|reportPdf/);
  assert.match(css, /#1f7ae0/);
  assert.match(css, /#18202e/);
  assert.doesNotMatch(`${page}\n${model}\n${css}`, /UFC|Ultimate Fighting/);
  assert.match(arena, /#2c2c2e/);
  assert.match(arena, /#0a84ff/);
  assert.match(arena, /rgba\(10, 132, 255, 0\.18\)/);
  assert.match(css, /#2c2c2e/);
  assert.match(css, /#0a84ff/);
  assert.match(css, /rgba\(10, 132, 255, 0\.18\)/);
  for (const axis of AXES) assert.match(css, new RegExp(`data-area='${axis.id}'`));
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /orientation:\s*landscape/);
  assert.match(page, /Assessment radar/);
  assert.doesNotMatch(page, /Eight-area shape|Still to decide/);
});

test('a category opens only records already tagged to it, with the sample first', () => {
  const seed = seedPreview();
  const guard = categoryDestination(seed, 'guard-control');
  assert.equal(guard.items[0]?.name, 'Deep half guard');
  assert.equal(guard.items[0]?.source, 'sample');
  assert.equal(guard.items.some((item) => item.id === 'pos.closed-guard'), true);
  assert.equal(guard.items.some((item) => item.id === 'def.guard-retention'), true);
  assert.equal(guard.items.some((item) => item.id === 'pos.north-south'), true);
  assert.equal(guard.items.some((item) => item.id === 'pos.scarf-hold'), true);
  assert.equal(guard.items.some((item) => item.id === 'sweep.scissor'), false);
  assert.equal(guard.items.some((item) => item.id === 'pos.turtle'), false);
  const sweeps = categoryDestination(seed, 'sweeps');
  assert.equal(sweeps.items.some((item) => item.id === 'sweep.scissor'), true);
  assert.match(sweeps.note, /Sit-up sweep is omitted on purpose/);
  const passing = categoryDestination(seed, 'passing');
  assert.equal(passing.items[0]?.name, 'Knee slice');
  assert.equal(passing.items.some((item) => item.name === 'Knee slice pass'), true);
  const escapes = categoryDestination(seed, 'escapes-defense');
  assert.equal(escapes.items.some((item) => item.id === 'pos.turtle' && item.source === 'fundamentals'), true);
  assert.equal(escapes.items.some((item) => item.id === 'def.submission-defense'), true);
  assert.equal(escapes.items.some((item) => item.id === 'def.sprawl'), false);
  assert.equal(escapes.items.some((item) => item.name === 'Mount escape' && item.source === 'fundamentals'), true);
  const conditioning = categoryDestination(seed, 'conditioning');
  assert.equal(conditioning.fundamentals.length, 0);
  assert.equal(conditioning.benchmarks[0]?.name, '10 pull-ups');
  assert.match(conditioning.note, /no automatic technique score/);
  const mindset = categoryDestination(seed, 'mindset');
  assert.equal(mindset.benchmarks[0]?.name, 'Competed without losing cool');
});

test('the cage examples are fictional and do not fill a missing check-in', () => {
  const seed = seedPreview();
  assert.equal(seed.manual['guard-control'], undefined);
  assert.equal(seed.manual.sweeps, undefined);
  assert.equal(SHEET_EXAMPLE_SCORES['guard-control'], 4);
  assert.equal(SHEET_EXAMPLE_SCORES.sweeps, 4);
  const edited = setManualScore(seed, 'passing', 1);
  assert.equal(SHEET_EXAMPLE_SCORES.passing, 3);
  assert.equal(edited.manual.sweeps, undefined);
});

test('approved rows, default omissions, and the suggestion cap are explicit', () => {
  const rows = catalogCoverage();
  assert.equal(rows.length, 47);
  assert.equal(rows.every((row) => row.examples === 0), true);
  assert.equal(rows.find((row) => row.id === 'sweep.scissor')?.previewLabel, 'sweeps');
  assert.equal(rows.find((row) => row.id === 'pos.turtle')?.subtype, 'Defense');
  assert.equal(rows.find((row) => row.id === 'pos.turtle')?.previewLabel, 'escapes-defense');
  assert.equal(rows.find((row) => row.id === 'def.submission-defense')?.previewLabel, 'escapes-defense');
  assert.equal(rows.find((row) => row.id === 'pos.north-south')?.subtype, 'Control');
  assert.equal(rows.find((row) => row.id === 'pos.scarf-hold')?.subtype, 'Control');
  assert.equal(rows.find((row) => row.id === 'pos.back-control')?.previewLabel, 'guard-control');
  assert.equal(rows.find((row) => row.id === 'pos.standing')?.basis, 'unassigned');
  for (const id of ['move.breakfalls', 'move.shrimp', 'move.bridge', 'move.technical-standup', 'def.sprawl']) {
    assert.equal(rows.find((row) => row.id === id)?.basis, 'omitted-from-default', id);
  }
  const counts = suggestedCountByBelt();
  assert.equal(counts.white, 6);
  assert.equal(counts.blue, 3);
  assert.equal(counts.purple, 3);
  assert.equal(counts.brown, 3);
  assert.equal(counts.black, 0);
  assert.equal(SUGGESTED_REQUIREMENTS.some((row) => /sit-up/i.test(row.name)), false);
  assert.equal(SUGGESTED_REQUIREMENTS.some((row) => row.name === 'Ghost escape' || row.name === 'Mount reversal' || row.name === 'Waiter sweep'), false);
  const blank = fundamentalsBoard(blankStudentReport(1)).flatMap((category) => category.items.map((item) => item.catalogItemId));
  assert.equal(blank.includes('move.shrimp'), false);
  assert.equal(blank.includes('def.sprawl'), false);
  assert.equal(blank.includes('def.guard-retention'), true);
  const saved = setFundamentalLevel(blankStudentReport(1), { catalogItemId: 'move.shrimp', categoryId: 'movement', name: 'Shrimp' }, 2, 2);
  const again = fundamentalsBoard(saved).flatMap((category) => category.items.map((item) => item.catalogItemId));
  assert.equal(again.includes('move.shrimp'), true);
});
