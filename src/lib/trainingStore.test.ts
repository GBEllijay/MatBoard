import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
    clear: () => {
      store.clear();
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', {
  value: memoryStorage(),
  configurable: true,
});

const {
  defaultTraining,
  getTraining,
  normalizeStoredTraining,
  setEndSound,
  setStartSound,
  setWarningSound,
  tickTraining,
} = await import('./trainingStore.ts');

test('round timer start and warning sounds default on', () => {
  const fresh = defaultTraining();
  assert.equal(fresh.startSound, true);
  assert.equal(fresh.warningSound, true);
  assert.equal(fresh.endSound, true);
  assert.equal(fresh.warned, false);
});

test('older round timer saves load with start and warning sounds on', () => {
  const legacy = normalizeStoredTraining({
    workMs: 60_000,
    breakMs: 30_000,
    endSound: false,
    warned: true,
  });
  assert.equal(legacy.startSound, true);
  assert.equal(legacy.warningSound, true);
  assert.equal(legacy.endSound, false);
  assert.equal(legacy.warned, true);
  assert.equal(legacy.running, false);

  const off = normalizeStoredTraining({ startSound: false, warningSound: false, endSound: true });
  assert.equal(off.startSound, false);
  assert.equal(off.warningSound, false);
  assert.equal(off.endSound, true);
  assert.equal(normalizeStoredTraining(null).startSound, true);
});

test('start and warning switches persist without clearing the warned flag', () => {
  setWarningSound(false);
  setStartSound(false);
  assert.equal(getTraining().startSound, false);
  assert.equal(getTraining().warningSound, false);
  const stored = JSON.parse(localStorage.getItem('matboard.training.v1') ?? '{}') as {
    startSound?: boolean;
    warningSound?: boolean;
    warned?: boolean;
  };
  assert.equal(stored.startSound, false);
  assert.equal(stored.warningSound, false);
  const warned = normalizeStoredTraining({ ...getTraining(), warned: true });
  assert.equal(warned.warned, true);
  assert.equal(warned.warningSound, false);
  setStartSound(true);
  setWarningSound(true);
  setEndSound(true);
  assert.equal(getTraining().startSound, true);
  assert.equal(getTraining().warningSound, true);
});

test('warning ticks still mark warned, and cues follow the switches', () => {
  const store = readFileSync(new URL('./trainingStore.ts', import.meta.url), 'utf8');
  assert.match(
    store,
    /function playTrainStartCue\(\): void \{\s*if \(!state\.startSound\) return;\s*playStartCue\(\);/s,
  );
  assert.match(store, /if \(warningSound\) playWarningCue\(\)/);
  assert.match(store, /persist\(\{ \.\.\.state, warned: true \}\)/);
  const options = readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
  const soundAt = options.indexOf('<legend>Sound</legend>');
  const endAt = options.indexOf('Training end sound');
  const startAt = options.indexOf('Start sound');
  const warnAt = options.indexOf('10-second warning');
  assert.ok(soundAt >= 0 && startAt > soundAt && warnAt > startAt && endAt > warnAt);
  assert.match(options, /disabled=\{!training\.startSound\}/);
  assert.match(options, /disabled=\{!training\.warningSound\}/);
  assert.match(options, /disabled=\{!training\.endSound\}/);
  const before = getTraining().warned;
  tickTraining();
  assert.equal(getTraining().warned, before);
});
