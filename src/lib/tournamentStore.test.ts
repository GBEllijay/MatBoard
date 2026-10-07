import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OWNER_BRACKET_CLOUD,
  applyClearResult,
  applyCompetitorCount,
  applyDeleteBracket,
  applyMatchOutcome,
  applyUndoOutcome,
  applyNewBracket,
  applyRenameBracket,
  applySeedNames,
  applySlotName,
  applySwitchBracket,
  bracketHasCompetitors,
  bracketHasContent,
  bracketRoundLine,
  byeCountFor,
  byeSlotIds,
  defaultLibrary,
  defaultTournament,
  displayBracketName,
  COACH_MAX_COMPETITORS,
  PRO_MAX_COMPETITORS,
  clampCompetitorCount,
  firstRoundLabel,
  matchHasBye,
  matchIdsForSize,
  maxCompetitors,
  parseNameList,
  nextSlot,
  normalizeLibrary,
  seedPlaceholder,
  seedSlots,
  SIZE_PRESETS,
  PRO_SIZE_PRESETS,
  applyPlacement,
  ibjjfSeedOrder,
  isThreePersonBracket,
  placementLabel,
  placementOf,
  TOURNAMENT_SIZE,
  treeSizeFor,
} from './tournamentStore.ts';

describe('bracket empty helpers', () => {
  it('treats a fresh board as empty', () => {
    const board = defaultTournament();
    assert.equal(bracketHasCompetitors(board), false);
    assert.equal(bracketHasContent(board), false);
  });

  it('counts a seed name as competitors and content', () => {
    const board = applySlotName(defaultTournament(), 'r16-0-a', 'Alex');
    assert.equal(bracketHasCompetitors(board), true);
    assert.equal(bracketHasContent(board), true);
  });

  it('counts a title or result as content without inventing competitors', () => {
    const titled = { ...defaultTournament(), title: 'Kids gi' };
    assert.equal(bracketHasCompetitors(titled), false);
    assert.equal(bracketHasContent(titled), true);
    const scored = applyMatchOutcome(defaultTournament(), 'r16-0', 'a', {
      call: 'win',
      method: 'submission',
    });
    assert.equal(bracketHasCompetitors(scored), false);
    assert.equal(bracketHasContent(scored), true);
  });

  it('labels empty seeds as competitors, not students', () => {
    assert.equal(seedPlaceholder(0), 'Competitor 1');
    assert.equal(seedPlaceholder(15), 'Competitor 16');
  });
});

