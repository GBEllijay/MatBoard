import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COACH_UNLIMITED_TOOLS, MEDIA_CONSOLE_NAME, MEDIA_EDITION_MENU, PRO_HUBS } from '../../lib/productNames.ts';
import {
  INSTRUCTOR_CARDS_PREVIEW_PATH,
  JOURNAL_DESTINATION,
  MEDIA_PREVIEW_LABEL,
  PRO_PREVIEW_PATH,
  SKINS_SCOREBOARD,
  SKINS_TIMER,
  MEDIA_MENU_PREVIEW_PATH,
  WHITE_HUB_PREVIEW_PATH,
  instructorConceptCards,
  mediaPreviewCards,
  mediaStudentCard,
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

test('the instructor concept reuses the profile identity card and keeps the approved tool marks', () => {
  const page = readFileSync('src/preview/proHome/InstructorCardsPreview.tsx', 'utf8');
  const marks = readFileSync('src/preview/proHome/marks.tsx', 'utf8');
  assert.match(page, /InstructorIdentityCard/);
  assert.doesNotMatch(page, /Not a saved roster/);
  assert.match(page, /<BeltHeader kind="brown"/);
  assert.match(marks, /fill="#6ea8ff">5:00/);
  assert.match(marks, /fill="#14161c" fontFamily="ui-monospace, monospace">5:00/);
  assert.doesNotMatch(marks, /M46 24v13l8 5/);
  assert.match(marks, /Blue/);
  assert.match(marks, /White/);
  assert.match(marks, /fill="#f4f1ea" \/>\s*<path d="M30 24h32/);
  assert.match(page, /<CardMark mark=\{card\.mark\} \/>/);
});

test('instructor concept cards keep the seven live destinations and add no belt', () => {
  const cards = instructorConceptCards();
  assert.deepEqual(cards.map((card) => card.to), COACH_UNLIMITED_TOOLS.map((tool) => tool.to));
  assert.equal(cards.length, 7);
  assert.equal(new Set(cards.map((card) => card.mark)).size, 7);
});

test('the Media preview keeps the three live subtitles and drops the belt rails', () => {
  const cards = mediaPreviewCards();
  assert.deepEqual(
    cards.map((card) => [card.title, card.to, card.note]),
    MEDIA_EDITION_MENU.map((link) => [link.title, link.to, link.sub]),
  );
  assert.deepEqual(cards.map((card) => card.mark), ['board', 'timer', 'console']);
  const page = readFileSync('src/preview/proHome/MediaMenuPreview.tsx', 'utf8');
  assert.match(page, /BeltHeader kind="purple" title="Advantage Media Edition"/);
  assert.match(page, /EditionLadder page="media"/);
  assert.match(page, /HomeMark/);
  assert.doesNotMatch(page, /BeltRail|unlinkBracketBout|localStorage/);
  assert.match(page, /MEDIA_EXAMPLE/);
  assert.match(page, /<CardMark mark=\{card\.mark\} \/>/);
  assert.equal(mediaStudentCard().to, JOURNAL_DESTINATION);
  assert.equal(mediaStudentCard().title, 'Student Edition');
  assert.match(page, /to=\{student\.to\}/);
  const studentAt = page.indexOf('aria-label="Personal Student Edition"');
  const ladderAt = page.indexOf('EditionLadder page="media"');
  const toolsAt = page.indexOf('aria-label="Advantage Media Edition menu"');
  assert.ok(toolsAt > 0 && studentAt > toolsAt && ladderAt > studentAt);
  assert.doesNotMatch(page, /student-roster|white-hub|\/white"|joinAcademy|writeGymName|\/student\/academy|localStorage/);
  assert.match(page, /data-testid="media-gym-connect"/);
  assert.match(page, /Example only\. Not connected/);
  assert.match(page, /type="button"/);
  assert.doesNotMatch(readFileSync('src/pages/MediaEditionHub.tsx', 'utf8'), /Connect to a gym|media-gym-connect/);
  const css = readFileSync('src/preview/proHome/proHome.css', 'utf8');
  assert.match(css, /\.php \.home__mark \{[^}]*grid-area:\s*auto/);
  assert.match(css, /\.php-card \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 92px/);
});

test('live Pro, Instructor, and hub paint are not edited for this preview', () => {
  assert.match(app, new RegExp(`path="${PRO_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${INSTRUCTOR_CARDS_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${WHITE_HUB_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${MEDIA_MENU_PREVIEW_PATH}"`));
  assert.match(readFileSync('src/pages/MediaEditionHub.tsx', 'utf8'), /SuiteMenuLinks links=\{MEDIA_EDITION_MENU\}/);
  assert.doesNotMatch(pro, /preview\/proHome|Advantage Media Edition|php-tile/);
  assert.doesNotMatch(coach, /preview\/proHome|php-card/);
  assert.match(css, /\.pro-hub,[\s\S]*background:\s*#0c2344/);
  assert.match(readFileSync('src/preview/proHome/proHome.css', 'utf8'), /\.php-tile\s*\{[^}]*background:\s*#efebe3/);
});
