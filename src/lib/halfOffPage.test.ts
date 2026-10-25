import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import {
  HALF_OFF_DESCRIPTION,
  HALF_OFF_OG_IMAGE_HEIGHT,
  HALF_OFF_OG_IMAGE_URL,
  HALF_OFF_OG_IMAGE_WIDTH,
  HALF_OFF_PAGE_URL,
  HALF_OFF_TITLE,
} from './halfOff.ts';
import { renderHalfOffDocument } from './halfOffPage.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

test('the half-off document is a share card with preview tags', () => {
  const css = readFileSync(resolve(root, 'src/pages/halfOff.css'), 'utf8');
  const html = renderHalfOffDocument(css);
  assert.match(html, new RegExp(`<title>${HALF_OFF_TITLE}</title>`));
  assert.match(html, /property="og:title" content="Advantage - half off"/);
  assert.match(html, new RegExp(`property="og:description" content="${HALF_OFF_DESCRIPTION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(html, /property="og:url" content="https:\/\/advantagebjjtimer\.com\/half-off"/);
  assert.match(html, new RegExp(`property="og:image" content="${HALF_OFF_OG_IMAGE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /name="twitter:title" content="Advantage - half off"/);
  assert.match(html, /name="twitter:image" content="https:\/\/advantagebjjtimer\.com\/half-off-card\.png"/);
  assert.equal(HALF_OFF_PAGE_URL, 'https://advantagebjjtimer.com/half-off');
  assert.doesNotMatch(html, /property="og:image" content="\/half-off-card\.png"/);
  assert.match(html, /ADVANTAGE/);
  assert.match(html, /Jiu-Jitsu Round Timer, Scoreboard &amp; Journal for Students,/);
  assert.match(html, /Gym Management Software for Pros/);
  assert.match(html, /BLUE/);
  assert.match(html, /WHITE/);
  assert.match(html, /ROUND 1/);
  assert.match(html, /05:00/);
  assert.match(html, /HALF OFF CODE: MEIA/);
  assert.match(html, /href="\/\?promo=MEIA">Get Advantage/);
  assert.match(html, /src="\/card-logo\.png"/);
  assert.match(html, /setItem\("advantage-half-off","MEIA"\)/);
  assert.doesNotMatch(html, /URLSearchParams/);
  assert.doesNotMatch(html, /location\.search/);
  assert.match(html, /href="\/\?promo=MEIA"/);
});

test('/half-off is a direct page and does not take the API functions', () => {
  const redirects = readFileSync(resolve(root, 'public/_redirects'), 'utf8');
  assert.match(redirects, /^\/\*\s+\/index\.html\s+200/m);
  assert.doesNotMatch(redirects, /^\/half-off\/?\s+\/half-off\.html/m);
  const routes = JSON.parse(readFileSync(resolve(root, 'public/_routes.json'), 'utf8')) as {
    include: string[];
  };
  assert.deepEqual(routes.include, ['/api/*']);
  const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');
  assert.match(viteConfig, /halfOffPagePlugin/);
  assert.match(viteConfig, /half-off/);
  const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8');
  assert.match(headers, /^\/half-off$/m);
  assert.match(headers, /^\/half-off\/$/m);
});

test('the share image is the half-off card', () => {
  const png = PNG.sync.read(readFileSync(resolve(root, 'public/half-off-card.png')));
  assert.equal(png.width, HALF_OFF_OG_IMAGE_WIDTH);
  assert.equal(png.height, HALF_OFF_OG_IMAGE_HEIGHT);
  assert.ok(png.data.length > 1000);
});
