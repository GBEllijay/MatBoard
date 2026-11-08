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
  before('../pages/White.tsx', '<EditionLadder', '<InstructionsButton');
  before('../pages/White.tsx', '<FaqLink', '<SiteFooter');
  before('../pages/MediaEditionHub.tsx', '<EditionLadder', 'home__hints');
  before('../pages/MediaEditionHub.tsx', 'home__hints', '<SiteFooter');
});

test('pages that already have no ladder do not grow one', () => {
  const saver = source('../pages/Screensaver.tsx');
  assert.equal(saver.includes('EditionLadder'), false);
  assert.ok(saver.indexOf('<InstructionsButton') < saver.indexOf('<FaqLink'));
  const student = source('../pages/StudentEdition.tsx');
  assert.equal(student.includes('EditionLadder'), false);
  assert.match(student, /<SiteFooter \/>/);
});
