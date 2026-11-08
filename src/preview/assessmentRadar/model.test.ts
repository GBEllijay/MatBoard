import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ASSESSMENT_AREAS } from '../../lib/studentAssessment.ts';
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
  assert.equal(radarPoints([5, 5, 5, 5, 5, 5, 5]).split(' ').length, 7);
});

test('a partial rating leaves a gap instead of a zero at the middle', () => {
  const seed = seedPreview();
  const manual = shapeValues(seed, 'manual');
  assert.deepEqual(manual, [5, 3, null, 4, 2, 4, 2, 3]);
  assert.equal(closedRatingPoints(manual), null);
  const segments = ratingSegments(manual);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].length, 7);
  assert.ok(near(segments[0][0], pointOnAxis(3, 4)));
  assert.ok(near(segments[0][6], pointOnAxis(1, 3)));
  const dots = ratingDots(manual);
  assert.equal(dots.length, 7);
  assert.equal(dots.some((dot) => dot.index === 2), false);
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
  assert.equal(Object.hasOwn(seed.manual, 'control'), false);
  const drafted = setManualScore(seed, 'control', 4);
  assert.equal(drafted.manual.control, 4);
  assert.equal(seed.manual.guard, 5);
  assert.equal(Object.hasOwn(seed.manual, 'control'), false);
  assert.equal(drafted.cards.length, seed.cards.length);
  assert.equal(drafted.cards[1].rating, seed.cards[1].rating);
  const closed = closedRatingPoints(shapeValues(drafted, 'manual'));
  assert.ok(closed);
  assert.equal(closed?.length, 8);
  assert.equal(ratingSegments(shapeValues(drafted, 'manual')).length, 0);
  const cleared = setManualScore(drafted, 'control', null);
  assert.equal(cleared.manual.control, undefined);
  assert.equal(legacyControlMissing(cleared), true);
  assert.equal(shapeValues(cleared, 'manual')[2], null);
});

test('Deep half guard is an explicit Guard sample and categories stay distinct', () => {
  const seed = seedPreview();
  const deep = seed.techniques.find((row) => row.name === SAMPLE_GUARD_NAME);
  assert.ok(deep);
  assert.equal(deep?.sample, true);
  assert.equal(deep?.kind, 'position');
  assert.deepEqual(deep?.categories, ['guard']);
  const rejected = setTechniqueCategories(seed, deep?.id ?? '', ['guard', 'conditioning', 'mindset', 'passing']);
  assert.deepEqual(rejected.techniques.find((row) => row.id === deep?.id)?.categories, ['guard', 'passing']);
  assert.equal(seed.techniques.find((row) => row.id === deep?.id)?.categories.join(), 'guard');
  const guard = AXES.find((axis) => axis.id === 'guard');
  const escapes = AXES.find((axis) => axis.id === 'escapes');
  const passing = AXES.find((axis) => axis.id === 'passing');
  const control = AXES.find((axis) => axis.id === 'control');
  assert.match(guard?.meaning ?? '', /not escaping/i);
  assert.match(guard?.meaning ?? '', /not passing/i);
  assert.match(escapes?.meaning ?? '', /not the same as keeping your guard/i);
  assert.match(passing?.meaning ?? '', /past their guard/i);
  assert.match(control?.meaning ?? '', /side control/i);
  assert.match(control?.meaning ?? '', /mount/i);
  assert.match(control?.meaning ?? '', /back holds/i);
  assert.equal(AXES.find((axis) => axis.id === 'conditioning')?.manualOnly, true);
  assert.equal(AXES.find((axis) => axis.id === 'mindset')?.manualOnly, true);
});

test('category scores use the latest card once and do not treat a gap as zero', () => {
  const seed = seedPreview();
  const deepId = seed.techniques.find((row) => row.name === SAMPLE_GUARD_NAME)?.id ?? '';
  const deepCards = seed.cards.filter((row) => row.techniqueId === deepId);
  assert.equal(deepCards.length, 2);
  assert.equal(latestCard(deepCards)?.rating, 4);
  const guard = categorySummary(seed, 'guard');
  assert.equal(guard.score, 3.5);
  assert.equal(guard.ratedCount, 2);
  assert.equal(guard.taggedCount, 2);
  assert.equal(guard.formula, '(4 + 3) / 2 = 3.5');
  assert.equal(guard.contributors.some((row) => row.earlier.some((card) => card.rating === 2)), true);
  const control = categorySummary(seed, 'control');
  assert.equal(control.score, 4.3);
  assert.equal(control.formula, '(4 + 4 + 5) / 3 = 4.3');
  assert.equal(control.ratedCount, 3);
  assert.equal(control.taggedCount, 4);
  assert.deepEqual(control.unrated.map((row) => row.name), ['Back control']);
  assert.notEqual(control.score, averageRatings([4, 4, 5, 0]));
  const passing = categorySummary(seed, 'passing');
  assert.equal(passing.score, 4);
  assert.equal(passing.formula, '(5 + 3) / 2 = 4.0');
  const conditioning = categorySummary(seed, 'conditioning');
  assert.equal(conditioning.status, 'manual-only');
  assert.equal(conditioning.score, null);
  assert.equal(conditioning.manualScore, 2);
  const mindset = categorySummary(seed, 'mindset');
  assert.equal(mindset.score, null);
  assert.equal(mindset.status, 'manual-only');
  const cleared = setLatestRating(setLatestRating(seed, 'tech-deep-half', null), 'tech-closed', null);
  const emptyGuard = categorySummary(cleared, 'guard');
  assert.equal(emptyGuard.score, null);
  assert.equal(emptyGuard.status, 'not-rated');
  assert.equal(emptyGuard.taggedCount, 2);
  assert.equal(shapeValues(cleared, 'techniques')[0], null);
  assert.equal(cleared.manual.guard, 5);
});

