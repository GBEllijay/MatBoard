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

test('the White hub no longer shows the upgrade prompt', () => {
  const page = read('../pages/White.tsx');
  const prompt = read('../components/WhiteUpgradePrompt.tsx');
  assert.doesNotMatch(page, /WhiteUpgradePrompt|grow into Pro/);
  assert.equal(page.includes('<WhiteRosterCard'), false);
  assert.ok(page.indexOf('<BracketRosterCard />') > 0);
  assert.match(prompt, /aria-label=\{WHITE_UPGRADE_LABEL\}/);
  assert.match(prompt, /to=\{WHITE_UPGRADE_PATH\}/);
  assert.match(prompt, /belt-tip--blue/);
  assert.doesNotMatch(prompt, /\$|formatUsd|PRICE/);
});