describe('flexible bracket size', () => {
  it('pads non-powers of two to the next tree with seeded byes', () => {
    assert.equal(treeSizeFor(2), 2);
    assert.equal(treeSizeFor(3), 4);
    assert.equal(treeSizeFor(5), 8);
    assert.equal(treeSizeFor(7), 8);
    assert.equal(treeSizeFor(9), 16);
    assert.equal(treeSizeFor(16), 16);
    assert.equal(byeCountFor(5), 3);
    assert.equal(byeCountFor(7), 1);
    assert.equal(byeCountFor(8), 0);
    assert.equal(byeCountFor(9), 7);
    assert.deepEqual(ibjjfSeedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
    assert.deepEqual(byeSlotIds(5), ['qf-0-b', 'qf-2-b', 'qf-3-b']);
    assert.deepEqual(byeSlotIds(7), ['qf-0-b']);
    assert.deepEqual(byeSlotIds(5, 'lineup'), ['qf-1-b', 'qf-2-b', 'qf-3-b']);
    assert.equal(firstRoundLabel(5), 'Quarterfinals');
    assert.match(bracketRoundLine(defaultTournament(5)), /Seeded · Quarterfinals · 5 competitors · 3 byes/);
    assert.equal(TOURNAMENT_SIZE, 16);
    assert.equal(defaultTournament().size, 16);
    assert.equal(placementOf(defaultTournament()), 'ibjjf');
    assert.equal(placementLabel('ibjjf'), 'Seeded');
    assert.equal(placementLabel('lineup'), 'Lineup');
  });

  it('seeds an 8-person board so 1 meets 8 and 4 meets 5', () => {
    const board = defaultTournament(8);
    assert.deepEqual(seedSlots(board), [
      'qf-0-a',
      'qf-2-a',
      'qf-3-a',
      'qf-1-a',
      'qf-1-b',
      'qf-3-b',
      'qf-2-b',
      'qf-0-b',
    ]);
    assert.ok(matchIdsForSize(8).includes('qf-0'));
    assert.equal(matchIdsForSize(8).includes('r16-0'), false);
  });

  it('gives a 5-person field byes to seeds 1, 2, and 3, and opens with 4 vs 5', () => {
    let board = defaultTournament(5);
    const seeds = seedSlots(board);
    assert.deepEqual(seeds, ['qf-0-a', 'qf-2-a', 'qf-3-a', 'qf-1-a', 'qf-1-b']);
    board = applySlotName(board, seeds[0], 'Alex');
    board = applySlotName(board, seeds[1], 'Blair');
    board = applySlotName(board, seeds[2], 'Casey');
    board = applySlotName(board, seeds[3], 'Drew');
    board = applySlotName(board, seeds[4], 'Evan');
    assert.equal(matchHasBye(board, 'qf-0'), true);
    assert.equal(matchHasBye(board, 'qf-1'), false);
    assert.equal(board.entries['sf-0-a'], 'Alex');
    assert.equal(board.entries['sf-1-a'], 'Blair');
    assert.equal(board.entries['sf-1-b'], 'Casey');
    board = applyMatchOutcome(board, 'qf-1', 'a', { call: 'win', method: 'points' }, { toggle: false });
    assert.equal(board.entries['sf-0-b'], 'Drew');
    const ignored = applyMatchOutcome(board, 'qf-0', 'a', { call: 'win', method: 'submission' });
    assert.equal(ignored.results['qf-0'], undefined);
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'decision' }, { toggle: false });
    board = applyMatchOutcome(board, 'sf-1', 'b', { call: 'win', method: 'submission' }, { toggle: false });
    assert.equal(board.entries['final-0-a'], 'Alex');
    assert.equal(board.entries['final-0-b'], 'Casey');
  });

  it('gives a 7-person field a single bye to the 1st seed', () => {
    let board = defaultTournament(7);
    const seeds = seedSlots(board);
    assert.equal(seeds.length, 7);
    assert.equal(seeds[0], 'qf-0-a');
    assert.equal(seeds[1], 'qf-2-a');
    assert.equal(seeds[3], 'qf-1-a');
    assert.equal(seeds[6], 'qf-2-b');
    assert.deepEqual(byeSlotIds(7), ['qf-0-b']);
    board = applySlotName(board, seeds[0], 'Alex');
    board = applySlotName(board, seeds[1], 'Blair');
    board = applySlotName(board, seeds[6], 'Glen');
    assert.equal(board.entries['sf-0-a'], 'Alex');
    assert.equal(matchHasBye(board, 'qf-2'), false);
    board = applyMatchOutcome(board, 'qf-2', 'b', { call: 'win', method: 'points' }, { toggle: false });
    assert.equal(board.entries['sf-1-a'], 'Glen');
  });

  it('lets Pro save a 64-person board and keeps Coach changes at 16', () => {
    assert.equal(maxCompetitors(true), PRO_MAX_COMPETITORS);
    assert.equal(maxCompetitors(false), COACH_MAX_COMPETITORS);
    assert.equal(PRO_MAX_COMPETITORS, 64);
    assert.equal(treeSizeFor(17), 32);
    assert.equal(treeSizeFor(33), 64);
    assert.equal(treeSizeFor(64), 64);
    assert.equal(treeSizeFor(80), 64);
    assert.equal(clampCompetitorCount(80), 64);
    assert.equal(clampCompetitorCount(80, COACH_MAX_COMPETITORS), 16);
    assert.equal(firstRoundLabel(64), 'Round of 64');
    assert.equal(firstRoundLabel(32), 'Round of 32');
    assert.equal(matchIdsForSize(64).length, 63);
    assert.equal(matchIdsForSize(64)[0], 'r64-0');
    assert.equal(matchIdsForSize(16).includes('r64-0'), false);
    assert.equal(seedSlots(defaultTournament(64)).length, 64);
    assert.equal(nextSlot('r64-0'), 'r32-0-a');
    assert.equal(nextSlot('r64-1'), 'r32-0-b');
    assert.equal(nextSlot('r32-1'), 'r16-0-b');
    assert.equal(nextSlot('r16-0'), 'qf-0-a');
    assert.equal(nextSlot('final-0'), 'champion');
    const capped = applyCompetitorCount(defaultTournament(64), 64, COACH_MAX_COMPETITORS);
    assert.equal(capped.size, 16);
    let board = applySlotName(defaultTournament(64), 'r64-0-a', 'Alex');
    board = applySlotName(board, 'r64-0-b', 'Blair');
    board = applyMatchOutcome(board, 'r64-0', 'a', { call: 'win', method: 'points' });
    assert.equal(board.entries['r32-0-a'], 'Alex');
    assert.equal(board.results['r64-0']?.winnerSide, 'a');
  });

  it('keeps early seed names when shrinking and still records a win', () => {
    let board = defaultTournament(16);
    const seeds = seedSlots(board);
    board = applySlotName(board, seeds[0], 'Alex');
    board = applySlotName(board, seeds[1], 'Blair');
    board = applyCompetitorCount(board, 4);
    assert.equal(board.size, 4);
    assert.equal(board.placement, 'ibjjf');
    assert.equal(seedSlots(board)[0], 'sf-0-a');
    assert.equal(seedSlots(board)[1], 'sf-1-a');
    assert.equal(board.entries['sf-0-a'], 'Alex');
    assert.equal(board.entries['sf-1-a'], 'Blair');
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' });
    assert.equal(board.entries['final-0-a'], 'Alex');
    assert.equal(board.results['sf-0']?.winnerSide, 'a');
  });
});

