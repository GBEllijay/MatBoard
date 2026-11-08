/**
 * Example ancestry scopes. Counts, shared lines, and academy medals.
 * No profile storage and no competition management.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  academyCompetition,
  academySummary,
  ancestorsOf,
  exampleFixture,
  findCycle,
  headTrees,
  instructorSummary,
  medalCounts,
  OWNER_LINE,
  personalMatHours,
  placeAncestry,
  PREVIEW_SURFACES,
  resultInAcademyScope,
  sharedAncestorIds,
  sharedRosterCopies,
  teachingHours,
  teamAwardRollup,
  trainedWith,
} from './model.ts';

const fixture = exampleFixture();

test('two head instructors are separate lines that still share an ancestor', () => {
  const trees = headTrees(fixture, 'mira');
  assert.equal(trees.length, 2);
  assert.deepEqual(trees.map((tree) => tree.headId), ['ellis', 'jonah']);
  assert.equal(trees.every((tree) => tree.cycle === false), true);
  assert.equal(trees.every((tree) => tree.ids.includes('ivo')), true);
  assert.notEqual(trees[0].ids[1], trees[1].ids[1]);
  assert.equal(headTrees(fixture, 'theo').length, 1);
  assert.deepEqual(trainedWith(fixture, 'mira').map((row) => row.personId), ['ren']);
  assert.equal(trees.some((tree) => tree.ids.includes('ren')), false);
});

test('the academy drawing uses each shared ancestor once and has no cycle', () => {
  assert.equal(findCycle(fixture.ancestry), null);
  assert.deepEqual(sharedAncestorIds(fixture), ['ivo', 'nia']);
  const graph = placeAncestry(fixture);
  const ids = graph.nodes.map((node) => node.id);
  assert.equal(ids.filter((id) => id === 'ivo').length, 1);
  assert.equal(ids.filter((id) => id === 'nia').length, 1);
  assert.equal(graph.nodes.find((node) => node.id === 'ivo')?.shared, true);
  assert.equal(graph.nodes.find((node) => node.id === 'soren')?.shared, false);
  assert.equal(graph.nodes.some((node) => node.id === 'mira'), false);
  const loop = findCycle([
    { teacherId: 'a', learnerId: 'b' },
    { teacherId: 'b', learnerId: 'a' },
  ]);
  assert.deepEqual(loop, ['a', 'b', 'a']);
  assert.equal(ancestorsOf(fixture, 'ellis').cycle, false);
});

test('academy people and promotions are unique, and past is not active', () => {
  const summary = academySummary(fixture);
  assert.equal(summary.activeProfessors, 2);
  assert.equal(summary.pastProfessors, 2);
  assert.equal(summary.uniqueProfessors, 4);
  assert.equal(summary.uniqueStudents, 4);
  assert.equal(summary.naiveStudentSum, 5);
  assert.equal(summary.studentMatHours.hours, 640 + 210 + 36 + 880);
  assert.deepEqual(summary.studentMatHours.missingIds, []);
  assert.equal(summary.professorMatHours.hours, 4180 + 5100);
  assert.deepEqual([...summary.professorMatHours.missingIds].sort(), ['jonah', 'lila']);
  assert.notEqual(summary.studentMatHours.hours, summary.professorMatHours.hours);
  assert.deepEqual(summary.promotionsHere, { belts: 5, stripes: 2 });
  assert.equal(summary.promotionsOutside, 1);
  assert.equal('averageBelt' in summary, false);
  assert.equal('rankTotal' in summary, false);
  const ellis = instructorSummary(fixture, 'ellis');
  const jonah = instructorSummary(fixture, 'jonah');
  assert.equal(ellis.status, 'active');
  assert.equal(jonah.status, 'past');
  assert.equal(ellis.personalMatHours.linked && ellis.personalMatHours.hours, 4180);
  assert.equal(ellis.attachedStudentMatHours.hours, 640 + 36);
  assert.notEqual(ellis.personalMatHours.linked && ellis.personalMatHours.hours, ellis.attachedStudentMatHours.hours);
  assert.deepEqual(ellis.issuedHere, { belts: 2, stripes: 1 });
  assert.deepEqual(jonah.issuedHere, { belts: 0, stripes: 1 });
  assert.deepEqual(jonah.issuedLifetime, { belts: 1, stripes: 1 });
  assert.equal(jonah.personalMatHours.linked, false);
  assert.equal('hours' in jonah.personalMatHours, false);
  assert.equal('medals' in ellis, false);
});

test('the owner line stops at Master Carlos and personal hours are not the example roster', () => {
  const line = ancestorsOf(fixture, 'you');
  assert.deepEqual(line.ids, ['you', 'fabio', 'carlos', 'helio', 'carlos-sr']);
  assert.equal(line.cycle, false);
  assert.equal(OWNER_LINE, 'You → Professor Fabio Acosta → Master Carlos Gracie Junior → Helio Gracie → Carlos Gracie Senior');
  const fabio = fixture.ancestry.find((row) => row.id === 'edge-carlos-fabio');
  const helio = fixture.ancestry.find((row) => row.id === 'edge-helio-carlos');
  const senior = fixture.ancestry.find((row) => row.id === 'edge-sr-helio');
  assert.match(fabio?.relation ?? '', /Not a black belt promotion/);
  assert.match(helio?.relation ?? '', /Awarded Carlos Gracie Junior his black belt/);
  assert.match(senior?.relation ?? '', /Not a black belt promotion/);
  assert.equal(fixture.people.some((row) => /Rolls|Fabio Costa/i.test(row.name)), false);
  const hours = personalMatHours(fixture, 'you');
  assert.equal(hours.linked && hours.hours, 240);
  assert.notEqual(hours.linked && hours.hours, 4180);
  assert.equal(teachingHours(fixture, 'you'), 180);
  const shifted = {
    ...fixture,
    studentProfiles: fixture.studentProfiles.map((row) => (row.personId === 'you' ? { ...row, matHours: 12 } : row)),
  };
  const moved = personalMatHours(shifted, 'you');
  assert.equal(moved.linked && moved.hours, 12);
  assert.equal(teachingHours(shifted, 'you'), 180);
  assert.equal(instructorSummary(fixture, 'you').attachedStudentMatHours.hours, 0);
});

test('gym awards are unique places and are not student medals', () => {
  const awards = academySummary(fixture).teamAwards;
  assert.deepEqual({ first: awards.first, second: awards.second, third: awards.third, total: awards.total }, { first: 1, second: 1, third: 0, total: 2 });
  assert.equal(fixture.teamAwards.length, 3);
  const again = teamAwardRollup([...fixture.teamAwards, fixture.teamAwards[1]]);
  assert.equal(again.total, 2);
  assert.notEqual(awards.total, academySummary(fixture).competition.medals.gold + academySummary(fixture).competition.medals.silver);
});

test('full pages and 2036 menus are separate routes and do not write records', () => {
  const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
  for (const path of [
    '/preview/ancestry-student',
    '/preview/ancestry-instructor',
    '/preview/ancestry-academy',
    '/preview/profiles',
    '/preview/profile-student',
    '/preview/profile-instructor',
    '/preview/profile-academy',
    '/preview/2036-student',
    '/preview/2036-instructor',
    '/preview/2036-academy',
  ]) {
    assert.match(app, new RegExp(path.replace(/\//g, '\\/')));
  }
  const pages = readFileSync(new URL('./ProfilePages.tsx', import.meta.url), 'utf8');
  const future = readFileSync(new URL('./Future2036.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(`${pages}\n${future}`, /localStorage|fetch\(|stripe|billing/i);
  assert.match(future, /Not a product announcement/);
  assert.match(pages, /OWNER_LINE/);
  assert.match(pages, /Gym\/team awards/);
});

test('the three preview tabs use the profile names and wrap', () => {
  assert.deepEqual(
    PREVIEW_SURFACES.filter((surface) => surface.id !== 'my-profile').map((surface) => surface.title),
    ['Student profile', 'Instructor profile', 'Academy profile'],
  );
  const css = readFileSync(new URL('./ancestryScope.css', import.meta.url), 'utf8');
  const view = readFileSync(new URL('./AncestryScopePreview.tsx', import.meta.url), 'utf8');
  assert.match(css, /\.ancestry-scope\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.doesNotMatch(view, /character sheet/i);
});

test('academy medals dedupe shared rosters and stay separate from wins', () => {
  const silver = fixture.results.find((row) => row.id === 'res-mira-city-middle');
  const gold = fixture.results.find((row) => row.id === 'res-theo-harbor');
  const open = fixture.results.find((row) => row.id === 'res-mira-city-open');
  const outside = fixture.results.find((row) => row.id === 'res-noa-winter');
  assert.ok(silver && gold && open && outside);
  assert.equal(resultInAcademyScope(fixture, silver), true);
  assert.equal(resultInAcademyScope(fixture, outside), false);
  assert.equal(silver.matches.filter((match) => match.result === 'win').length, 0);
  assert.equal(silver.matches.filter((match) => match.result === 'loss').length, 1);
  assert.equal(gold.matches.length, 0);
  assert.equal(gold.medal, 'gold');
  assert.notEqual(open.id, silver.id);
  assert.equal(open.classKind, 'open');
  const copies = sharedRosterCopies(fixture).filter((row) => row.resultId === silver.id);
  assert.equal(copies.length, 2);
  const competition = academyCompetition(fixture);
  assert.deepEqual(competition.medals, { gold: 2, silver: 1, bronze: 1 });
  assert.deepEqual(competition.matches, { wins: 4, losses: 1, draws: 0 });
  assert.notEqual(competition.matches.wins, competition.medals.gold);
  assert.equal(competition.rankingPoints, 12);
  assert.equal(competition.results.some((row) => row.id === outside.id), false);
  assert.equal(medalCounts([silver, silver]).silver, 2);
  assert.equal(competition.byTournament.find((row) => row.tournament === 'City Open 2024')?.results.length, 2);
});

test('the preview files do not touch records, billing, or competition management', () => {
  const model = readFileSync(new URL('./model.ts', import.meta.url), 'utf8');
  const view = readFileSync(new URL('./AncestryScopePreview.tsx', import.meta.url), 'utf8');
  const bundle = `${model}\n${view}`;
  assert.doesNotMatch(bundle, /localStorage|sessionStorage|STRIPE_|writeGymProfile|studentBackup|rosterStore|ENTITLEMENT/);
  assert.match(view, /data-testid="academy-medals"/);
  assert.match(view, /Competition totals stay on the Academy profile/);
  assert.doesNotMatch(view, /Competition management|useProUnlocked|subscription/);
});
