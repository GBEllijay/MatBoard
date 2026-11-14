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
  COACH_CONNECT_PREVIEW_PATH,
  PREVIEW_INSTRUCTOR_PRICE,
  PREVIEW_MEDIA_PLUS_PRICE,
  PREVIEW_MEDIA_PLUS_STORED_GB,
  PREVIEW_OWN_DRIVE_NOTE,
  PREVIEW_QUOTA_LINE,
  PREVIEW_QUOTA_WHY,
  PREVIEW_SKINS_NOTE,
  PREVIEW_STUDENT_PRICE,
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
  assert.match(hubs[1]?.note ?? '', /Personal journal for the academy owner/);
  assert.match(hubs[1]?.note ?? '', /Not the roster/);
  const home = readFileSync('src/preview/proHome/ProHomePreview.tsx', 'utf8');
  const logoAt = home.indexOf('<HomeMark />');
  const beltAt = home.indexOf('<BeltHeader kind="black"');
  const gymAt = home.indexOf('data-testid="pro-gym-identity"');
  const cloudAt = home.indexOf('data-testid="pro-cloud-status"');
  const uploadAt = home.indexOf('className="php-upload"');
  const hubsAt = home.indexOf('className="php-hubs"');
  assert.ok(logoAt > 0 && beltAt > logoAt && gymAt > beltAt && cloudAt > gymAt && uploadAt > cloudAt && hubsAt > uploadAt);
  assert.doesNotMatch(home, /GymCharacterSheet|AdvantageCloudHome|writeGymName|type="file"|localStorage/);
  assert.match(home, /className=\{before \? 'php-shell' : 'php-shell php-pro'\}/);
  assert.match(readFileSync('src/preview/proHome/proHome.css', 'utf8'), /\.php-pro \{[^}]*padding-top:\s*calc\(0\.5rem \+ var\(--safe-t/);
  assert.match(
    readFileSync('src/components/gymSheet.css', 'utf8'),
    /\.home--pro \.home__inner \{[^}]*padding-top:\s*calc\(0\.5rem \+ var\(--safe-t\)/,
  );
  assert.doesNotMatch(
    readFileSync('src/components/gymSheet.css', 'utf8'),
    /padding-top:\s*calc\(var\(--mark-home\)/,
  );
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

test('instructor concept cards keep the live destinations and add no belt', () => {
  const cards = instructorConceptCards();
  assert.deepEqual(cards.map((card) => card.to), COACH_UNLIMITED_TOOLS.map((tool) => tool.to));
  // Seven live tools now; the Competition card has its own live mark, so this draft preview reuses a generic one.
  assert.equal(cards.length, 7);
  assert.equal(new Set(cards.map((card) => card.mark)).size, 6);
  assert.ok(!cards.some((card) => card.title === 'Record for Review'));
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
  assert.equal(mediaStudentCard().title, 'Student Edition / My Journal');
  assert.match(mediaStudentCard().note, /Basic skins/);
  assert.match(page, /PREVIEW_SKINS_NOTE/);
  assert.equal(page.split('to={student.to}').length - 1, 1);
  assert.match(page, /AcademyLinkPreview/);
  assert.match(page, /StorageChoicePreview place="media"/);
  assert.match(page, /PreviewPriceDecisions place="media"/);
  assert.doesNotMatch(page, /\$[0-9]+\/year|Stripe|checkout/);
  assert.match(page, /to=\{student\.to\}/);
  const studentAt = page.indexOf('aria-label="Personal Student Edition"');
  const ladderAt = page.indexOf('EditionLadder page="media"');
  const toolsAt = page.indexOf('aria-label="Advantage Media Edition menu"');
  assert.ok(toolsAt > 0 && studentAt > toolsAt && ladderAt > studentAt);
  assert.doesNotMatch(page, /student-roster|white-hub|\/white"|joinAcademy|writeGymName|\/student\/academy|localStorage/);
  const choices = readFileSync('src/preview/proHome/PreviewChoices.tsx', 'utf8');
  assert.match(choices, /data-testid="media-gym-connect"/);
  assert.match(choices, /Example only\. Not connected/);
  assert.match(choices, /type="button"/);
  assert.doesNotMatch(readFileSync('src/pages/MediaEditionHub.tsx', 'utf8'), /Connect to a gym|media-gym-connect/);
  const css = readFileSync('src/preview/proHome/proHome.css', 'utf8');
  assert.match(css, /\.php \.home__mark \{[^}]*grid-area:\s*auto/);
  assert.match(css, /\.php-card \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 92px/);
});

test('preview prices are the stated monthly figures and live price lines stay put', () => {
  assert.equal(PREVIEW_STUDENT_PRICE, '$2.99/month');
  assert.equal(PREVIEW_MEDIA_PLUS_PRICE, '$2.99/month');
  assert.equal(PREVIEW_INSTRUCTOR_PRICE, '$5.99/month');
  assert.match(PREVIEW_SKINS_NOTE, /basic skins/);
  assert.match(PREVIEW_SKINS_NOTE, /does not change live skin access/);
  const choices = readFileSync('src/preview/proHome/PreviewChoices.tsx', 'utf8');
  const previewModel = readFileSync('src/preview/proHome/model.ts', 'utf8');
  assert.match(previewModel, /Google Drive stays an optional alternative/);
  assert.match(previewModel, /does not pay a Google bill/);
  assert.match(previewModel, /heavier video traffic/);
  assert.match(choices, /PREVIEW_DRIVE_NOTE/);
  assert.match(choices, /does not add a Media base monthly fee/);
  assert.doesNotMatch(choices, /localStorage|joinAcademy|Stripe/);
  const instructor = readFileSync('src/preview/proHome/InstructorCardsPreview.tsx', 'utf8');
  assert.match(instructor, /StorageChoicePreview place="instructor"/);
  assert.match(instructor, /PreviewPriceDecisions place="instructor"/);
  const live = readFileSync('src/lib/productPrices.ts', 'utf8');
  assert.match(live, /STUDENT_PRICE_LINE = '\$19\.99 one-time'/);
  assert.match(live, /MEDIA_PRICE_LINE = '\$29\.99 one-time'/);
  assert.match(live, /INSTRUCTOR_DISPLAY_PRICE_LINE = '\$49\.99 one-time'/);
  assert.match(live, /CLOUD_ADDON_LINE = '\+ optional Advantage Cloud \$5\.99\/month'/);
});

test('the coach pair is its own preview and the storage cap is only a proposal', () => {
  assert.equal(PREVIEW_MEDIA_PLUS_STORED_GB, 5);
  assert.match(PREVIEW_QUOTA_LINE, /Preview proposal: 5 GB stored/);
  assert.match(PREVIEW_QUOTA_WHY, /\$0\.015 per GB-month/);
  assert.match(PREVIEW_QUOTA_WHY, /\$0\.075/);
  assert.match(PREVIEW_QUOTA_WHY, /not a promise of profit/);
  assert.match(PREVIEW_OWN_DRIVE_NOTE, /MediaPlus is not required/);
  assert.match(PREVIEW_OWN_DRIVE_NOTE, /not a live two-way folder/);
  assert.match(app, new RegExp(`path="${COACH_CONNECT_PREVIEW_PATH}"`));
  const coach = readFileSync('src/preview/proHome/ConnectCoachPreview.tsx', 'utf8');
  assert.match(coach, /Connect to your coach/);
  assert.match(coach, /This is not Connect to a gym/);
  assert.doesNotMatch(coach, /localStorage|joinAcademy|fetch\(|license/);
  const media = readFileSync('src/preview/proHome/MediaMenuPreview.tsx', 'utf8');
  const instructor = readFileSync('src/preview/proHome/InstructorCardsPreview.tsx', 'utf8');
  assert.match(media, /AcademyLinkPreview/);
  assert.match(media, /COACH_CONNECT_PREVIEW_PATH/);
  assert.match(instructor, /OwnDrivePreview/);
  assert.match(instructor, /COACH_CONNECT_PREVIEW_PATH/);
  assert.doesNotMatch(readFileSync('src/lib/productPrices.ts', 'utf8'), /5 GB stored/);
});

test('live Pro, Instructor, and hub paint are not edited for this preview', () => {
  assert.match(app, new RegExp(`path="${PRO_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${INSTRUCTOR_CARDS_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${WHITE_HUB_PREVIEW_PATH}"`));
  assert.match(app, new RegExp(`path="${MEDIA_MENU_PREVIEW_PATH}"`));
  assert.match(readFileSync('src/pages/MediaEditionHub.tsx', 'utf8'), /SuiteMenuLinks links=\{MEDIA_EDITION_MENU\}/);
  assert.doesNotMatch(pro, /preview\/proHome|php-tile/);
  assert.match(pro, /Advantage Media Edition/);
  assert.doesNotMatch(coach, /preview\/proHome|php-card/);
  assert.match(css, /\.pro-hub,[\s\S]*background:\s*#0c2344/);
  assert.match(readFileSync('src/preview/proHome/proHome.css', 'utf8'), /\.php-tile\s*\{[^}]*background:\s*#efebe3/);
});
