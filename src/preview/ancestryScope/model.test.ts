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
  placeAncestry,
  resultInAcademyScope,
  sharedAncestorIds,
  sharedRosterCopies,
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
  assert.equal(summary.studentMatHours, 640 + 210 + 36 + 880);
  assert.notEqual(summary.studentMatHours, summary.professorOwnMatHours);
  assert.deepEqual(summary.promotionsHere, { belts: 5, stripes: 2 });
  assert.equal(summary.promotionsOutside, 1);
  assert.equal('averageBelt' in summary, false);
  assert.equal('rankTotal' in summary, false);
  const ellis = instructorSummary(fixture, 'ellis');
  const jonah = instructorSummary(fixture, 'jonah');
  assert.equal(ellis.status, 'active');
  assert.equal(jonah.status, 'past');
  assert.equal(ellis.ownMatHours, 4180);
  assert.equal(ellis.attachedStudentMatHours, 640 + 36);
  assert.notEqual(ellis.ownMatHours, ellis.attachedStudentMatHours);
  assert.deepEqual(ellis.issuedHere, { belts: 2, stripes: 1 });
  assert.deepEqual(jonah.issuedHere, { belts: 0, stripes: 1 });
  assert.deepEqual(jonah.issuedLifetime, { belts: 1, stripes: 1 });
  assert.equal('medals' in ellis, false);
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
  assert.match(view, /Competition totals stay on the Pro academy page/);
  assert.doesNotMatch(view, /Competition management|useProUnlocked|subscription/);
});
