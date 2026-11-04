/**
 * White hub upgrade prompt. Visible for White only, with the owner's two lines
 * and no dollar amount. Hidden at Student and above, and for a live seat.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  WHITE_UPGRADE_LABEL,
  WHITE_UPGRADE_LINE,
  WHITE_UPGRADE_PATH,
  WHITE_UPGRADE_SUB,
  whiteUpgradePromptVisible,
} from './whiteUpgradePrompt.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const whiteOnly = {
  white: true,
  student: false,
  media: false,
  coach: false,
  pro: false,
  cloud: false,
  seated: false,
};

test('the White upgrade lines are the owner copy and carry no price', () => {
  assert.equal(WHITE_UPGRADE_LINE, 'Start with White, grow into Pro.');
  assert.equal(
    WHITE_UPGRADE_SUB,
    'Your investment grows with you. Your purchase price counts towards each upgrade.',
  );
  assert.equal(WHITE_UPGRADE_LABEL, 'Upgrade to Student Edition');
  assert.equal(WHITE_UPGRADE_PATH, '/editions/student');
  assert.doesNotMatch(`${WHITE_UPGRADE_LINE} ${WHITE_UPGRADE_SUB} ${WHITE_UPGRADE_LABEL}`, /\$/);
});

test('the prompt is on for White only and off at Student and above, and for a seat', () => {
  assert.equal(whiteUpgradePromptVisible(whiteOnly), true);
  assert.equal(whiteUpgradePromptVisible({ ...whiteOnly, white: false }), false);
  for (const door of ['student', 'media', 'coach', 'pro', 'cloud'] as const) {
    assert.equal(whiteUpgradePromptVisible({ ...whiteOnly, [door]: true }), false, door);
  }
  assert.equal(whiteUpgradePromptVisible({ ...whiteOnly, seated: true }), false);
});

test('the White hub places the prompt under Match names and links to the Student buy page', () => {
  const page = read('../pages/White.tsx');
  const prompt = read('../components/WhiteUpgradePrompt.tsx');
  const css = read('../index.css');
  const namesAt = page.indexOf('<WhiteRosterCard />');
  const upgradeAt = page.indexOf('<WhiteUpgradePrompt />');
  assert.ok(namesAt > 0 && upgradeAt > namesAt);
  assert.match(prompt, /aria-label=\{WHITE_UPGRADE_LABEL\}/);
  assert.match(prompt, /to=\{WHITE_UPGRADE_PATH\}/);
  assert.match(prompt, /belt-tip--blue/);
  assert.doesNotMatch(prompt, /\$|formatUsd|PRICE/);
  assert.match(css, /\.home--white \.home__modes > \.white-upgrade \{[^}]*grid-column: 1 \/ -1;/);
  assert.match(css, /\.home--white \.home__modes > \.white-upgrade \{[^}]*position: relative;/);
  assert.doesNotMatch(
    css.slice(css.indexOf('.home--white .home__modes > .white-upgrade'), css.indexOf('.home--white .white-upgrade__mark')),
    /position:\s*(absolute|fixed|sticky)/,
  );
});
