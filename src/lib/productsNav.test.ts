import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { historyBackStep } from './historyBack.ts';
import { INSTRUCTOR_HOME_TITLE, MEDIA_HOME_DESCRIPTION, MEDIA_HOME_PATH, MEDIA_HOME_TITLE } from './productNames.ts';
import { INSTRUCTOR_DISPLAY_PRICE_LINE, MEDIA_PRICE_LINE } from './productPrices.ts';
import { STOREFRONT_BELT_LADDER } from './storefrontBelts.ts';

const home = readFileSync(new URL('../pages/Home.tsx', import.meta.url), 'utf8');
const back = readFileSync(new URL('../components/HistoryBackMark.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const storefrontCss = readFileSync(new URL('../pages/storefront.css', import.meta.url), 'utf8');

test('/products title is centered on the card column at narrow and portrait widths', () => {
  const at = css.indexOf('@media (max-width: 739px)');
  assert.ok(at > 0);
  const block = css.slice(at, at + 1800);
  assert.match(block, /\(max-width: 1099px\) and \(orientation: portrait\)/);
  assert.match(block, /\(orientation: landscape\) and \(max-height: 520px\)/);
  assert.match(block, /\.home--ladder \.home__mark \{[^}]*align-self: stretch;[^}]*text-align: center;/);
  assert.match(block, /\.home--ladder \.home__mark > p \{[^}]*text-align: center;/);
  // Wide brand column stays left-aligned.
  assert.match(css, /@media \(min-width: 740px\) and \(orientation: landscape\), \(min-width: 1100px\) \{[\s\S]*?\.home__mark \{[^}]*text-align: left;/);
});

test('/products center logo is a router link to the homepage', () => {
  assert.match(home, /<HomeMark to="\/" motto=\{HOME_MOTTO\}/);
});

test('/products has a top-left back mark that falls back to the homepage', () => {
  assert.match(home, /<HistoryBackMark fallback="\/" \/>/);
  assert.match(back, /className="play-exit play-exit--history"/);
  assert.match(back, /aria-label="Back"/);
  assert.match(back, /to=\{fallback\}/);
});

test('back goes one step only when there is an earlier in-app page', () => {
  assert.equal(historyBackStep({ idx: 3, key: 'k', usr: null }), -1);
  assert.equal(historyBackStep({ idx: 1 }), -1);
  assert.equal(historyBackStep({ idx: 0 }), null);
  assert.equal(historyBackStep(null), null);
  assert.equal(historyBackStep(undefined), null);
  assert.equal(historyBackStep({}), null);
  assert.equal(historyBackStep({ idx: '2' }), null);
});

test('/products cards follow the belt ladder order: White, Student, Media, Instructor, Pro', () => {
  const at = (needle: string) => {
    const i = home.indexOf(needle);
    assert.ok(i > 0, needle);
    return i;
  };
  const order = [
    at('<strong>Advantage White</strong>'),
    at('<StudentHomeCard'),
    at('<MediaHomeCard open={mediaEditionDoorOpen(door)} />'),
    at('<strong>{INSTRUCTOR_HOME_TITLE}</strong>'),
    at('<ProHomeCopy />'),
  ];
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('Coach card shows the Instructor Edition title on a brown belt; ids stay coach', () => {
  assert.equal(INSTRUCTOR_HOME_TITLE, 'Advantage Instructor Edition');
  assert.doesNotMatch(home, /<strong>Advantage Coach<\/strong>/);
  assert.equal(home.match(/<BeltRail kind="brown" \/>\s*<strong>\{INSTRUCTOR_HOME_TITLE\}<\/strong>/g)?.length, 2);
  assert.match(home, /mode-card mode-card--coach"/);
  assert.match(home, /instructorUnlimited \? COACH_UNLIMITED_PATH : '\/coach'/);
  assert.match(home, /<LearnMoreLink tier="instructor" \/>/);
  assert.doesNotMatch(home, /setSoon\('coach'\)/);
  // Same brown as the homepage belt ladder's Instructor tile.
  assert.match(css, /\.belt-rail--brown \{\s*--belt-fill: #6b3a1f;/);
  assert.match(storefrontCss, /--sf-belt-brown: #6b3a1f;/);
});

test('Student card uses the blue belt rail instead of the leather spine', () => {
  assert.doesNotMatch(home, /LeatherSpine/);
  assert.match(home, /<BeltRail kind="blue" \/>\s*<strong>\{STUDENT_EDITION_NAME\}<\/strong>/);
  assert.match(css, /\.belt-rail--blue \{\s*--belt-fill: #2a5cf0;/);
});

test('Media card: locked is display-only purple $29.99 linking to /media; open reads the media door', () => {
  assert.equal(MEDIA_HOME_TITLE, 'Advantage Media Edition');
  assert.equal(MEDIA_HOME_DESCRIPTION, 'Scoreboard, round timer, and media console.');
  assert.equal(MEDIA_PRICE_LINE, '$29.99 one-time');
  assert.equal(MEDIA_HOME_PATH, '/media');
  const card = home.slice(home.indexOf('function MediaHomeCard'), home.indexOf('function ProPlusCloudCard'));
  assert.match(card, /mode-card mode-card--media mode-card--locked/);
  assert.match(card, /<BeltRail kind="purple" \/>/);
  // Open (mediaEditionDoorOpen, same as /media): "Open Media Edition" goes to /media. Locked Learn more opens the same preview.
  assert.match(home, /<MediaHomeCard open=\{mediaEditionDoorOpen\(door\)\} \/>/);
  assert.doesNotMatch(home, /useMediaUnlocked/);
  assert.match(card, />\s*Open Media Edition\s*</);
  assert.match(card, /<LearnMoreLink tier="media" \/>/);
  assert.match(card, /to=\{TIER_BUY_PATHS\.media\}/);
  // No checkout or unlock on this card; the alpha email line is the shared edition note.
  assert.doesNotMatch(card, /onClick|Unlock|checkout/i);
  assert.match(css, /\.belt-rail--purple \{\s*--belt-fill: #6b2d91;/);
});

test('Instructor card on /products shows $49.99 one-time, matching the belt ladder', () => {
  assert.equal(INSTRUCTOR_DISPLAY_PRICE_LINE, '$49.99 one-time');
  assert.match(home, /<p className="mode-card__price">\{INSTRUCTOR_DISPLAY_PRICE_LINE\}<\/p>/);
  assert.doesNotMatch(home, /COACH_PRICE_LINE/);
  const rung = STOREFRONT_BELT_LADDER.find((b) => b.id === 'coach');
  assert.equal(rung?.cardPrice, INSTRUCTOR_DISPLAY_PRICE_LINE);
});

test('Media card on /products has no purple hue, locked or unlocked; only the purple belt rail marks it', () => {
  assert.match(home, /className="mode-card mode-card--media mode-card--locked">/);
  assert.doesNotMatch(home, /mode-card--media mode-card--locked mode-card--feature/);
  assert.match(home, /<BeltRail kind="purple" \/>/);
  const base = css.match(/\n\.mode-card--media \{[^}]*\}/)?.[0] ?? '';
  assert.ok(base, 'base .mode-card--media rule');
  assert.doesNotMatch(base, /#2c2438|176, 150, 204|107, 45, 145|box-shadow/);
  const feature = css.match(/\.mode-card--media\.mode-card--feature \{[^}]*\}/)?.[0] ?? '';
  assert.ok(feature, 'unlocked .mode-card--media.mode-card--feature rule');
  assert.doesNotMatch(feature, /107, 45, 145|#3a2550|#1d1529|#0f0c18|background|border|box-shadow/);
  const title = css.match(/\.mode-card--media\.mode-card--feature > strong \{[^}]*\}/)?.[0] ?? '';
  assert.match(title, /font-weight: 800/);
  assert.doesNotMatch(title, /#f1e6fb|color:/);
  // The purple belt rail stays (Media is the purple belt).
  assert.match(css, /\.belt-rail--purple \{\s*--belt-fill: #6b2d91;/);
});

test('Locked product cards have Learn more; unlocked cards show only their Open button. Open labels follow the Student pattern', () => {
  assert.match(home, /<LearnMoreLink tier="media" \/>/);
  assert.match(home, /to=\{TIER_BUY_PATHS\.media\}/);
  assert.match(home, /Try the demo/);
  assert.match(home, /Open White/);
  assert.match(home, /Open Student Edition/);
  assert.match(home, /Open Media Edition/);
  assert.match(home, /Open Advantage Instructor Edition/);
  assert.match(home, /Open Pro Console/);
  assert.match(home, /PRO_PLUS_CLOUD_OPEN_LABEL/);
  assert.match(home, /COACH_UNLIMITED_PATH/);
  assert.match(home, /: '\/coach'/);
  assert.match(home, /: 'Open Coach'/);
  const unlockedCoach = home.slice(home.indexOf('mode-card mode-card--coach">'), home.indexOf('mode-card mode-card--coach mode-card--locked'));
  assert.doesNotMatch(unlockedCoach, /LearnMoreLink/);
  const unlockedPro = home.slice(home.indexOf('mode-card mode-card--pro">'), home.indexOf('mode-card mode-card--pro mode-card--locked'));
  assert.doesNotMatch(unlockedPro, /LearnMoreLink/);
  const unlockedMedia = home.slice(home.indexOf('mode-card mode-card--media mode-card--feature'), home.indexOf('mode-card mode-card--media mode-card--locked'));
  assert.doesNotMatch(unlockedMedia, /LearnMoreLink/);
  const unlockedWhite = home.slice(home.indexOf('whiteUnlocked ? ('), home.indexOf(') : (', home.indexOf('whiteUnlocked ? (')));
  assert.match(unlockedWhite, /Open White/);
  assert.doesNotMatch(unlockedWhite, /LearnMoreLink/);
  const student = home.slice(home.indexOf('function StudentHomeCard'));
  const unlockedStudent = student.slice(student.indexOf('if (open)'), student.indexOf('mode-card--locked'));
  assert.match(unlockedStudent, /\{demo \? <LearnMoreLink tier="student" \/> : null\}/);
  assert.match(home, /Owner test unlock/);
  assert.match(home, /ALPHA_PRODUCT_STATUS/);
  assert.doesNotMatch(home, /coming soon/i);
  assert.match(home, /PRO_DRIVE_NOTE/);
  assert.match(home, /CLOUD_ADDON_LINE/);
  assert.match(home, /<BeltRail kind="black" bar="striped" \/>/);
  assert.doesNotMatch(home, /function ProPlusCloudCard/);
});

test('Pro card on /products says "Includes all Advantage products."', async () => {
  const n = await import('./productNames.ts');
  assert.match(n.PRO_HOME_LINES[0], /Includes all Advantage products\.$/);
  assert.doesNotMatch(n.PRO_HOME_LINES[0], /everything in Advantage Coach/);
});

test('Media, Instructor and Pro show one shared alpha line directly under the price', async () => {
  const p = await import('./productPrices.ts');
  assert.equal(p.EDITION_ALPHA_NOTE, 'In alpha testing. Email advantageappllc@gmail.com for a free alpha code.');
  assert.equal(p.EDITION_EMAIL_DISPLAY, 'advantageappLLC@gmail.com');
  const n = '<AlphaAccessNote note={EDITION_ALPHA_NOTE} display={EDITION_EMAIL_DISPLAY} />';
  const esc = n.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  assert.match(home, new RegExp(`\\{MEDIA_PRICE_LINE\\}</p>\\s*<p className="mode-card__price">\\{CLOUD_ADDON_LINE\\}</p>\\s*${esc}`));
  assert.match(home, new RegExp(`\\{INSTRUCTOR_DISPLAY_PRICE_LINE\\}</p>\\s*<p className="mode-card__price">\\{CLOUD_ADDON_LINE\\}</p>\\s*${esc}`));
  assert.match(home, /PRO_PRICE_LINE/);
  assert.match(home, /<HomeDescription text=\{CLOUD_ADDON_LINE\} \/>/);
  assert.doesNotMatch(home, /COACH_ALPHA_ACCESS_NOTE|PRO_ALPHA_ACCESS_NOTE/);
});
