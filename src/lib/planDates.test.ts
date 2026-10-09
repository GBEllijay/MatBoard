import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emptyCurriculum } from './competitionCurriculum.ts';
import { searchCurriculumPlans } from './competitionCurriculum.ts';
import { emptyVideoPlan } from './techniqueLogic.ts';
import {
  clipIdsOnOtherPlanDates,
  readTechniquePlanDateStore,
  rememberTechniquePlanDate,
  techniquePlanForDate,
} from './techniquePlanDates.ts';
import { emptyPlan, searchLessonPlans, shiftPlanDate } from './trainingNotesStore.ts';

test('previous and next stay inside the saved window and search finds an older plan', () => {
  assert.equal(shiftPlanDate('2026-10-09', '2026-10-09', 1), null);
  assert.equal(shiftPlanDate('2026-10-09', '2026-10-09', -1), '2026-10-08');
  assert.equal(shiftPlanDate('2026-09-26', '2026-10-09', -1), null);

  const older = emptyPlan();
  older.id = 'day-one';
  older.intro = 'Day one guard.';
  older.classDesignation = 'GB1';
  const today = emptyPlan();
  today.id = 'day-three';
  today.intro = 'Day three pass.';
  const archive = {
    version: 3 as const,
    days: {
      '2026-10-07': { plans: [older] },
      '2026-10-09': { plans: [today] },
    },
  };
  const hits = searchLessonPlans(archive, '2026-10-09', 'guard');
  assert.equal(hits.length, 1);
  assert.equal(hits[0]?.dateKey, '2026-10-07');
  assert.equal(hits[0]?.planId, 'day-one');
  assert.equal(searchLessonPlans(archive, '2026-10-09', '   ').length, 0);

  const curriculum = emptyCurriculum();
  curriculum.id = 'curr-1';
  curriculum.blocks[0].notes = 'Day one guard pass.';
  const found = searchCurriculumPlans(
    { version: 1, days: { '2026-10-07': { plans: [curriculum] } } },
    '2026-10-09',
    'guard pass',
  );
  assert.equal(found[0]?.dateKey, '2026-10-07');
});

test('day 1 video stays on day 1 when day 3 has a different clip', () => {
  const dayOne = emptyVideoPlan();
  const dayThree = emptyVideoPlan();
  const oneSlot = dayOne.slots.find((slot) => slot.kind === 'technique');
  const threeSlot = dayThree.slots.find((slot) => slot.kind === 'technique');
  assert.ok(oneSlot && threeSlot);
  oneSlot.clipId = 'clip-day1';
  oneSlot.mediaName = 'day-one.mp4';
  threeSlot.clipId = 'clip-day3';
  threeSlot.mediaName = 'day-three.mp4';

  let store = readTechniquePlanDateStore(null);
  store = rememberTechniquePlanDate(store, '2026-10-07', dayOne, '2026-10-09');
  store = rememberTechniquePlanDate(store, '2026-10-09', dayThree, '2026-10-09');
  const known = ['clip-day1', 'clip-day3'];
  const loadedOne = techniquePlanForDate(store, '2026-10-07', known);
  const loadedThree = techniquePlanForDate(store, '2026-10-09', known);
  assert.equal(loadedOne?.slots.find((slot) => slot.clipId === 'clip-day1')?.mediaName, 'day-one.mp4');
  assert.equal(loadedThree?.slots.find((slot) => slot.clipId === 'clip-day3')?.mediaName, 'day-three.mp4');
  assert.equal(techniquePlanForDate(store, '2026-10-08', known), null);
  assert.deepEqual(clipIdsOnOtherPlanDates(store, '2026-10-09'), ['clip-day1']);

  const notes = readFileSync(new URL('../pages/TrainingNotes.tsx', import.meta.url), 'utf8');
  const nav = readFileSync(new URL('../components/PlanDateNav.tsx', import.meta.url), 'utf8');
  assert.match(nav, /Previous day/);
  assert.match(nav, /Next day/);
  assert.match(nav, /Calendar/);
  assert.match(nav, /Search plans/);
  assert.match(notes, /PlanDateNav/);
  assert.match(notes, /loadTechniqueBoardForDate\(viewKey\)/);
  assert.match(notes, /showVideo=\{offer\.show\}/);
  assert.match(notes, /ClassPhotoPromotions dateKey=\{viewKey\}/);
  const curriculumPage = readFileSync(new URL('../pages/CompetitionCurriculum.tsx', import.meta.url), 'utf8');
  assert.match(curriculumPage, /PlanDateNav/);
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.notes__recent-btn--on[\s\S]*background:\s*var\(--permission-on\)/);
});
