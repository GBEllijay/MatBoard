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
  applyRemoteTraining,
  defaultTraining,
  getTraining,
  normalizeStoredTraining,
  remainingTraining,
  resetTrainingPeriod,
  resetTrainingSession,
  setBreakMs,
  setEndSound,
  setStartSound,
  setWarningSound,
  setWorkMs,
  toggleTrainingClock,
  trainingClockActionLabel,
} = await import('./trainingStore.ts');

const STORAGE_KEY = 'matboard.training.v1';

function silenceSounds() {
  setStartSound(false);
  setWarningSound(false);
  setEndSound(false);
}

function readStored() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as {
    running?: boolean;
    startedAt?: number | null;
    remainingMs?: number;
    revision?: number;
  };
}

test('a saved running clock keeps startedAt, so a TV reload can keep counting', () => {
  const startedAt = 1_700_000_000_000;
  const live = normalizeStoredTraining({
    workMs: 5 * 60_000,
    remainingMs: 5 * 60_000,
    running: true,
    startedAt,
    revision: 4,
  });
  assert.equal(live.running, true);
  assert.equal(live.startedAt, startedAt);
  assert.equal(live.revision, 4);
  assert.equal(remainingTraining(live, startedAt + 67_000), 5 * 60_000 - 67_000);

  const legacy = normalizeStoredTraining({ workMs: 60_000 });
  assert.equal(legacy.running, false);
  assert.equal(legacy.startedAt, null);
  assert.equal(legacy.revision, 0);
});

test('starting the clock writes running and startedAt so another tab can follow', () => {
  silenceSounds();
  resetTrainingSession();
  setWorkMs(5 * 60_000);
  setBreakMs(30_000);
  const before = Date.now();
  toggleTrainingClock();
  const live = getTraining();
  assert.equal(live.running, true);
  assert.ok(typeof live.startedAt === 'number' && live.startedAt >= before);
  const stored = readStored();
  assert.equal(stored.running, true);
  assert.equal(stored.startedAt, live.startedAt);
  assert.equal(stored.remainingMs, 5 * 60_000);
  assert.ok((stored.revision ?? 0) >= 1);
  toggleTrainingClock();
  assert.equal(getTraining().running, false);
  assert.equal(readStored().running, false);
});

test('a later remote snapshot updates the local clock, and an older revision is ignored', () => {
  silenceSounds();
  resetTrainingSession();
  setWorkMs(5 * 60_000);
  const startedAt = Date.now() - 70_000;
  applyRemoteTraining({
    ...defaultTraining(),
    workMs: 5 * 60_000,
    remainingMs: 5 * 60_000,
    running: true,
    startedAt,
    revision: 50,
    startSound: false,
    warningSound: false,
    endSound: false,
  });
  const followed = getTraining();
  assert.equal(followed.running, true);
  assert.equal(followed.startedAt, startedAt);
  assert.equal(followed.revision, 50);
  assert.ok(remainingTraining(followed, startedAt + 70_000) <= 5 * 60_000 - 69_000);

  applyRemoteTraining({
    ...followed,
    running: false,
    startedAt: null,
    remainingMs: 10_000,
    revision: 49,
  });
  assert.equal(getTraining().running, true);
  assert.equal(getTraining().startedAt, startedAt);
  assert.equal(getTraining().revision, 50);
});

test('the start button says Start, Resume, Restart, or Pause from the shared clock', () => {
  const fresh = defaultTraining();
  assert.equal(trainingClockActionLabel(fresh), 'Start');
  assert.equal(trainingClockActionLabel({ ...fresh, remainingMs: 0 }), 'Restart');
  assert.equal(
    trainingClockActionLabel({ ...fresh, remainingMs: fresh.workMs - 15_000 }),
    'Resume',
  );
  assert.equal(
    trainingClockActionLabel({ ...fresh, running: true, startedAt: Date.now() }),
    'Pause',
  );
});

test('the training store and main bootstrap follow the scoreboard sync path', () => {
  const store = readFileSync(new URL('./trainingStore.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');
  assert.match(store, /const CHANNEL_NAME = 'matboard-training-v1'/);
  assert.match(store, /new BroadcastChannel\(CHANNEL_NAME\)/);
  assert.match(store, /window\.addEventListener\('storage'/);
  assert.match(store, /export function applyRemoteTraining/);
  assert.match(store, /export function initTrainingSync/);
  assert.match(store, /JSON\.stringify\(stamped\)/);
  assert.doesNotMatch(store, /running: false, startedAt: null \}/);
  assert.match(main, /import \{ initTrainingSync \} from '\.\/lib\/trainingStore'/);
  assert.match(main, /initTrainingSync\(\)/);
});

test('Reset clock persists the full period so the TV follows the same snapshot', () => {
  silenceSounds();
  resetTrainingSession();
  setWorkMs(5 * 60_000);
  setBreakMs(30_000);
  const before = Date.now();
  toggleTrainingClock();
  const started = getTraining();
  assert.equal(started.running, true);
  const revision = started.revision;
  resetTrainingPeriod();
  const reset = getTraining();
  assert.equal(reset.running, false);
  assert.equal(reset.startedAt, null);
  assert.equal(reset.remainingMs, 5 * 60_000);
  assert.equal(reset.currentRound, 1);
  assert.ok(reset.revision > revision);
  const stored = readStored();
  assert.equal(stored.running, false);
  assert.equal(stored.remainingMs, 5 * 60_000);
  assert.equal(stored.revision, reset.revision);
  assert.ok(before <= (started.startedAt ?? 0));
});