describe('paste names into seed order', () => {
  it('splits lines, and commas only when the paste is one line', () => {
    assert.deepEqual(parseNameList('Ana\nBen\n\nCam'), ['Ana', 'Ben', 'Cam']);
    assert.deepEqual(parseNameList('Ana, Ben, Cam'), ['Ana', 'Ben', 'Cam']);
    assert.deepEqual(parseNameList('Ana, Ben\nCam'), ['Ana, Ben', 'Cam']);
    assert.deepEqual(parseNameList('  '), []);
    assert.deepEqual(parseNameList('Ana'), ['Ana']);
  });

  it('fills slots from a start index and leaves the rest', () => {
    const board = applySeedNames(defaultTournament(8), ['Ana', 'Ben', 'Cam'], 1);
    const seeds = seedSlots(board);
    assert.equal(board.entries[seeds[0]], undefined);
    assert.equal(board.entries[seeds[1]], 'Ana');
    assert.equal(board.entries[seeds[2]], 'Ben');
    assert.equal(board.entries[seeds[3]], 'Cam');
    assert.equal(board.entries[seeds[4]], undefined);
  });

  it('ignores names past the draw and refreshes a winner already advanced', () => {
    let board = applySeedNames(defaultTournament(4), ['Ana', 'Ben', 'Cam', 'Dee']);
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' });
    assert.equal(board.entries['final-0-a'], 'Ana');
    board = applySeedNames(board, ['Ava'], 0);
    assert.equal(board.entries['final-0-a'], 'Ava');
    assert.equal(board.results['sf-0']?.winnerSide, 'a');
    const extra = applySeedNames(defaultTournament(4), ['A', 'B', 'C', 'D', 'E']);
    assert.equal(Object.keys(extra.entries).length, 4);
  });
});

