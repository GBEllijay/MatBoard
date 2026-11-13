import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const home = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const student = readFileSync(new URL('../student-edition.css', import.meta.url), 'utf8');
const arena = readFileSync(new URL('../pages/student/arena.css', import.meta.url), 'utf8');
const sheet = readFileSync(new URL('../components/Sheet.tsx', import.meta.url), 'utf8');
const edition = readFileSync(new URL('../pages/StudentEdition.tsx', import.meta.url), 'utf8');

function block(css: string, selector: string): string {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, selector);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

test('home, roster, and student pages scroll with the document', () => {
  const pages = block(home, 'main.home:has(.home__logo)');
  assert.match(pages, /overflow:\s*visible/);
  assert.match(pages, /height:\s*auto/);
  assert.match(pages, /max-height:\s*none/);
  assert.match(pages, /padding-top:\s*0/);
  assert.doesNotMatch(pages, /overflow:\s*auto/);
  assert.doesNotMatch(pages, /border-top:\s*calc\(var\(--mark-home-clear\)/);

  const frame = block(student, '.student-frame {');
  assert.match(frame, /overflow:\s*visible/);
  assert.match(frame, /height:\s*auto/);
  assert.doesNotMatch(frame, /overflow:\s*hidden/);
  assert.doesNotMatch(frame, /\n\s*height:\s*100dvh/);

  const paper = block(student, '.student-paper {');
  assert.match(paper, /overflow:\s*visible/);
  const scroll = block(arena, '.arena-scroll {');
  assert.match(scroll, /overflow:\s*visible/);
});

test('demo warning is in the page flow and does not paint behind the logos', () => {
  const banner = block(student, '.student-demo-banner {');
  assert.match(banner, /position:\s*static/);
  assert.doesNotMatch(banner, /margin:\s*calc\(var\(--mark-home-clear\)/);
  assert.doesNotMatch(banner, /position:\s*sticky/);
  assert.doesNotMatch(banner, /position:\s*fixed/);
  assert.match(edition, /Exit demo/);
  const clear = block(student, 'body:has(.student-demo-banner) main.home:has(.home__logo)');
  assert.match(clear, /padding-top:\s*0\.75rem/);
});

test('page home and back marks scroll with the document', () => {
  const logo = block(home, '.home__logo {');
  const back = block(home, '.play-exit {');
  const center = block(home, '.tier-home {');
  assert.match(logo, /position:\s*static/);
  assert.match(back, /position:\s*relative/);
  assert.match(center, /position:\s*relative/);
  assert.match(center, /transform:\s*none/);
  assert.doesNotMatch(logo, /position:\s*fixed/);
  assert.doesNotMatch(logo, /position:\s*sticky/);
  assert.doesNotMatch(back, /position:\s*sticky/);
  const pinnedAt = home.indexOf('.training > .play-exit');
  assert.notEqual(pinnedAt, -1);
  const pinned = home.slice(pinnedAt, pinnedAt + 420);
  assert.match(pinned, /position:\s*fixed/);
  assert.match(pinned, /\.saver > \.play-exit/);
  assert.match(pinned, /\.tournament > \.play-exit/);
  const videos = block(home, '.techniques__bar {');
  assert.match(videos, /position:\s*relative/);
  assert.match(videos, /background:\s*transparent/);
  assert.doesNotMatch(videos, /position:\s*sticky/);
  assert.match(videos, /backdrop-filter:\s*none/);
});

test('home--pro pages do not reserve a fixed-logo band above the in-flow mark', () => {
  const sheet = readFileSync(new URL('../components/gymSheet.css', import.meta.url), 'utf8');
  const proInner = block(sheet, '.home--pro .home__inner {');
  assert.match(proInner, /padding-top:\s*calc\(0\.5rem \+ var\(--safe-t\)\)/);
  assert.doesNotMatch(proInner, /--mark-home/);
  assert.doesNotMatch(sheet, /padding-top:\s*calc\(var\(--mark-home\)/);
  const back = block(sheet, '.home--pro .play-exit {');
  assert.match(back, /margin-top:\s*0\.35rem/);
  assert.doesNotMatch(back, /--safe-t/);
});

test('sheet close behavior is unchanged', () => {
  assert.match(sheet, /onPointerUp=\{\(event\) => \{\s*closeFromPointer\(event\);/);
});
