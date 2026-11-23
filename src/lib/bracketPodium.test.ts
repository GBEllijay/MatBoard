import assert from 'node:assert/strict';
import test from 'node:test';
import { podiumPlaces } from './bracketPodium.ts';
import {
  applyMatchOutcome,
  applySeedNames,
  defaultTournament,
  slotName,
  type BracketMatchId,
  type MatchSide,
  type TournamentState,
} from './tournamentStore.ts';

const NAMES_8 = ['Ada Cruz', 'Bea Ortiz', 'Cam Diaz', 'Dee Kim', 'Eli Nash', 'Finn Shaw', 'Gabe Cole', 'Hugo Lane'];
const NAMES_4 = NAMES_8.slice(0, 4);
const NAMES_2 = NAMES_8.slice(0, 2);

function play(
  size: number,
  names: readonly string[],
  winners: ReadonlyArray<readonly [BracketMatchId, MatchSide]>,
): TournamentState {
  let board = applySeedNames(defaultTournament(size), names);
  for (const [matchId, side] of winners) {
    board = applyMatchOutcome(board, matchId, side, { call: 'win', method: 'points' });
  }
  return board;
}

test('podiumPlaces is empty before any results', () => {
  const board = applySeedNames(defaultTournament(8), NAMES_8);
  assert.deepEqual(podiumPlaces(board), { first: '', second: '', third: [] });
});

test('a 2-person final yields champion and runner-up only', () => {
  const board = play(2, NAMES_2, [['final-0', 'a']]);
  const places = podiumPlaces(board);
  assert.equal(places.first, slotName(board, 'champion'));
  assert.ok(places.first);
  assert.ok(places.second);
  assert.notEqual(places.second, places.first);
  assert.deepEqual(places.third, []);
});

test('a completed 4-person bracket names 2nd from the final and both semi losers as 3rd', () => {
  const board = play(4, NAMES_4, [
    ['sf-0', 'a'],
    ['sf-1', 'b'],
    ['final-0', 'a'],
  ]);
  const places = podiumPlaces(board);
  assert.equal(places.first, slotName(board, 'champion'));
  assert.ok(places.second);
  assert.notEqual(places.second, places.first);
  assert.equal(places.third.length, 2);
  assert.equal(new Set([places.first, places.second, ...places.third]).size, 4);
  for (const name of [places.first, places.second, ...places.third]) {
    assert.ok(NAMES_4.includes(name), name);
  }
});

test('a completed 8-person bracket fills 1st, 2nd, and both bronze from the semis', () => {
  const board = play(8, NAMES_8, [
    ['qf-0', 'a'],
    ['qf-1', 'b'],
    ['qf-2', 'a'],
    ['qf-3', 'b'],
    ['sf-0', 'a'],
    ['sf-1', 'a'],
    ['final-0', 'a'],
  ]);
  const places = podiumPlaces(board);
  assert.equal(places.first, slotName(board, 'champion'));
  assert.ok(places.second);
  assert.equal(places.third.length, 2);
  assert.equal(new Set([places.first, places.second, ...places.third]).size, 4);
});

test('semis without a final still yield bronze names and no 2nd', () => {
  const board = play(8, NAMES_8, [
    ['qf-0', 'a'],
    ['qf-1', 'b'],
    ['qf-2', 'a'],
    ['qf-3', 'b'],
    ['sf-0', 'a'],
    ['sf-1', 'a'],
  ]);
  const places = podiumPlaces(board);
  assert.equal(places.first, '');
  assert.equal(places.second, '');
  assert.equal(places.third.length, 2);
});

test('a 3-person consolation loser is the only 3rd', () => {
  const board = play(3, ['Ada Cruz', 'Bea Ortiz', 'Cam Diaz'], [
    ['sf-0', 'a'],
    ['sf-1', 'a'],
    ['final-0', 'a'],
  ]);
  const places = podiumPlaces(board);
  assert.ok(places.first);
  assert.ok(places.second);
  assert.equal(places.third.length, 1);
  assert.equal(new Set([places.first, places.second, ...places.third]).size, 3);
});
