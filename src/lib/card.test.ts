import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';
import { WHITE_BUY_PATH } from './whitePurchase.ts';
import {
  CARD_COMPANY,
  CARD_DESCRIPTION,
  CARD_DOCUMENT_TITLE,
  CARD_EMAIL,
  CARD_MAKER_LINE,
  CARD_PAGE_URL,
  CARD_PLACE,
  CARD_ROBOTS,
  CARD_SIGNUP_LABEL,
  CARD_SIGNUP_PATH,
  CARD_STUDENT_PATH,
  cardMakerParts,
  renderCardDocument,
} from './card.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('the card name is one editable line', () => {
  assert.equal(CARD_MAKER_LINE, 'Professor Justin Guise, Gracie Barra Ellijay');
  assert.deepEqual(cardMakerParts(), {
    name: 'Professor Justin Guise',
    affiliation: 'Gracie Barra Ellijay',
  });
  assert.equal(CARD_DOCUMENT_TITLE, 'Professor Justin Guise, Gracie Barra Ellijay — Advantage');
  assert.equal(CARD_PLACE, 'Georgia');
  assert.equal(CARD_COMPANY, 'Advantage App, LLC');
  assert.equal(CARD_EMAIL, 'advantageappllc@gmail.com');
  assert.equal(CARD_EMAIL, SITE_FEEDBACK_EMAIL);
  assert.equal(CARD_SIGNUP_PATH, '/buy');
  assert.equal(CARD_SIGNUP_PATH, WHITE_BUY_PATH);
  assert.equal(CARD_STUDENT_PATH, '/?student=1');
  assert.equal(CARD_PAGE_URL, 'https://advantagebjjtimer.com/card');
  assert.equal(CARD_ROBOTS, 'noindex, nofollow');
  assert.match(CARD_DESCRIPTION, /round timers, brackets, lesson plans, and a Student Edition training journal/);
});

test('the card document is one lightweight page', () => {
  const css = readFileSync(resolve(root, 'src/pages/card.css'), 'utf8');
  const html = renderCardDocument(css);
  assert.match(html, /Professor Justin Guise/);
  assert.match(html, /Gracie Barra Ellijay/);
  assert.doesNotMatch(html, /Justin Geis/);
  assert.match(html, /Georgia/);
  assert.match(html, /Advantage App, LLC/);
  assert.match(html, new RegExp(CARD_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /alt="Advantage"/);
  assert.match(html, /src="\/card-logo\.png"/);
  assert.match(html, /srcset="\/card-logo\.webp"/);
  assert.match(html, new RegExp(`href="${CARD_SIGNUP_PATH}">${CARD_SIGNUP_LABEL}`));
  assert.match(html, /href="\/\?student=1"/);
  assert.match(html, /href="https:\/\/advantagebjjtimer\.com\/"/);
  assert.match(html, /advantagebjjtimer\.com/);
  assert.match(html, /href="mailto:advantageappllc@gmail\.com"/);
  assert.match(html, /name="robots" content="noindex, nofollow"/);
  assert.match(html, /property="og:title" content="Professor Justin Guise, Gracie Barra Ellijay — Advantage"/);
  assert.match(html, /property="og:url" content="https:\/\/advantagebjjtimer\.com\/card"/);
  assert.match(html, /property="og:image"/);
  assert.doesNotMatch(html, /<script/i);
  assert.doesNotMatch(html, /fonts\.google/i);
  assert.doesNotMatch(html, /tel:/i);
  assert.doesNotMatch(html, /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/);
  assert.doesNotMatch(html, /\b(Street|Avenue|Road|Boulevard)\b/i);
});

test('/card is a direct route and does not take the API functions', () => {
  const redirects = readFileSync(resolve(root, 'public/_redirects'), 'utf8');
  const cardAt = redirects.search(/^\/card\s+\/card\.html\s+200/m);
  const slashAt = redirects.search(/^\/card\/\s+\/card\.html\s+200/m);
  const splatAt = redirects.search(/^\/\*\s+\/index\.html\s+200/m);
  assert.ok(cardAt >= 0 && slashAt > cardAt && splatAt > slashAt);
  const routes = JSON.parse(readFileSync(resolve(root, 'public/_routes.json'), 'utf8')) as {
    include: string[];
  };
  assert.deepEqual(routes.include, ['/api/*']);
  const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /cardPagePlugin/);
  assert.ok(viteConfig.includes('/^\\/card\\/?(?:$|\\?)/'));
});

test('the printable QR opens the card', () => {
  const png = PNG.sync.read(readFileSync(resolve(root, 'public/card-qr.png')));
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  assert.equal(code?.data, 'https://advantagebjjtimer.com/card');
  const svg = readFileSync(resolve(root, 'public/card-qr.svg'), 'utf8');
  assert.match(svg, /<svg/);
});
