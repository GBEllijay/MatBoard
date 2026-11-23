import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { WHITE_BUY_PATH } from './whitePurchase.ts';
import { whiteEntryPath, whiteHubAllowed, whiteLiveToolsAllowed } from './whiteUnlock.ts';
import { whiteBaseSkinTier, whiteBaseSkinsOpen } from './whiteSkinTier.ts';
import {
  PREVIEW_WHITE_BADGE_TEXT,
  isPreviewWhiteBypassHost,
  isPreviewWhiteUnlocked,
} from './previewWhiteBypass.ts';

const PREVIEW_HOSTS = ['abc123.matboard.pages.dev', 'draft-white-brackets-roster.matboard.pages.dev'];
const CLOSED_HOSTS = [
  'advantagebjjtimer.com',
  'www.advantagebjjtimer.com',
  'matboard.pages.dev',
  'evil-matboard.pages.dev.attacker.com',
  'localhost',
];
const closedTools = { whiteUnlocked: false, coachDoor: false, proDoor: false };

test('White preview bypass is on only for Pages hash and branch preview hosts', () => {
  for (const host of PREVIEW_HOSTS) {
    assert.equal(isPreviewWhiteBypassHost(host), true, host);
    assert.equal(isPreviewWhiteUnlocked(host), true, host);
  }
});

test('White preview bypass stays off on production, look-alikes, and localhost', () => {
  for (const host of CLOSED_HOSTS) {
    assert.equal(isPreviewWhiteBypassHost(host), false, host);
    assert.equal(isPreviewWhiteUnlocked(host), false, host);
  }
  assert.equal(isPreviewWhiteBypassHost(''), false);
  assert.equal(isPreviewWhiteBypassHost('  MATBOARD.PAGES.DEV  '), false);
  assert.equal(isPreviewWhiteBypassHost('pages.dev'), false);
  assert.equal(isPreviewWhiteBypassHost('matboard.pages.dev.evil.com'), false);
});

test('a locked visitor on a preview host can open White tools without writing unlock flags', () => {
  const before = typeof localStorage === 'undefined' ? null : localStorage.getItem('advantage.whiteUnlocked');
  for (const host of PREVIEW_HOSTS) {
    assert.equal(whiteHubAllowed(false, host), true, host);
    assert.equal(whiteEntryPath(false, host), '/white', host);
    assert.equal(whiteLiveToolsAllowed(closedTools, host), true, host);
  }
  const after = typeof localStorage === 'undefined' ? null : localStorage.getItem('advantage.whiteUnlocked');
  assert.equal(after, before);
});

test('production hosts still send a locked visitor to /buy', () => {
  for (const host of CLOSED_HOSTS) {
    assert.equal(whiteHubAllowed(false, host), false, host);
    assert.equal(whiteEntryPath(false, host), WHITE_BUY_PATH, host);
    assert.equal(whiteEntryPath(false, host), '/buy', host);
    assert.equal(whiteLiveToolsAllowed(closedTools, host), false, host);
  }
  // A real purchase still opens White on production.
  assert.equal(whiteHubAllowed(true, 'advantagebjjtimer.com'), true);
  assert.equal(whiteEntryPath(true, 'matboard.pages.dev'), '/white');
});

test('the bypass is host-based only and never reads the address bar', () => {
  const src = readFileSync(new URL('./previewWhiteBypass.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /searchParams|URLSearchParams|location\.search|location\.hash|location\.href/);
  assert.match(src, /Address-bar values never unlock/);
  assert.equal(PREVIEW_WHITE_BADGE_TEXT, 'Preview build: White unlocked for testing');
  const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(app, /<PreviewWhiteBadge \/>/);
  assert.match(app, /if \(!whiteHubAllowed\(unlocked\)\) return <GuardRedirect to=\{WHITE_BUY_PATH\} \/>/);
  assert.doesNotMatch(src, /localStorage|writeFlag|setWhiteUnlocked|setProUnlocked|setCoachUnlocked/);
  const unlock = readFileSync(new URL('./whiteUnlock.ts', import.meta.url), 'utf8');
  assert.match(unlock, /isPreviewWhiteUnlocked\(hostname\)/);
  const badge = readFileSync(new URL('../components/PreviewWhiteBadge.tsx', import.meta.url), 'utf8');
  assert.match(badge, /PREVIEW_WHITE_BADGE_TEXT/);
  assert.match(badge, /isPreviewWhiteUnlocked\(\)/);
});

const closedDoors = { white: false, student: false, media: false, coach: false, pro: false };
const whiteDoors = { ...closedDoors, white: true };
const proDoors = { white: true, student: true, media: true, coach: true, pro: true };

test('preview-host White unlock opens the White skin catalog, same as /white and brackets', () => {
  for (const host of PREVIEW_HOSTS) {
    assert.equal(whiteBaseSkinTier(closedDoors), false, 'doors alone stay closed');
    assert.equal(whiteBaseSkinsOpen(closedDoors, host), true, host);
    assert.equal(whiteBaseSkinsOpen(whiteDoors, host), true, host);
    // A higher door still wins on a preview host.
    assert.equal(whiteBaseSkinsOpen(proDoors, host), false, host);
  }
  const hook = readFileSync(new URL('../hooks/usePolishedSkins.ts', import.meta.url), 'utf8');
  assert.match(hook, /whiteBaseSkinsOpen\(/);
  assert.doesNotMatch(hook, /whiteBaseSkinTier\(/);
});

test('production still requires a real White purchase for skins, and that purchase still works', () => {
  for (const host of CLOSED_HOSTS) {
    assert.equal(whiteBaseSkinsOpen(closedDoors, host), false, host);
    assert.equal(whiteBaseSkinsOpen(whiteDoors, host), true, host);
  }
  assert.equal(whiteBaseSkinsOpen(whiteDoors, 'advantagebjjtimer.com'), true);
  assert.equal(whiteBaseSkinsOpen(closedDoors, 'advantagebjjtimer.com'), false);
  assert.equal(whiteBaseSkinsOpen(proDoors, 'advantagebjjtimer.com'), false);
});
