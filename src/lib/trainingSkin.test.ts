import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { customSkinValue } from './customSkin.ts';
import {
  DEFAULT_TRAINING_SKIN,
  TRAINING_SKIN_KEY,
  getTrainingSkin,
  setTrainingSkin,
  trainingUsesAdvantageSkin,
  visibleTrainingSkin,
  trainingUsesLedClock,
  trainingUsesTrueFlipCards,
  trainingUsesSplitFlap,
  trainingHasProgressBar,
  whiteTimerSurfaceClass,
  whiteTimerControllerClass,
} from './trainingSkin.ts';

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

test('Round timer defaults to the Classic skin', () => {
  storage.removeItem(TRAINING_SKIN_KEY);
  assert.equal(DEFAULT_TRAINING_SKIN, 'classic');
  assert.equal(getTrainingSkin(), 'classic');
});

test('Round timer skin persists Classic and Advantage', () => {
  setTrainingSkin('themed');
  assert.equal(getTrainingSkin(), 'themed');
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'themed');
  setTrainingSkin('classic');
  assert.equal(getTrainingSkin(), 'classic');
});

test('Unknown stored timer skin falls back to Classic', () => {
  localStorage.setItem(TRAINING_SKIN_KEY, 'neon');
  assert.equal(getTrainingSkin(), 'classic');
});

test('Pro suite can switch Advantage, Classic, then Advantage across a reload', () => {
  setTrainingSkin('themed');
  assert.equal(trainingUsesAdvantageSkin(getTrainingSkin()), true);
  setTrainingSkin('classic');
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'classic');
  assert.equal(getTrainingSkin(), 'classic');
  assert.equal(trainingUsesAdvantageSkin(getTrainingSkin()), false);
  setTrainingSkin('themed');
  assert.equal(getTrainingSkin(), 'themed');
  assert.equal(trainingUsesAdvantageSkin(getTrainingSkin()), true);
  const page = fs.readFileSync(new URL('../pages/Training.tsx', import.meta.url), 'utf8');
  assert.match(page, /trainingUsesAdvantageSkin\(skin\)/);
  assert.doesNotMatch(page, /fromSuite \? ' training--themed'/);
});

test('Round timer still offers the Advantage skin beside Classic', () => {
  const source = fs.readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
  assert.match(source, /setTrainingSkin\('classic'\)/);
  assert.match(source, /setTrainingSkin\('themed'\)/);
  assert.match(source, />\s*Advantage\s*</);
});

test('Rounds controller uses the Classic board when that skin is picked', () => {
  const page = fs.readFileSync(new URL('../pages/TrainingController.tsx', import.meta.url), 'utf8');
  assert.match(page, /useTrainingSkin/);
  assert.match(page, /trainingUsesAdvantageSkin\(skin\)/);
  assert.match(page, /controller--classic/);
  const training = fs.readFileSync(new URL('../pages/Training.tsx', import.meta.url), 'utf8');
  assert.match(training, /trainingUsesAdvantageSkin\(skin\)/);
  assert.doesNotMatch(training, /controller--classic/);
  const css = fs.readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.controller\.controller--classic\s*\{[^}]*background:\s*#050505/);
  assert.match(css, /\.controller\.controller--classic\s*\{[^}]*background-image:\s*none/);
  assert.match(css, /\.controller\.controller--classic\.controller--break\s*\{[^}]*background:\s*#120e08/);
});

test('a custom timer skin stays stored and paints for Media and above and for paid White', () => {
  const id = customSkinValue('skinabc12345');
  assert.ok(id);
  setTrainingSkin(id);
  assert.equal(getTrainingSkin(), id);
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), id);
  assert.equal(visibleTrainingSkin(id, true, false), id);
  assert.equal(visibleTrainingSkin(id, false, false), 'classic');
  assert.equal(visibleTrainingSkin(id, false, true), id);
  setTrainingSkin('classic');
});

test('New White round timer skins persist, map Work/Break CSS, and expose mode helpers', () => {
  for (const id of [
    'CLEAN_MAT_BROADCAST',
    'SPLIT_FLAP_PRO',
    'HIGH_CONTRAST_DAYLIGHT',
    'LED_GYM_WALL',
    'TRUE_FLIP_INTERVAL',
    'WORK_REST_TATAMI',
  ] as const) {
    setTrainingSkin(id);
    assert.equal(getTrainingSkin(), id);
    assert.equal(visibleTrainingSkin(id, false, true), id);
    assert.ok(whiteTimerSurfaceClass(id).startsWith('training--wt-'));
    assert.ok(whiteTimerControllerClass(id).startsWith('controller--wt-'));
  }
  assert.equal(trainingUsesLedClock('LED_GYM_WALL'), true);
  assert.equal(trainingUsesLedClock('WORK_REST_TATAMI'), false);
  assert.equal(trainingUsesTrueFlipCards('TRUE_FLIP_INTERVAL'), true);
  assert.equal(trainingUsesSplitFlap('SPLIT_FLAP_PRO'), true);
  assert.equal(trainingHasProgressBar('LED_GYM_WALL'), true);
  assert.equal(trainingHasProgressBar('WORK_REST_TATAMI'), true);
  assert.equal(trainingHasProgressBar('OLD_SCHOOL'), false);
  const css = fs.readFileSync(new URL('../skins/whiteSkins.css', import.meta.url), 'utf8');
  for (const cls of [
    'training--wt-broadcast.training--break',
    'training--wt-split-flap.training--break',
    'training--wt-daylight.training--break',
    'training--wt-led.training--break',
    'training--wt-true-flip.training--break',
    'training--wt-tatami.training--break',
  ]) {
    assert.match(css, new RegExp(cls.replace(/\./g, '\\.')));
  }
  assert.match(css, /@keyframes wt-led-pulse/);
  assert.match(css, /\.training\.training--wt-led\.training--final-10/);
  assert.match(css, /font-size:\s*clamp\(1\.4rem,\s*3\.2vw,\s*3rem\)/);
  assert.match(css, /\.training\.training--wt-broadcast \.training__clock \{\s*font-size:\s*clamp\(5\.8rem,\s*23vw,\s*21rem\)/);
  assert.match(css, /\.training\.training--wt-daylight \.training__clock \{[^}]*font-size:\s*clamp\(6rem,\s*24vw,\s*21rem\)/);
  assert.match(css, /padding:\s*0\.7rem\s+1\.75rem/);
  const phone = css.slice(css.indexOf('@media (max-width: 480px)'));
  assert.ok(phone.length > 0 && phone.includes('display: none'), 'phone layout hides the timer help text');
  assert.match(phone, /\.training\.training--wt-tatami \.training__hint/);
  assert.match(phone, /\.wt-sf-tile \{\s*width:\s*4\.35rem;/);
  assert.match(phone, /\.wt-led-digit \{\s*width:\s*4\.15rem;/);
  assert.match(phone, /\.wt-tf-slot \{\s*width:\s*4\.25rem;/);
  assert.doesNotMatch(phone, /training--wt-mock|training--wt-old|training--classic/);
  setTrainingSkin('classic');
});

test('Saved keynote timer skin maps to Stage and rewrites the stored slug', () => {
  localStorage.setItem(TRAINING_SKIN_KEY, 'keynote');
  assert.equal(getTrainingSkin(), 'stage');
  assert.equal(localStorage.getItem(TRAINING_SKIN_KEY), 'stage');
});