describe('3-person bracket', () => {
  it('is a size preset beside 2, 4, and 8, with no bye', () => {
    assert.deepEqual(SIZE_PRESETS, [2, 3, 4, 5, 7, 8, 16]);
    assert.deepEqual(PRO_SIZE_PRESETS, [2, 3, 4, 5, 7, 8, 16, 32, 64]);
    assert.equal(isThreePersonBracket(defaultTournament(3)), true);
    assert.equal(treeSizeFor(3), 4);
    assert.equal(byeCountFor(3), 0);
    assert.deepEqual(byeSlotIds(3), []);
    assert.equal(bracketRoundLine(defaultTournament(3)), 'Seeded · 3-person · 3 competitors');
    assert.equal(matchHasBye(defaultTournament(3), 'sf-0'), false);
    assert.equal(matchHasBye(defaultTournament(3), 'sf-1'), false);
  });

  it('places 2nd vs 3rd in the semifinal and parks 1st on the consolation card', () => {
    const board = defaultTournament(3);
    assert.deepEqual(seedSlots(board), ['sf-1-a', 'sf-0-a', 'sf-0-b']);
    assert.deepEqual(matchIdsForSize(3), ['sf-0', 'sf-1', 'final-0']);
    assert.equal(nextSlot('sf-0'), 'final-0-a');
    assert.equal(nextSlot('sf-1'), 'final-0-b');
  });

  it('sends the semifinal loser to face the 1st seed, then both winners to the final', () => {
    let board = applySlotName(defaultTournament(3), 'sf-1-a', 'Alex');
    board = applySlotName(board, 'sf-0-a', 'Blair');
    board = applySlotName(board, 'sf-0-b', 'Casey');
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
    assert.equal(board.entries['final-0-a'], 'Blair');
    assert.equal(board.entries['sf-1-b'], 'Casey');
    assert.equal(board.entries['sf-1-a'], 'Alex');
    board = applyMatchOutcome(board, 'sf-1', 'a', { call: 'win', method: 'submission' }, { toggle: false });
    assert.equal(board.entries['final-0-b'], 'Alex');
    board = applyMatchOutcome(board, 'final-0', 'b', { call: 'win', method: 'decision' }, { toggle: false });
    assert.equal(board.entries.champion, 'Alex');
    assert.equal(board.results['final-0']?.winnerSide, 'b');
  });

  it('follows the other semifinal winner and a DQ loser into the same graph', () => {
    let board = applySlotName(defaultTournament(3), 'sf-1-a', 'Alex');
    board = applySlotName(board, 'sf-0-a', 'Blair');
    board = applySlotName(board, 'sf-0-b', 'Casey');
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'dq', reason: 'technical' });
    assert.equal(board.results['sf-0']?.winnerSide, 'b');
    assert.equal(board.entries['final-0-a'], 'Casey');
    assert.equal(board.entries['sf-1-b'], 'Blair');
    board = applyMatchOutcome(board, 'sf-1', 'b', { call: 'win', method: 'points' }, { toggle: false });
    assert.equal(board.entries['final-0-b'], 'Blair');
  });

  it('clears both feeds when the semifinal result is removed', () => {
    let board = applySlotName(defaultTournament(3), 'sf-0-a', 'Blair');
    board = applySlotName(board, 'sf-0-b', 'Casey');
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
    board = applyClearResult(board, 'sf-0');
    assert.equal(board.entries['final-0-a'], undefined);
    assert.equal(board.entries['sf-1-b'], undefined);
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
    board = applyUndoOutcome(board, 'sf-0');
    assert.equal(board.results['sf-0'], undefined);
    assert.equal(board.entries['final-0-a'], undefined);
    assert.equal(board.entries['sf-1-b'], undefined);
  });

  it('updates the consolation name when a losing seed is renamed', () => {
    let board = applySlotName(defaultTournament(3), 'sf-0-a', 'Blair');
    board = applySlotName(board, 'sf-0-b', 'Casey');
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' }, { toggle: false });
    board = applySlotName(board, 'sf-0-b', 'Casey Ruiz');
    assert.equal(board.entries['sf-1-b'], 'Casey Ruiz');
    assert.equal(board.entries['final-0-a'], 'Blair');
  });

  it('keeps the first three seed names when a larger board shrinks to 3', () => {
    let board = defaultTournament(8);
    const seeds = seedSlots(board);
    board = applySlotName(board, seeds[0], 'Alex');
    board = applySlotName(board, seeds[1], 'Blair');
    board = applySlotName(board, seeds[2], 'Casey');
    board = applyCompetitorCount(board, 3);
    assert.equal(board.size, 3);
    assert.equal(board.entries['sf-1-a'], 'Alex');
    assert.equal(board.entries['sf-0-a'], 'Blair');
    assert.equal(board.entries['sf-0-b'], 'Casey');
    assert.equal(byeCountFor(5), 3);
  });

  it('lets an organizer switch to lineup order without inventing a second seed list', () => {
    let board = defaultTournament(5);
    const seeds = seedSlots(board);
    board = applySlotName(board, seeds[0], 'Alex');
    board = applySlotName(board, seeds[3], 'Drew');
    board = applyPlacement(board, 'lineup');
    assert.equal(board.placement, 'lineup');
    assert.equal(isThreePersonBracket(board), false);
    assert.deepEqual(byeSlotIds(board.size, 'lineup'), ['qf-1-b', 'qf-2-b', 'qf-3-b']);
    assert.equal(board.entries['qf-0-a'], 'Alex');
    assert.equal(seedSlots(board)[3], 'qf-2-a');
    assert.equal(board.entries['qf-2-a'], 'Drew');
    assert.match(bracketRoundLine(board), /Lineup · Quarterfinals · 5 competitors · 3 byes/);
    const three = applyPlacement(defaultTournament(3), 'lineup');
    assert.equal(isThreePersonBracket(three), false);
    assert.equal(byeCountFor(3, 'lineup'), 1);
    assert.deepEqual(byeSlotIds(3, 'lineup'), ['sf-1-b']);
    const back = applyPlacement(three, 'ibjjf');
    assert.equal(isThreePersonBracket(back), true);
    assert.equal(back.placement, 'ibjjf');
  });
});

