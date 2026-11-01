import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  DEFAULT_TIMER_BACKDROP,
  TIMER_BACKDROP_KEY,
  TIMER_BACKGROUND_MAX_EDGE,
  getTimerBackdrop,
  normalizeTimerBackdrop,
  patchTimerBackdrop,
  setTimerScrim,
  setTimerShowGymLogo,
  subscribeTimerBackdrop,
  timerBackdropClasses,
  timerBackdropForAccess,
  timerGymLogoSrc,
} from './timerBackdrop.ts';
import { mediaConsoleDoorOpen } from './productNames.ts';
import { doorsThatOpen, impliedDoors } from './tierImplications.ts';

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

const storage = memoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const read = (path: string) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');

test('Timer backdrop defaults: skin background, gym logo off, medium dim', () => {
  storage.removeItem(TIMER_BACKDROP_KEY);
  const prefs = getTimerBackdrop();
  assert.equal(prefs.backgroundStamp, null);
  assert.equal(prefs.showGymLogo, false);
  assert.equal(prefs.scrim, 'medium');
  assert.deepEqual(DEFAULT_TIMER_BACKDROP.showGymLogo, false);
});

test('Junk stored prefs fall back to defaults', () => {
  assert.deepEqual(normalizeTimerBackdrop(null), DEFAULT_TIMER_BACKDROP);
  assert.deepEqual(normalizeTimerBackdrop({ showGymLogo: 'yes', scrim: 'neon', backgroundStamp: -4 }), DEFAULT_TIMER_BACKDROP);
  storage.setItem(TIMER_BACKDROP_KEY, '{not json');
  assert.deepEqual(getTimerBackdrop(), DEFAULT_TIMER_BACKDROP);
});

test('Logo toggle and dim level persist and notify listeners', () => {
  storage.removeItem(TIMER_BACKDROP_KEY);
  let calls = 0;
  const off = subscribeTimerBackdrop(() => {
    calls += 1;
  });
  setTimerShowGymLogo(true);
  setTimerScrim('strong');
  off();
  assert.equal(calls, 2);
  const saved = JSON.parse(storage.getItem(TIMER_BACKDROP_KEY) ?? '{}');
  assert.equal(saved.showGymLogo, true);
  assert.equal(saved.scrim, 'strong');
  assert.equal(getTimerBackdrop().showGymLogo, true);
  setTimerShowGymLogo(false);
  assert.equal(getTimerBackdrop().showGymLogo, false);
  assert.equal(getTimerBackdrop().scrim, 'strong', 'turning the logo off keeps the dim level');
});

test('Snapshot is stable between reads (useSyncExternalStore)', () => {
  patchTimerBackdrop({ backgroundStamp: 123 });
  assert.equal(getTimerBackdrop(), getTimerBackdrop());
});

test('Corner logo shows only when the toggle is on and a gym logo is saved', () => {
  const on = { ...DEFAULT_TIMER_BACKDROP, showGymLogo: true };
  assert.equal(timerGymLogoSrc(DEFAULT_TIMER_BACKDROP, 'data:image/png;base64,AA'), null);
  assert.equal(timerGymLogoSrc(on, null), null);
  assert.equal(timerGymLogoSrc(on, ''), null);
  assert.equal(timerGymLogoSrc(on, 'javascript:alert(1)'), null);
  assert.equal(timerGymLogoSrc(on, 'data:image/png;base64,AA'), 'data:image/png;base64,AA');
});

test('Display classes only appear when something custom is set', () => {
  assert.equal(timerBackdropClasses(false, DEFAULT_TIMER_BACKDROP, false), '');
  assert.equal(
    timerBackdropClasses(true, { ...DEFAULT_TIMER_BACKDROP, scrim: 'light' }, true),
    'training--custom-bg training--scrim-light training--gym-logo',
  );
});

test('Background is scaled to a TV edge before it is stored', () => {
  assert.equal(TIMER_BACKGROUND_MAX_EDGE, 1920);
});

test('Regression: round timer display keeps every existing control', () => {
  const page = read('../pages/Training.tsx');
  for (const needle of [
    '<PlayExitMark to={exitTo} onExit={exitTraining} />',
    '<FullscreenChip',
    'className="training__phase"',
    'className="training__clock"',
    'Back to curriculum',
    '<TrainingOptions onReset',
    'trainingUsesAdvantageSkin(skin)',
    'wantsRoundsFullscreen',
  ]) {
    assert.ok(page.includes(needle), `Training.tsx still has ${needle}`);
  }
  assert.ok(page.includes('training__backdrop'));
  assert.ok(page.includes('training__gym-logo'));
});

test('Regression: timer options keep length, break, rounds, sound, skin, reset, and add Background & logo', () => {
  const options = read('../components/TrainingOptions.tsx');
  for (const needle of ['Round length', 'Break', 'Rounds', 'Sound', 'Timer skin', 'Reset session', '<TimerBackdropOptions />']) {
    assert.ok(options.includes(needle), `TrainingOptions still has ${needle}`);
  }
  const controller = read('../pages/TrainingController.tsx');
  assert.ok(controller.includes('<TrainingOptions />'), 'controller still renders the shared options');
});

