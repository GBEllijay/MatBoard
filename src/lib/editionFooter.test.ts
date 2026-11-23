import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function before(file: string, earlier: string, later: string) {
  const text = source(file);
  const left = text.indexOf(earlier);
  const right = text.indexOf(later);
  assert.ok(left >= 0, `${earlier} missing in ${file}`);
  assert.ok(right > left, `${earlier} should come before ${later} in ${file}`);
}

test('edition homes put the ladder before Instructions, FAQ, and the legal footer', () => {
  for (const file of ['../pages/Pro.tsx', '../pages/ProPlusCloud.tsx', '../pages/Coach.tsx']) {
    before(file, '<EditionLadder', '<InstructionsButton');
    before(file, '<InstructionsButton', '<FaqLink');
    before(file, '<FaqLink', '<SiteFooter');
  }
  before('../pages/White.tsx', '<InstructionsButton', '<SiteFooter');
  before('../pages/MediaEditionHub.tsx', '<EditionLadder', 'home__hints');
  before('../pages/MediaEditionHub.tsx', 'home__hints', '<SiteFooter');
});

test('the White page has no edition ladder and an Alpha testers footer link to /products', () => {
  const page = source('../pages/White.tsx');
  const footer = source('../components/SiteFooter.tsx');
  assert.equal(page.includes('EditionLadder'), false);
  assert.match(page, /const native = isNativeWhiteApp\(\);/);
  assert.match(page, /<SiteFooter hideAccount alphaTesters=\{!native\} \/>/);
  assert.doesNotMatch(page, /<SiteFooter hideAccount alphaTesters \/>/);
  assert.match(footer, /alphaTesters \? <Link to=\{PRODUCTS_PATH\}>Alpha testers</);
  assert.match(page, /Buy Advantage White — \$9\.99/);
  assert.match(page, /All products/);
  assert.match(page, /Lock White/);
  assert.match(page, /<InstructionsButton/);
  assert.doesNotMatch(page, /FaqLink/);
  assert.doesNotMatch(page, /WhiteUpgradePrompt|grow into Pro/);
  assert.match(footer, /to="\/faq">FAQ</);
  for (const file of [
    '../pages/Pro.tsx',
    '../pages/ProPlusCloud.tsx',
    '../pages/Coach.tsx',
    '../pages/MediaEditionHub.tsx',
    '../pages/student/StudentMenus.tsx',
  ]) {
    assert.match(source(file), /<EditionLadder/, `${file} should keep its edition ladder`);
    assert.doesNotMatch(source(file), /alphaTesters/, `${file} should not get the White-only Alpha testers prop`);
  }
});

test('pages that already have no ladder do not grow one', () => {
  const saver = source('../pages/Screensaver.tsx');
  assert.equal(saver.includes('EditionLadder'), false);
  assert.ok(saver.indexOf('<InstructionsButton') < saver.indexOf('<FaqLink'));
  const student = source('../pages/StudentEdition.tsx');
  assert.equal(student.includes('EditionLadder'), false);
  assert.match(student, /<SiteFooter \/>/);
});
