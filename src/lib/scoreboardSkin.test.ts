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
  OLD_SCHOOL_FLAP_PLACES,
  coachLinkedWhiteBoard,
  flapDigits,
  isCoachWhiteBoardSearch,
  isPlainWhiteScoreboard,
  parseScoreboardSkin,
  scoreboardSkinClass,
  visibleScoreboardSkin,
  withCoachWhiteBoard,
  withMatchOrigin,
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
  assert.equal(OLD_SCHOOL_FLAP_PLACES.points, 2);
  assert.equal(OLD_SCHOOL_FLAP_PLACES.advantages, 1);
  assert.equal(OLD_SCHOOL_FLAP_PLACES.disadvantages, 1);
  assert.deepEqual(flapDigits(9, OLD_SCHOOL_FLAP_PLACES.advantages), ['9']);
  assert.deepEqual(flapDigits(10, OLD_SCHOOL_FLAP_PLACES.advantages), ['0']);
  assert.deepEqual(flapDigits(12, OLD_SCHOOL_FLAP_PLACES.advantages), ['2']);
  assert.deepEqual(flapDigits(15, OLD_SCHOOL_FLAP_PLACES.points), ['1', '5']);
});

test('White Live Bout stays on Mock-Tournament; suite and Unlimited linked bouts keep the choice', () => {
  assert.equal(isPlainWhiteScoreboard(false, false), true);
  assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, false, false), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.MOCK_TOURNAMENT, false, false), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.equal(isPlainWhiteScoreboard(true, false), false);
  assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, true, false), SCOREBOARD_SKIN.OLD_SCHOOL);
  assert.equal(isPlainWhiteScoreboard(false, true), false);
  assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, false, true), SCOREBOARD_SKIN.OLD_SCHOOL);
  assert.equal(isPlainWhiteScoreboard(true, true, true), false);
  assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, true, true, true), SCOREBOARD_SKIN.OLD_SCHOOL);
});

test('Basic Coach bracket bouts use the White board; Coach Unlimited keeps the skin', () => {
  assert.equal(coachLinkedWhiteBoard(false, true, true, false), true);
  assert.equal(coachLinkedWhiteBoard(false, true, false, false), false);
  assert.equal(coachLinkedWhiteBoard(true, true, true, true), false);
  assert.equal(coachLinkedWhiteBoard(false, false, true, true), false);
  assert.equal(coachLinkedWhiteBoard(false, true, false, true), true);
  assert.equal(isPlainWhiteScoreboard(false, true, true), true);
  assert.equal(visibleScoreboardSkin(SCOREBOARD_SKIN.OLD_SCHOOL, false, true, true), SCOREBOARD_SKIN.MOCK_TOURNAMENT);
  assert.equal(isCoachWhiteBoardSearch(new URLSearchParams('board=white')), true);
  assert.equal(isCoachWhiteBoardSearch(new URLSearchParams('from=suite')), false);
  assert.equal(withCoachWhiteBoard('/match?bout=final-0', true), '/match?bout=final-0&board=white');
  assert.equal(withCoachWhiteBoard('/match?bout=final-0', false), '/match?bout=final-0');
  assert.equal(
    withMatchOrigin('/match?bout=sf-0', { fromSuite: false, whiteBoard: true }),
    '/match?bout=sf-0&board=white',
  );
  assert.equal(
    withMatchOrigin('/match?bout=sf-0', { fromSuite: true, whiteBoard: true }),
    '/match?bout=sf-0&from=suite',
  );
  assert.equal(
    withMatchOrigin('/match/control?focus=round', { fromSuite: false, whiteBoard: true }),
    '/match/control?focus=round&board=white',
  );
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
  assert.match(css, /\.flap__rings/);
  assert.match(css, /\.flap__slot/);
  assert.match(css, /display__mid--stack/);
  const stack = css.slice(css.indexOf('display__mid--stack'));
  assert.match(stack, /flex-direction:\s*column/);
  assert.match(stack, /grid-template-rows:\s*minmax\(0,\s*1fr\)\s+auto\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /@keyframes flap-turn/);
  const tv = css.slice(css.lastIndexOf('(min-width: 900px) and (min-height: 560px)'));
  assert.match(tv, /scoreboard-skin--old-school\.display > \.bout/);
  assert.match(tv, /grid-template-columns:\s*minmax\(8\.5rem,\s*15\.5rem\)\s+minmax\(0,\s*1fr\)/);
  assert.match(tv, /aspect-ratio:\s*auto/);
  assert.match(tv, /--flap-ring-w:\s*min\(94%,\s*100cqh\)/);
});