test('Timer backdrop reuses the Media Console gym logo, never a copy', () => {
  const src = read('./timerBackdrop.ts');
  assert.ok(!src.includes('GYM_LOGO_STORAGE_KEY') && !src.includes("'matboard.gymLogo.v1'"), 'no second logo key');
  const panel = read('../components/TimerBackdropOptions.tsx');
  assert.ok(panel.includes('useGymLogo'));
  assert.ok(panel.includes('saveGymLogoFile'));
});

test('CSS: picture and scrim sit under the controls; logo mirrors the exit mark', () => {
  const css = read('../index.css');
  assert.match(css, /\.training__backdrop,\s*\.training__scrim \{[^}]*position: fixed;[^}]*z-index: 0;/);
  assert.match(css, /\.training__gym-logo \{[^}]*width: 64px;[^}]*height: 64px;/);
  assert.match(css, /\.training__gym-logo img \{[^}]*width: var\(--mark-back\);/);
  assert.match(css, /\.training--gym-logo \.play-fs-slot \{/);
});

test('Media gate: without Media the timer shows the default background and no logo, data kept', () => {
  const saved = normalizeTimerBackdrop({ version: 1, backgroundStamp: 42, showGymLogo: true, scrim: 'strong' });
  const copy = JSON.stringify(saved);
  const locked = timerBackdropForAccess(saved, false);
  assert.equal(locked.backgroundStamp, null);
  assert.equal(locked.showGymLogo, false);
  assert.equal(locked.scrim, 'strong');
  assert.equal(JSON.stringify(saved), copy, 'saved prefs are not changed');
  assert.equal(timerBackdropForAccess(saved, true), saved);
  assert.equal(timerGymLogoSrc(locked, 'data:image/png;base64,AAAA'), null);
  assert.equal(timerBackdropClasses(false, locked, false), '');
});

test('Media gate: White and Student do not get it; Media, Pro and owner unlock do', () => {
  const door = (grants: string[]) => ({
    proUnlocked: impliedDoors(grants).includes('pro'),
    mediaUnlocked: impliedDoors(grants).includes('media'),
    seated: false,
    seatGrantsMedia: false,
    programDirectorSeat: false,
    coachMenus: false,
  });
  assert.equal(mediaConsoleDoorOpen(door(['white'])), false, 'White');
  assert.equal(mediaConsoleDoorOpen(door(['student'])), false, 'Student');
  assert.equal(mediaConsoleDoorOpen(door(['student', 'white'])), false, 'Student + White');
  assert.equal(mediaConsoleDoorOpen(door(['media'])), true, 'Media');
  assert.equal(mediaConsoleDoorOpen(door(['pro'])), true, 'Pro');
  assert.equal(mediaConsoleDoorOpen(door(['white', 'student', 'coach', 'pro', 'media'])), true, 'owner unlock');
  const openers = doorsThatOpen('media');
  assert.ok(openers.includes('media') && openers.includes('pro'));
  assert.ok(!openers.includes('white') && !openers.includes('student'));
});

test('Media gate uses the shared Media door check, never a tier list', () => {
  const hook = fs.readFileSync(new URL('../hooks/useTimerBackdrop.ts', import.meta.url), 'utf8');
  const options = fs.readFileSync(new URL('../components/TimerBackdropOptions.tsx', import.meta.url), 'utf8');
  const training = fs.readFileSync(new URL('../pages/Training.tsx', import.meta.url), 'utf8');
  assert.match(hook, /return mediaConsoleDoorOpen\(useSeatDoor\(\)\);/);
  for (const src of [hook, options]) {
    assert.doesNotMatch(src, /useProUnlocked|useCoachUnlocked|useWhiteUnlocked|'coach'|'instructor'|'pro'/);
  }
  assert.match(options, /useEffectiveTimerBackdrop\(\)/);
  assert.match(options, /if \(!unlocked\) return null;/, 'no Media door: the section is absent');
  assert.doesNotMatch(options, /Unlock with|MEDIA_EDITION_PATH|timer-backdrop--locked/, 'no lock state or upsell');
  assert.match(training, /useEffectiveTimerBackdrop\(\)/);
  assert.doesNotMatch(training, /useTimerBackdropPrefs\(\)/);
  assert.doesNotMatch(options + hook, /clearTimerBackground\(\)[^;]*unlocked|!unlocked[^\n]*clear/, 'locking never deletes the picture');
});

test('Timer logo: shared gym logo by default, Replace logo once one exists', () => {
  const options = fs.readFileSync(new URL('../components/TimerBackdropOptions.tsx', import.meta.url), 'utf8');
  assert.match(options, /useGymLogo\(\)/);
  assert.match(options, /await saveGymLogoFile\(file\)/);
  assert.match(options, /Replace logo/);
  assert.match(options, /Add gym logo/);
  assert.match(options, /Pro \/ Media Console/);
});
