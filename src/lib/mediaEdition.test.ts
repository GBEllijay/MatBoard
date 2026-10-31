import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import {
  MEDIA_EDITION_ALPHA_NOTE,
  MEDIA_EDITION_BELT_CLOTH,
  MEDIA_EDITION_FEATURES,
  MEDIA_EDITION_GALLERY,
  MEDIA_EDITION_INCLUDED,
  MEDIA_EDITION_INCLUDES,
  MEDIA_EDITION_LEAD,
  MEDIA_EDITION_LIST_PRICE_CENTS,
  MEDIA_EDITION_NAME,
  MEDIA_EDITION_OLD_PATH,
  MEDIA_EDITION_PATH,
  MEDIA_EDITION_PRICE_DETAIL,
  MEDIA_EDITION_PRICE_LINE,
} from './mediaEdition.ts';
import { MEDIA_CONSOLE_INSTRUCTIONS, MEDIA_CONSOLE_NAME } from './productNames.ts';
import { STOREFRONT_BELT_LADDER } from './storefrontBelts.ts';
import { formatUsdFromCents, WHITE_INCLUDED } from './whitePurchase.ts';
import { FOLDERS } from './photoStore.ts';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const app = read('../App.tsx');
const page = read('../pages/MediaEdition.tsx');
const css = read('../pages/mediaEdition.css');
const indexCss = read('../index.css');

test('Media Edition lives at /media and /media-edition redirects there', () => {
  assert.equal(MEDIA_EDITION_PATH, '/media');
  assert.equal(MEDIA_EDITION_OLD_PATH, '/media-edition');
  assert.match(app, /<Route path=\{MEDIA_EDITION_PATH\} element=\{<MediaEditionRoute \/>\} \/>/);
  assert.match(
    app,
    /<Route path=\{MEDIA_EDITION_OLD_PATH\} element=\{<Navigate to=\{MEDIA_EDITION_PATH\} replace \/>\} \/>/,
  );
  // The old public page is no longer mounted on its own address.
  assert.doesNotMatch(app, /<Route path="\/media-edition"/);
});

