import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_SCOREBOARD_SKIN,
  MOCK_TOURNAMENT_COLORS,
  MOCK_TOURNAMENT_SKIN_NAME,
  OLD_SCHOOL_SKIN_NAME,
  SCOREBOARD_SKIN,
  SELECTABLE_SCOREBOARD_SKINS,
  flapDigits,
  parseScoreboardSkin,
  scoreboardSkinClass,
} from './scoreboardSkin.ts';

test('Mock-Tournament Skin is the default Match scoreboard', () => {
  assert.equal(MOCK_TOURNAMENT_SKIN_NAME, 'Mock-Tournament Skin');
  assert.equal(DEFAULT_SCOREBOARD_SKIN, SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.equal(scoreboardSkinClass(), 'scoreboard-skin--mock-tournament');
  assert.equal(scoreboardSkinClass(SCOREBOARD_SKIN.MOCK_TOURNAMENT), 'scoreboard-skin--mock-tournament');
  assert.deepEqual(Object.keys(SCOREBOARD_SKIN).sort(), ['KIDS', 'LIGHT', 'MOCK_TOURNAMENT', 'OLD_SCHOOL']);
  assert.equal(OLD_SCHOOL_SKIN_NAME, 'Old School');
  assert.deepEqual(
    SELECTABLE_SCOREBOARD_SKINS.map((skin) => skin.label),
    ['Mock-Tournament', 'Old School'],
  );
  assert.equal(scoreboardSkinClass(SCOREBOARD_SKIN.OLD_SCHOOL), 'scoreboard-skin--old-school');
  assert.equal(parseScoreboardSkin('OLD_SCHOOL'), SCOREBOARD_SKIN.OLD_SCHOOL);
  assert.equal(parseScoreboardSkin('LIGHT'), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.equal(parseScoreboardSkin(undefined), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.deepEqual(flapDigits(4, 2), ['0', '4']);
  assert.deepEqual(flapDigits(12, 2), ['1', '2']);
  assert.deepEqual(flapDigits(3, 1), ['3']);
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
  assert.match(css, /scoreboard-skin--old-school/);
  assert.match(css, /\.flap__card/);
  assert.match(css, /--os-blue:\s*#1d6fe0/);
  assert.match(css, /--os-red:\s*#ef3d2c/);
  assert.match(css, /\.flap__ring/);
});
