import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OWNER_BRACKET_CLOUD,
  applyCompetitorCount,
  applyDeleteBracket,
  applyMatchOutcome,
  applyNewBracket,
  applyRenameBracket,
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
  firstRoundLabel,
  matchHasBye,
  matchIdsForSize,
  normalizeLibrary,
  seedPlaceholder,
  seedSlots,
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
  it('pads non-powers of two to the next tree with byes', () => {
    assert.equal(treeSizeFor(2), 2);
    assert.equal(treeSizeFor(3), 4);
    assert.equal(treeSizeFor(5), 8);
    assert.equal(treeSizeFor(9), 16);
    assert.equal(treeSizeFor(16), 16);
    assert.equal(byeCountFor(5), 3);
    assert.equal(byeCountFor(8), 0);
    assert.deepEqual(byeSlotIds(5), ['qf-1-b', 'qf-2-b', 'qf-3-b']);
    assert.equal(firstRoundLabel(5), 'Quarterfinals');
    assert.match(bracketRoundLine(defaultTournament(5)), /5 competitors · 3 byes/);
  });

  it('starts an 8-person board at quarterfinals', () => {
    const board = defaultTournament(8);
    assert.deepEqual(seedSlots(board), [
      'qf-0-a',
      'qf-0-b',
      'qf-1-a',
      'qf-1-b',
      'qf-2-a',
      'qf-2-b',
      'qf-3-a',
      'qf-3-b',
    ]);
    assert.ok(matchIdsForSize(8).includes('qf-0'));
    assert.equal(matchIdsForSize(8).includes('r16-0'), false);
  });

  it('auto-advances the living competitor past a bye', () => {
    let board = defaultTournament(5);
    const seeds = seedSlots(board);
    assert.equal(seeds.length, 5);
    board = applySlotName(board, seeds[2], 'Casey');
    // 5-person: qf-0 is the only real pairing; qf-1-a is the third seed and has a bye.
    assert.equal(seeds[2], 'qf-1-a');
    assert.equal(matchHasBye(board, 'qf-1'), true);
    assert.equal(board.entries['sf-0-b'], 'Casey');
    const ignored = applyMatchOutcome(board, 'qf-1', 'a', { call: 'win', method: 'submission' });
    assert.equal(ignored.results['qf-1'], undefined);
  });

  it('keeps early seed names when shrinking and still records a win', () => {
    let board = applySlotName(defaultTournament(16), 'r16-0-a', 'Alex');
    board = applySlotName(board, 'r16-0-b', 'Blair');
    board = applyCompetitorCount(board, 4);
    assert.equal(board.size, 4);
    assert.equal(seedSlots(board)[0], 'sf-0-a');
    assert.equal(board.entries['sf-0-a'], 'Alex');
    assert.equal(board.entries['sf-0-b'], 'Blair');
    board = applyMatchOutcome(board, 'sf-0', 'a', { call: 'win', method: 'points' });
    assert.equal(board.entries['final-0-a'], 'Alex');
    assert.equal(board.results['sf-0']?.winnerSide, 'a');
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
