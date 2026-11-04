import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canonicalRoundValue,
  roundFromBracket,
  scoreboardCompetitionFields,
} from './matchRound.ts';
import { roundDisplay } from './roundDisplay.ts';
import { DEFAULT_MATCH_MS, MATCH_LENGTH_RANGE, snapDurationMs } from './timeWheel.ts';

test('bracket position fills the scoreboard round menu', () => {
  assert.equal(roundFromBracket('r16-0', 16), '1');
  assert.equal(roundFromBracket('qf-0', 16), 'Quarterfinal');
  assert.equal(roundFromBracket('sf-0', 16), 'Semifinal');
  assert.equal(roundFromBracket('final-0', 16), 'Final');
  assert.equal(roundFromBracket('r32-3', 32), '1');
  assert.equal(roundFromBracket('r16-0', 32), '2');
  assert.equal(roundFromBracket('r64-0', 64), '1');
  assert.equal(roundFromBracket('r32-0', 64), '2');
  assert.equal(roundFromBracket('r16-0', 64), '3');
  assert.equal(roundFromBracket('qf-0', 8), 'Quarterfinal');
  assert.equal(roundFromBracket('sf-0', 4), 'Semifinal');
  assert.equal(roundFromBracket('final-0', 2), 'Final');
});

test('saved round text maps onto the menu and unknown text is kept', () => {
  assert.equal(canonicalRoundValue('1'), '1');
  assert.equal(canonicalRoundValue('Quarterfinals'), 'Quarterfinal');
  assert.equal(canonicalRoundValue('Semifinals'), 'Semifinal');
  assert.equal(canonicalRoundValue('Finals'), 'Final');
  assert.equal(canonicalRoundValue('Third place'), 'Third place');
  assert.equal(canonicalRoundValue('Superfight'), 'Superfight');
  assert.equal(canonicalRoundValue('  '), '');
  assert.equal(canonicalRoundValue('Saturday squad'), 'Saturday squad');
});

test('known rounds display once, and a linked custom label stays as typed', () => {
  assert.equal(roundDisplay('1', false), 'Round 1');
  assert.equal(roundDisplay('1', true), 'Round 1');
  assert.equal(roundDisplay('Quarterfinal', false), 'Quarterfinal');
  assert.equal(roundDisplay('Final', true), 'Final');
  assert.equal(roundDisplay(' Finals ', false), 'Round Finals');
  assert.equal(roundDisplay('Semifinals', true), 'Semifinals');
  assert.equal(roundDisplay('', true), '');
});

test('scoreboard division, weight, and round feed the competition packet names', () => {
  assert.deepEqual(
    scoreboardCompetitionFields({
      round: 'Final',
      division: ' Adult Blue ',
      weight: ' Feather ',
      bracketMatchId: 'final-0',
    }),
    { division: 'Adult Blue', weightClass: 'Feather', round: 'Final' },
  );
  assert.deepEqual(
    scoreboardCompetitionFields({ round: '', division: '', weight: '   ', bracketMatchId: null }),
    { division: '', weightClass: '', round: '' },
  );
});

test('saved match length snaps to 10 seconds and 3:00, 5:00, 10:00 stay put', () => {
  assert.equal(DEFAULT_MATCH_MS, 5 * 60_000);
  assert.equal(snapDurationMs(5 * 60_000, MATCH_LENGTH_RANGE, DEFAULT_MATCH_MS), 5 * 60_000);
  assert.equal(snapDurationMs(3 * 60_000, MATCH_LENGTH_RANGE, DEFAULT_MATCH_MS), 3 * 60_000);
  assert.equal(snapDurationMs(10 * 60_000, MATCH_LENGTH_RANGE, DEFAULT_MATCH_MS), 10 * 60_000);
  assert.equal(snapDurationMs(4 * 60_000 + 7_000, MATCH_LENGTH_RANGE, DEFAULT_MATCH_MS), 4 * 60_000 + 10_000);
  assert.ok(MATCH_LENGTH_RANGE.snapsMs?.includes(3 * 60_000));
  assert.ok(MATCH_LENGTH_RANGE.snapsMs?.includes(5 * 60_000));
  assert.ok(MATCH_LENGTH_RANGE.snapsMs?.includes(10 * 60_000));
});