test('a technique is counted once even when two categories receive its rating', () => {
  const seed = seedPreview();
  assert.equal(techniqueCount(seed), 13);
  assert.equal(journalCardCount(seed), 13);
  assert.equal(ratedTechniqueIds(seed).length, 12);
  assert.equal(contributionSlotCount(seed), 13);
  assert.equal(ratedTechniqueIds(seed).filter((id) => id === 'tech-arm-drag').length, 1);
  const drag = seed.techniques.find((row) => row.id === 'tech-arm-drag');
  assert.deepEqual(drag?.categories, ['takedowns', 'control']);
  assert.equal(categorySummary(seed, 'takedowns').contributors.filter((row) => row.techniqueId === 'tech-arm-drag').length, 1);
  assert.equal(categorySummary(seed, 'control').contributors.filter((row) => row.techniqueId === 'tech-arm-drag').length, 1);
  const edited = setLatestRating(seed, 'tech-deep-half', 1);
  assert.equal(categorySummary(edited, 'guard').score, 2);
  assert.equal(edited.manual.guard, 5);
  assert.equal(latestCard(seed.cards.filter((row) => row.techniqueId === 'tech-deep-half'))?.rating, 4);
  assert.equal(setLatestRating(seed, 'missing', 3), seed);
  assert.equal(setManualScore(seed, 'guard', 1).cards[0].rating, seed.cards[0].rating);
});

test('manual and technique shapes stay separate, including a missing Control score', () => {
  const seed = seedPreview();
  assert.deepEqual(shapeValues(seed, 'techniques'), [3.5, 4, 4.3, 3.5, 3, 3.5, null, null]);
  const manualDetail = detailCopy(seed, 'control', 'manual');
  assert.match(manualDetail.scoreLine, /not rated/);
  assert.match(manualDetail.how, /7-area/);
  assert.match(manualDetail.how, /not a score of 0/);
  assert.match(manualDetail.how, /not copied/);
  const guardDetail = detailCopy(seed, 'guard', 'techniques');
  assert.match(guardDetail.scoreLine, /3\.5/);
  assert.match(guardDetail.how, /Deep half guard 4/);
  assert.match(guardDetail.how, /\(4 \+ 3\) \/ 2 = 3\.5/);
  assert.match(guardDetail.how, /not a second vote/);
  assert.equal(guardDetail.techniques.some((row) => row.name === SAMPLE_GUARD_NAME), true);
  const manualGuard = detailCopy(seed, 'guard', 'manual');
  assert.match(manualGuard.scoreLine, /Manual check-in: 5/);
  assert.match(manualGuard.how, /D-path guard/);
  assert.match(manualGuard.techniques.find((row) => row.name === SAMPLE_GUARD_NAME)?.line ?? '', /Not added into the manual check-in/);
  const conditioning = detailCopy(seed, 'conditioning', 'techniques');
  assert.match(conditioning.scoreLine, /manual only/);
  assert.match(conditioning.how, /does not invent a number/);
  assert.equal(conditioning.techniques.length, 0);
  const label = chartLabel(seed, 'manual');
  assert.match(label, /Regular octagon/);
  assert.match(label, /Control Not rated/);
  assert.doesNotMatch(label, /Control 0/);
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
  assert.match(radar, /ASSESSMENT_AREAS\.length/);
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
  const guard = categoryDestination(seed, 'guard');
  assert.equal(guard.items[0]?.name, 'Deep half guard');
  assert.equal(guard.items[0]?.source, 'sample');
  assert.equal(guard.items.some((item) => item.id === 'pos.closed-guard'), true);
  assert.equal(guard.items.some((item) => item.id === 'def.guard-retention'), true);
  assert.equal(guard.items.some((item) => item.id === 'sweep.scissor'), false);
  assert.equal(guard.items.some((item) => item.id === 'pos.turtle'), false);
  const passing = categoryDestination(seed, 'passing');
  assert.equal(passing.items[0]?.name, 'Knee slice');
  assert.equal(passing.items.some((item) => item.name === 'Knee slice pass'), true);
  assert.match(passing.items.find((item) => item.name === 'Knee slice pass')?.detail ?? '', /Not a score and not a mastery mark/);
  const control = categoryDestination(seed, 'control');
  assert.equal(control.items.some((item) => item.id === 'pos.side-control'), true);
  assert.equal(control.items.some((item) => item.id === 'pos.mount'), true);
  assert.equal(control.items.some((item) => item.id === 'pos.back-control'), true);
  assert.equal(control.items.some((item) => item.id === 'pos.turtle'), false);
  const conditioning = categoryDestination(seed, 'conditioning');
  assert.equal(conditioning.fundamentals.length, 0);
  assert.equal(conditioning.benchmarks.length, 0);
  assert.match(conditioning.note, /empty on purpose/);
  const mindset = categoryDestination(seed, 'mindset');
  assert.equal(mindset.items.length, 0);
  const escapes = categoryDestination(seed, 'escapes');
  assert.equal(escapes.items.some((item) => item.name === 'Mount escape' && item.source === 'fundamentals'), true);
});
