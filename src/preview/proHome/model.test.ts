import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COACH_UNLIMITED_TOOLS, MEDIA_CONSOLE_NAME, PRO_HUBS } from '../../lib/productNames.ts';
import {
  INSTRUCTOR_CARDS_PREVIEW_PATH,
  JOURNAL_DESTINATION,
  MEDIA_PREVIEW_LABEL,
  PRO_PREVIEW_PATH,
  SKINS_SCOREBOARD,
  SKINS_TIMER,
  WHITE_HUB_PREVIEW_PATH,
  instructorConceptCards,
  previewProHubs,
  previewWhitePaths,
  productionWhitePaths,
  whiteHubTools,
  productionWhitePathsDiffer,
  referenceProHubs,
} from './model.ts';

const app = readFileSync('src/App.tsx', 'utf8');
const pro = readFileSync('src/pages/Pro.tsx', 'utf8');
const coach = readFileSync('src/pages/Coach.tsx', 'utf8');
const ladder = readFileSync('src/lib/editionLadder.ts', 'utf8');
const css = readFileSync('src/index.css', 'utf8');

test('the edition ladder still opens Student at /student and White at /white', () => {
  assert.match(ladder, /student:\s*'\/student'/);
  assert.match(ladder, /white:\s*'\/white'/);
  assert.equal(JOURNAL_DESTINATION, '/student');
});

test('preview hubs put White, then Student Edition, above the renamed purple hub', () => {
  const hubs = previewProHubs();
  assert.deepEqual(hubs.slice(0, 3).map((hub) => [hub.title, hub.belt]), [
    ['White', 'white'],
    ['Student Edition', 'blue'],
    [MEDIA_PREVIEW_LABEL, 'purple'],
  ]);
  assert.equal(hubs[0]?.to, WHITE_HUB_PREVIEW_PATH);
  assert.equal(hubs[1]?.to, JOURNAL_DESTINATION);
  assert.equal(hubs[2]?.to, PRO_HUBS[0].to);
  assert.deepEqual(hubs.slice(3).map((hub) => hub.title), PRO_HUBS.slice(1).map((hub) => hub.title));
  assert.equal(referenceProHubs()[0]?.title, MEDIA_CONSOLE_NAME);
});

test('the three preview White paths share the hub that lists both suite tools', () => {
  const preview = previewWhitePaths();
  assert.deepEqual(preview.map((path) => path.to), [WHITE_HUB_PREVIEW_PATH, WHITE_HUB_PREVIEW_PATH, WHITE_HUB_PREVIEW_PATH]);
  assert.deepEqual(whiteHubTools().map((tool) => tool.to), [SKINS_SCOREBOARD, SKINS_TIMER]);
  assert.equal(SKINS_SCOREBOARD, '/match/control?from=suite');
  assert.equal(SKINS_TIMER, '/training/control?from=suite');
  assert.doesNotMatch(readFileSync('src/pages/MatchController.tsx', 'utf8'), /training\/control|Round Timer/);
  assert.equal(productionWhitePathsDiffer(), true);
  assert.deepEqual(productionWhitePaths().map((path) => path.to), ['/white', '/white', '/match']);
});

test('instructor concept cards keep the seven live destinations and add no belt', () => {
  const cards = instructorConceptCards();
  assert.deepEqual(cards.map((card) => card.to), COACH_UNLIMITED_TOOLS.map((tool) => tool.to));
  assert.equal(cards.length, 7);
  assert.equal(new Set(cards.map((card) => card.mark)).size, 7);
});

test('live Pro, Instructor, and hub paint are not edited for this preview', () => {
  assert.match(app, new RegExp(`path="${PRO_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${INSTRUCTOR_CARDS_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${WHITE_HUB_PREVIEW_PATH}"`));
  assert.doesNotMatch(pro, /preview\/proHome|Advantage Media Edition|php-tile/);
  assert.doesNotMatch(coach, /preview\/proHome|php-card/);
  assert.match(css, /\.pro-hub,[\s\S]*background:\s*#0c2344/);
  assert.match(readFileSync('src/preview/proHome/proHome.css', 'utf8'), /\.php-tile\s*\{[^}]*background:\s*#efebe3/);
});
