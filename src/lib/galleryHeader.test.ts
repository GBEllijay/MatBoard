import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function ruleBody(css: string, selector: string): string {
  const token = `\n${selector} {`;
  const start = css.indexOf(token);
  assert.notEqual(start, -1, selector);
  const open = start + token.length - 1;
  const close = css.indexOf('}', open);
  assert.ok(close > open, selector);
  return css.slice(open + 1, close);
}

test('the gallery belt scrolls and other Pro headers stay as they were', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../pages/Screensaver.tsx', import.meta.url), 'utf8');

  const galleryBelt = ruleBody(css, '.saver-belt.saver-belt--flow');
  assert.match(galleryBelt, /position:\s*static/);
  assert.doesNotMatch(galleryBelt, /position:\s*(fixed|sticky)/);

  const pinnedBelt = ruleBody(css, '.saver-belt');
  assert.match(pinnedBelt, /position:\s*fixed/);
  assert.doesNotMatch(pinnedBelt, /position:\s*sticky/);

  const sharedBelt = ruleBody(css, '.belt-header');
  assert.doesNotMatch(sharedBelt, /position:\s*(fixed|sticky)/);

  assert.match(ruleBody(css, '.play-exit'), /position:\s*fixed/);
  assert.match(ruleBody(css, '.tier-home'), /position:\s*fixed/);
  assert.match(ruleBody(css, '.home__logo'), /position:\s*fixed/);

  assert.match(page, /focusFolder === 'gallery'/);
  assert.match(page, /galleryPage \? 'saver-belt saver-belt--flow' : 'saver-belt'/);
  assert.match(page, /beltInSheet \? beltHeader : null/);
  assert.doesNotMatch(page, /saver-belt--flow[\s\S]*folder === 'events'|folder === 'shop'[\s\S]*saver-belt--flow/);
});