describe('named on-device bracket library', () => {
  it('wraps a v1 board so existing device data is not dropped', () => {
    const lib = normalizeLibrary({
      version: 1,
      size: 16,
      title: 'Gi Blue Belt',
      entries: { 'r16-0-a': 'Alex' },
      results: {},
      lastOutcomeMatchId: null,
    });
    assert.equal(lib.version, 2);
    assert.equal(lib.saved.length, 1);
    assert.equal(lib.saved[0].name, 'Gi Blue Belt');
    assert.equal(lib.saved[0].board.entries['r16-0-a'], 'Alex');
  });

  it('switches between named boards without losing either', () => {
    let lib = defaultLibrary();
    lib = {
      ...lib,
      saved: [
        {
          ...lib.saved[0],
          name: 'Gi Blue Belt',
          board: applySlotName(defaultTournament(8), 'qf-0-a', 'Alex'),
        },
      ],
    };
    lib = applyNewBracket(lib, 4);
    const secondId = lib.activeId;
    lib = applyRenameBracket(lib, secondId, 'Kids');
    const kids = lib.saved.find((row) => row.id === secondId);
    assert.ok(kids);
    kids.board = applySlotName(kids.board, 'sf-0-a', 'Sam');
    lib = applySwitchBracket(lib, lib.saved[0].id);
    assert.equal(displayBracketName(lib.saved[0]), 'Gi Blue Belt');
    assert.equal(lib.saved[0].board.entries['qf-0-a'], 'Alex');
    lib = applySwitchBracket(lib, secondId);
    assert.equal(displayBracketName(lib.saved[1]), 'Kids');
    assert.equal(lib.saved[1].board.entries['sf-0-a'], 'Sam');
    assert.equal(lib.saved[0].board.entries['qf-0-a'], 'Alex');
    lib = applyDeleteBracket(lib, secondId);
    assert.equal(lib.saved.length, 1);
    assert.equal(lib.activeId, lib.saved[0].id);
  });

  it('keeps a named board when a new empty one is added', () => {
    let lib = applyRenameBracket(defaultLibrary(), 'bracket-1', 'Gi Blue Belt');
    lib = applyNewBracket(lib, 8);
    assert.equal(displayBracketName(lib.saved[0]), 'Gi Blue Belt');
    assert.equal(lib.activeId, lib.saved[1].id);
    assert.equal(displayBracketName(lib.saved[1]), 'Untitled');
  });

  it('documents owner cloud sync as later work', () => {
    assert.equal(OWNER_BRACKET_CLOUD.status, 'planned');
    assert.equal(OWNER_BRACKET_CLOUD.coachSaves, 'local-only');
    assert.equal(OWNER_BRACKET_CLOUD.ownerSaves, 'local-only');
  });
});

