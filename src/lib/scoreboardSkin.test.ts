import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_SCOREBOARD_SKIN,
  MOCK_TOURNAMENT_COLORS,
  MOCK_TOURNAMENT_SKIN_NAME,
  SCOREBOARD_SKIN,
  scoreboardSkinClass,
} from './scoreboardSkin.ts';

test('Mock-Tournament Skin is the default Match scoreboard', () => {
  assert.equal(MOCK_TOURNAMENT_SKIN_NAME, 'Mock-Tournament Skin');
  assert.equal(DEFAULT_SCOREBOARD_SKIN, SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.equal(scoreboardSkinClass(), 'scoreboard-skin--mock-tournament');
  assert.equal(scoreboardSkinClass(SCOREBOARD_SKIN.MOCK_TOURNAMENT), 'scoreboard-skin--mock-tournament');
  assert.deepEqual(Object.keys(SCOREBOARD_SKIN).sort(), ['KIDS', 'LIGHT', 'MOCK_TOURNAMENT']);
});

test('Mock-Tournament eyedrop colors are the stylesheet tokens', () => {
  const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const start = css.indexOf('MOCK_TOURNAMENT');
  assert.ok(start >= 0, 'stylesheet names MOCK_TOURNAMENT');
  const block = css.slice(start, start + 900);
  assert.match(block, /scoreboard-skin--mock-tournament/);
  assert.match(block, new RegExp(`--pad-points:\\s*${MOCK_TOURNAMENT_COLORS.POINTS_BG}`));
  assert.match(block, new RegExp(`--pad-adv:\\s*${MOCK_TOURNAMENT_COLORS.ADVANTAGE_BG}`));
  assert.match(block, new RegExp(`--pad-pen:\\s*${MOCK_TOURNAMENT_COLORS.PENALTY_BG}`));
  assert.match(block, new RegExp(`--board-blue:\\s*${MOCK_TOURNAMENT_COLORS.ATHLETE_BLUE_BAR}`));
  assert.match(block, new RegExp(`--board-field:\\s*${MOCK_TOURNAMENT_COLORS.SCREEN_BG}`));
  assert.match(block, new RegExp(`--board-white:\\s*${MOCK_TOURNAMENT_COLORS.ATHLETE_LIGHT_BAR}`));
  assert.match(block, new RegExp(`--board-digit:\\s*${MOCK_TOURNAMENT_COLORS.DIGIT}`));
});
