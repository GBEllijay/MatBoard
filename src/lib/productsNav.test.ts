import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { historyBackStep } from './historyBack.ts';
import { INSTRUCTOR_HOME_TITLE, MEDIA_HOME_DESCRIPTION, MEDIA_HOME_PATH, MEDIA_HOME_TITLE } from './productNames.ts';
import { MEDIA_PRICE_LINE } from './productPrices.ts';

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
  assert.equal(card.match(/to=\{MEDIA_HOME_PATH\}/g)?.length, 2);
  // No checkout, unlock, or alpha email on this card.
  assert.doesNotMatch(card, /AlphaAccessNote|onClick|Unlock|checkout|mailto/i);
  assert.match(css, /\.belt-rail--purple \{\s*--belt-fill: #6b2d91;/);
});