describe('clearing dependent later rounds', () => {
  const win = { call: 'win' as const, method: 'points' as const };

  /** 8-person draw: Alex’s quarter feeds the top semi, then the final and champion. */
  function playedEight() {
    let board = defaultTournament(8);
    const names = ['Alex', 'Blair', 'Casey', 'Drew', 'Evan', 'Fran', 'Glen', 'Harper'];
    seedSlots(board).forEach((id, index) => {
      board = applySlotName(board, id, names[index]);
    });
    board = applyMatchOutcome(board, 'qf-0', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'qf-1', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'qf-2', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'qf-3', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'sf-0', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'sf-1', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'final-0', 'a', win, { toggle: false });
    return board;
  }

  it('undo of a quarterfinal clears later slots that advanced from that winner', () => {
    const board = applyUndoOutcome(playedEight(), 'qf-0');
    assert.equal(board.results['qf-0'], undefined);
    assert.equal(board.entries['sf-0-a'], undefined);
    assert.equal(board.results['sf-0'], undefined);
    assert.equal(board.entries['final-0-a'], undefined);
    assert.equal(board.results['final-0'], undefined);
    assert.equal(board.entries.champion, undefined);
    assert.equal(board.entries['sf-0-b'], 'Drew');
    assert.equal(board.results['qf-1']?.winnerSide, 'a');
    assert.equal(board.results['sf-1']?.winnerSide, 'a');
    assert.equal(board.entries['final-0-b'], 'Blair');
    assert.equal(board.entries['qf-0-a'], 'Alex');
    assert.equal(board.entries['qf-0-b'], 'Harper');
    assert.equal(board.lastOutcomeMatchId, null);
  });

  it('undo still clears a later bout won by the other athlete', () => {
    let board = playedEight();
    board = applyClearResult(board, 'final-0');
    board = applyClearResult(board, 'sf-0');
    board = applyMatchOutcome(board, 'sf-0', 'b', win, { toggle: false });
    board = applyMatchOutcome(board, 'final-0', 'a', win, { toggle: false });
    assert.equal(board.entries['final-0-a'], 'Drew');
    assert.equal(board.entries.champion, 'Drew');
    board = applyUndoOutcome(board, 'qf-0');
    assert.equal(board.results['sf-0'], undefined);
    assert.equal(board.entries['sf-0-a'], undefined);
    assert.equal(board.entries['sf-0-b'], 'Drew');
    assert.equal(board.entries['final-0-a'], undefined);
    assert.equal(board.results['final-0'], undefined);
    assert.equal(board.entries.champion, undefined);
    assert.equal(board.entries['final-0-b'], 'Blair');
  });

  it('re-deciding a quarterfinal wipes the old path so a new champion can be run', () => {
    let board = applyMatchOutcome(
      playedEight(),
      'qf-0',
      'b',
      { call: 'win', method: 'submission' },
      { toggle: false },
    );
    assert.equal(board.results['qf-0']?.winnerSide, 'b');
    assert.equal(board.entries['sf-0-a'], 'Harper');
    assert.equal(board.results['sf-0'], undefined);
    assert.equal(board.entries['final-0-a'], undefined);
    assert.equal(board.results['final-0'], undefined);
    assert.equal(board.entries.champion, undefined);
    assert.equal(board.entries['sf-0-b'], 'Drew');
    assert.equal(board.entries['final-0-b'], 'Blair');
    assert.equal(board.entries['sf-1-a'], 'Blair');
    board = applyMatchOutcome(board, 'sf-0', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'final-0', 'a', { call: 'win', method: 'decision' }, { toggle: false });
    assert.equal(board.entries['final-0-a'], 'Harper');
    assert.equal(board.entries['final-0-b'], 'Blair');
    assert.equal(board.entries.champion, 'Harper');
    assert.equal(board.entries['sf-0-a'], 'Harper');
    assert.equal(board.entries['qf-0-a'], 'Alex');
    assert.equal(board.results['sf-0']?.winnerSide, 'a');
    assert.equal(board.results['final-0']?.winnerSide, 'a');
  });

  it('keeps downstream results when the same winner is marked a different way', () => {
    const board = applyMatchOutcome(
      playedEight(),
      'qf-0',
      'a',
      { call: 'win', method: 'submission' },
      { toggle: false },
    );
    assert.equal(board.results['qf-0']?.method, 'submission');
    assert.equal(board.results['sf-0']?.winnerSide, 'a');
    assert.equal(board.results['final-0']?.winnerSide, 'a');
    assert.equal(board.entries['sf-0-a'], 'Alex');
    assert.equal(board.entries['final-0-a'], 'Alex');
    assert.equal(board.entries.champion, 'Alex');
  });

  it('undo of the 3-person semifinal clears the consolation and the final', () => {
    let board = applySlotName(defaultTournament(3), 'sf-1-a', 'Alex');
    board = applySlotName(board, 'sf-0-a', 'Blair');
    board = applySlotName(board, 'sf-0-b', 'Casey');
    board = applyMatchOutcome(board, 'sf-0', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'sf-1', 'a', win, { toggle: false });
    board = applyMatchOutcome(board, 'final-0', 'b', win, { toggle: false });
    assert.equal(board.entries.champion, 'Alex');
    board = applyUndoOutcome(board, 'sf-0');
    assert.equal(board.results['sf-0'], undefined);
    assert.equal(board.entries['final-0-a'], undefined);
    assert.equal(board.entries['sf-1-b'], undefined);
    assert.equal(board.results['sf-1'], undefined);
    assert.equal(board.entries['final-0-b'], undefined);
    assert.equal(board.results['final-0'], undefined);
    assert.equal(board.entries.champion, undefined);
    assert.equal(board.entries['sf-1-a'], 'Alex');
    assert.equal(board.entries['sf-0-a'], 'Blair');
    assert.equal(board.entries['sf-0-b'], 'Casey');
  });
});