test('/media is gated by the same Media Console door as /slideshow', () => {
  const route = app.slice(app.indexOf('function MediaEditionRoute()'));
  assert.match(route.slice(0, 200), /return <MediaEditionGate open=\{mediaConsoleDoorOpen\(door\)\} \/>;/);
  const gate = read('../components/MediaEditionGate.tsx');
  assert.match(gate, /if \(!open\) return <MediaEditionPage \/>;/);
  assert.match(gate, /<PaidMediaEditionPage \/>/);
  // The paid console comes through the paid-screen import, media-console chunk.
  const paid = read('../components/PaidScreen.tsx');
  assert.match(
    paid,
    /const loadMediaEdition = \(\) =>\s*import\('\.\.\/pages\/Screensaver\.tsx'\)\.then\(\(mod\) => \(\{ node: <mod\.ScreensaverPage edition \/> \}\)\);/,
  );
  assert.match(paid, /export function PaidMediaEditionPage\(\) \{\s*return <PaidImport chunk="media-console" load=\{loadMediaEdition\} \/>;/);
  // Nothing public imports the paid page module directly.
  assert.doesNotMatch(gate, /pages\/Screensaver/);
  assert.doesNotMatch(app, /from '\.\/pages\/Screensaver'/);
});

test('title, price and lead match the homepage card', () => {
  const card = STOREFRONT_BELT_LADDER.find((r) => r.id === 'academy');
  assert.ok(card);
  assert.equal(MEDIA_EDITION_NAME, 'Advantage Media Edition');
  assert.equal(card.title, MEDIA_EDITION_NAME);
  assert.equal(MEDIA_EDITION_PRICE_LINE, '$29.99 one-time');
  assert.equal(card.cardPrice, MEDIA_EDITION_PRICE_LINE);
  assert.equal(formatUsdFromCents(MEDIA_EDITION_LIST_PRICE_CENTS), '$29.99');
  assert.match(MEDIA_EDITION_PRICE_DETAIL, /one-time/);
  assert.equal(MEDIA_EDITION_LEAD, card.blurb);
  assert.match(page, /document\.title = MEDIA_EDITION_NAME/);
});

test('the homepage Media card links to the page, not the mailto', () => {
  const card = STOREFRONT_BELT_LADDER.find((r) => r.id === 'academy');
  assert.equal(card?.to, MEDIA_EDITION_PATH);
  assert.equal(card?.belt, 'purple');
});

test('purple belt is the Media Console cloth #6b2d91', () => {
  assert.equal(MEDIA_EDITION_BELT_CLOTH, '#6b2d91');
  assert.match(page, /belt-tip belt-tip--purple buy__belt/);
  assert.match(css, /\.home--media \.belt-tip--purple \{\s*--belt-cloth: #6b2d91;/);
  assert.match(indexCss, /\.belt-header--purple \.belt-header__belt \{\s*--cloth: #6b2d91;/);
});

test('not for sale: no checkout, Stripe, code kind or entitlement; CTA is the alpha email', () => {
  const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /checkout|stripe|redeem|entitle|WHITE_CHECKOUT_API|fetch\(/i);
  assert.match(page, /href=\{alphaRequestMailto\(\)\}/);
  assert.match(page, /<AlphaAccessNote note=\{MEDIA_EDITION_ALPHA_NOTE\} \/>/);
  assert.equal(
    MEDIA_EDITION_ALPHA_NOTE,
    'Media Edition is in alpha testing. Email advantageappllc@gmail.com to request an alpha code.',
  );
  for (const file of ['../server/entitlements.ts', '../server/stripeCheckout.ts']) {
    const p = new URL(file, import.meta.url);
    if (existsSync(p)) assert.doesNotMatch(readFileSync(p, 'utf8'), /media-edition|mediaEdition|Media Edition/);
  }
});

test('features are White plus the real Media Console', () => {
  assert.equal(MEDIA_EDITION_INCLUDES, 'Includes everything in Advantage White.');
  assert.deepEqual([...MEDIA_EDITION_INCLUDED], [...WHITE_INCLUDED, MEDIA_CONSOLE_NAME]);
  assert.deepEqual(
    MEDIA_EDITION_FEATURES.map((f) => f.title),
    ['Gallery', 'Class Schedule', 'Pro Shop', 'Events', 'Play order and timing', 'Video sound', 'Gym logo', 'Stays on this device'],
  );
  // Folder names are the Media Console's own folders.
  for (const folder of FOLDERS) assert.ok(MEDIA_EDITION_FEATURES.some((f) => f.title === folder.label), folder.label);
  // Lines quoted from the Media Console instructions stay in sync with the app.
  const instructions = MEDIA_CONSOLE_INSTRUCTIONS.join(' ');
  for (const quoted of [
    'Enabled folders play Gallery, then Pro Shop, then Events.',
    'Casts the full week or month after Gallery, before Pro Shop.'.replace('Casts', 'casts'),
    'The TV builds a QR from that link.',
    'Clips stay muted unless Play video sound is on, so gym music in another tab can keep going.',
    'Images only, Images + QR, or Images + QR + gym logo.',
  ]) {
    assert.ok(instructions.includes(quoted), quoted);
  }
});

test('the white band is gone from the marketing page', () => {
  assert.doesNotMatch(page, /media-band|BAND_SHOTS/);
  assert.doesNotMatch(css, /media-band/);
});

test('gallery sits directly under the header card, real repo images in order', () => {
  assert.deepEqual(
    MEDIA_EDITION_GALLERY.map((s) => s.src),
    ['/homepage/woodblock-scoreboard.jpg', '/homepage/woodblock-timer.jpg', '/storefront/round-timer-live.png'],
  );
  for (const shot of MEDIA_EDITION_GALLERY) {
    assert.ok(existsSync(new URL(`../../public${shot.src}`, import.meta.url)), shot.src);
    assert.ok(shot.alt.length > 10);
  }
  const head = page.indexOf('</article>');
  const gallery = page.indexOf('<section className="media-gallery"');
  assert.ok(head > 0 && gallery > head);
  assert.doesNotMatch(page.slice(head, gallery), /<section/);
  // No invented assets: nothing generated under public for this page.
  assert.doesNotMatch(page, /pro-console-preview|coach-preview/);
});
