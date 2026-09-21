import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyMatchOutcome,
  applySlotName,
  bracketHasCompetitors,
  bracketHasContent,
  defaultTournament,
  seedPlaceholder,
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
