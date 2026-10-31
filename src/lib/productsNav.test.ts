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
    at('<MediaHomeCard />'),
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
  assert.match(home, /to="\/coach"/);
  assert.match(home, /setSoon\('coach'\)/);
  // Same brown as the homepage belt ladder's Instructor tile.
  assert.match(css, /\.belt-rail--brown \{\s*--belt-fill: #6b3a1f;/);
  assert.match(storefrontCss, /--sf-belt-brown: #6b3a1f;/);
});

test('Student card uses the blue belt rail instead of the leather spine', () => {
  assert.doesNotMatch(home, /LeatherSpine/);
  assert.match(home, /<BeltRail kind="blue" \/>\s*<strong>\{STUDENT_EDITION_NAME\}<\/strong>/);
  assert.match(css, /\.belt-rail--blue \{\s*--belt-fill: #2a5cf0;/);
});

test('Media card is display-only, locked, purple, $29.99, and links to /media', () => {
  assert.equal(MEDIA_HOME_TITLE, 'Advantage Media Edition');
  assert.equal(MEDIA_HOME_DESCRIPTION, 'Scoreboard, round timer, and media console.');
  assert.equal(MEDIA_PRICE_LINE, '$29.99 one-time');
  assert.equal(MEDIA_HOME_PATH, '/media');
  const card = home.slice(home.indexOf('function MediaHomeCard'), home.indexOf('function HomeDescription'));
  assert.match(card, /mode-card mode-card--media mode-card--locked/);
  assert.match(card, /<BeltRail kind="purple" \/>/);
  assert.equal(card.match(/to=\{MEDIA_HOME_PATH\}/g)?.length, 1);
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

test('Media card stands out: #6b2d91 edge, glow, bolder title', () => {
  assert.match(home, /mode-card--media mode-card--locked mode-card--feature/);
  assert.match(css, /\.mode-card--media\.mode-card--feature \{[^}]*rgba\(107, 45, 145/);
  assert.match(css, /\.mode-card--media\.mode-card--feature > strong \{[^}]*font-weight: 800/);
});

test('Instructor and Pro read "Learn more about <name>"; Media has no learn-more button; existing controls stay', () => {
  assert.doesNotMatch(home, /Learn more about Media/);
  assert.match(home, /<Link className="mode-card__hit" to=\{MEDIA_HOME_PATH\}/);
  assert.equal(home.match(/setSoon\('coach'\)\}>\s*Learn more about Instructor Edition/g)?.length, 2);
  assert.equal(home.match(/setSoon\('pro'\)\}>\s*Learn more about Advantage Pro/g)?.length, 2);
  assert.match(home, /Open Coach/);
  assert.match(home, /\{consoleLabel\}/);
  assert.match(home, /Owner test unlock/);
  assert.match(home, /aria-label=\{`\$\{INSTRUCTOR_HOME_TITLE\}, coming soon`\}/);
  assert.match(home, /aria-label="Advantage Pro, coming soon"/);
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
  assert.match(home, new RegExp(`\\{MEDIA_PRICE_LINE\\}</p>\\s*${esc}`));
  assert.match(home, new RegExp(`\\{INSTRUCTOR_DISPLAY_PRICE_LINE\\}</p>\\s*${esc}`));
  assert.match(home, new RegExp(`\\{PRO_PRICE_LINE\\}</p>\\}\\s*${esc}`));
  assert.doesNotMatch(home, /COACH_ALPHA_ACCESS_NOTE|PRO_ALPHA_ACCESS_NOTE/);
});
