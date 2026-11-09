/**
 * Leaving the round timer used to keep the in-memory clock running.
 * Coming back called tickTraining immediately, and if the round had
 * already hit zero while the screen was gone it played the end buzzer
 * and started the next period.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { Window } from 'happy-dom';

const dom = new Window({ url: 'http://localhost/training', width: 1280, height: 720 });
const view = dom as unknown as Window & typeof globalThis;

function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}

installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('navigator', view.navigator);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const vibes: number[][] = [];
view.navigator.vibrate = (pattern: number | number[]) => {
  vibes.push(typeof pattern === 'number' ? [pattern] : [...pattern]);
  return true;
};

// The hook's interval must not fire on its own during these tests.
// The mount tick still runs synchronously inside useInterval.
view.setInterval = (() => 1) as typeof view.setInterval;
view.clearInterval = (() => {}) as typeof view.clearInterval;

const WORK_MS = 60_000;
const START_VIBE = [18, 30, 18];
const END_VIBE = [220, 80, 220, 80, 320];

let now = 1_700_000_000_000;
const realNow = Date.now;
Date.now = () => now;

const store = await import('./trainingStore.ts');
const audio = await import('./audio.ts');
const { createElement, StrictMode, act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { useTrainingClock } = await import('../hooks/useTrainingClock.ts');

function vibeCount(pattern: number[]): number {
  const key = pattern.join(',');
  return vibes.filter((row) => row.join(',') === key).length;
}

function configure() {
  if (store.getTraining().running) store.pauseTrainingClock();
  store.resetTrainingSession();
  store.setWorkMs(WORK_MS);
  store.setBreakMs(15_000);
  store.setRounds(4, false);
  store.setStartSound(true);
  store.setWarningSound(true);
  store.setEndSound(true);
  audio.patchAudioPrefs({ vibrate: true, muted: false, endCue: 'buzzer', startCue: 'combate' });
  vibes.length = 0;
}

function Probe() {
  useTrainingClock();
  return createElement('span');
}

function Host({ mode }: { mode: 'a' | 'b' | 'none' }) {
  if (mode === 'none') return createElement('div');
  return createElement(Probe, { key: mode });
}

function mount(node: ReturnType<typeof createElement>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(node);
  });
  return {
    rerender(next: ReturnType<typeof createElement>) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      host.remove();
    },
  };
}

/** Let the leave-pause microtask run after the screen unmounts. */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));
  });
}

describe('round timer leave', { concurrency: 1 }, () => {
test('a live tick at zero still ends the round and plays the end cue', () => {
  configure();
  const t0 = 1_700_000_100_000;
  now = t0;
  store.toggleTrainingClock();
  assert.equal(vibeCount(START_VIBE), 1);
  assert.equal(store.getTraining().running, true);
  now = t0 + WORK_MS;
  store.tickTraining();
  const next = store.getTraining();
  assert.equal(next.phase, 'break');
  assert.equal(next.currentRound, 1);
  assert.equal(next.running, true);
  assert.equal(next.remainingMs, 15_000);
  assert.equal(vibeCount(END_VIBE), 1);
  store.pauseTrainingClock();
});

test('leaving mid-round freezes the clock so coming back does not buzz or auto-advance', async () => {
  configure();
  const t0 = 1_700_000_200_000;
  now = t0;
  const screen = mount(createElement(Probe));
  try {
    store.toggleTrainingClock();
    assert.equal(vibeCount(START_VIBE), 1);
    now = t0 + 5_000;
    store.tickTraining();
    assert.equal(store.getTraining().running, true);
    assert.equal(store.getTraining().phase, 'work');
    assert.equal(vibeCount(END_VIBE), 0);

    screen.unmount();
    await settle();

    const frozen = store.getTraining();
    assert.equal(frozen.running, false);
    assert.equal(frozen.startedAt, null);
    assert.equal(frozen.remainingMs, WORK_MS - 5_000);
    assert.equal(frozen.phase, 'work');
    assert.equal(frozen.currentRound, 1);
    assert.equal(vibeCount(END_VIBE), 0);
    assert.equal(vibeCount(START_VIBE), 1);

    // Away, with no ticks, until the round would have finished.
    now = t0 + WORK_MS + 30_000;
    const returned = mount(createElement(Probe));
    try {
      await settle();
      const back = store.getTraining();
      assert.equal(back.running, false);
      assert.equal(back.startedAt, null);
      assert.equal(back.remainingMs, WORK_MS - 5_000);
      assert.equal(back.phase, 'work');
      assert.equal(back.currentRound, 1);
      assert.equal(vibeCount(END_VIBE), 0);
      assert.equal(vibeCount(START_VIBE), 1);

      store.tickTraining();
      assert.equal(store.getTraining().remainingMs, WORK_MS - 5_000);
      assert.equal(store.getTraining().running, false);
      assert.equal(vibeCount(END_VIBE), 0);

      store.toggleTrainingClock();
      assert.equal(store.getTraining().running, true);
      assert.equal(vibeCount(START_VIBE), 2);
      const startedAt = store.getTraining().startedAt ?? now;
      now = startedAt + (store.getTraining().remainingMs);
      store.tickTraining();
      assert.equal(store.getTraining().phase, 'break');
      assert.equal(store.getTraining().running, true);
      assert.equal(vibeCount(END_VIBE), 1);
    } finally {
      returned.unmount();
      await settle();
    }
  } finally {
    if (store.getTraining().running) store.pauseTrainingClock();
  }
});

test('a tick after time ran out while no screen was mounted does not buzz or advance', async () => {
  configure();
  const t0 = 1_700_000_300_000;
  now = t0;
  store.toggleTrainingClock();
  assert.equal(vibeCount(START_VIBE), 1);
  store.tickTraining();
  now = t0 + WORK_MS + 15_000;
  const screen = mount(createElement(Probe));
  try {
    await settle();
    store.tickTraining();
    const back = store.getTraining();
    assert.equal(back.running, false);
    assert.equal(back.phase, 'work');
    assert.equal(back.currentRound, 1);
    assert.equal(back.startedAt, null);
    assert.equal(back.remainingMs, 0);
    assert.equal(vibeCount(END_VIBE), 0);
    assert.equal(vibeCount(START_VIBE), 1);
  } finally {
    screen.unmount();
    await settle();
  }
});

test('switching rounds screens keeps the clock running and leaving both pauses it', async () => {
  configure();
  const t0 = 1_700_000_400_000;
  now = t0;
  const screen = mount(createElement(Host, { mode: 'a' }));
  try {
    store.toggleTrainingClock();
    now = t0 + 4_000;
    store.tickTraining();
    screen.rerender(createElement(Host, { mode: 'b' }));
    await settle();
    const mid = store.getTraining();
    assert.equal(mid.running, true);
    assert.equal(mid.startedAt, t0);
    assert.equal(mid.phase, 'work');
    assert.equal(mid.currentRound, 1);
    assert.equal(store.remainingTraining(mid), WORK_MS - 4_000);
    assert.equal(vibeCount(END_VIBE), 0);

    now = t0 + 9_000;
    screen.rerender(createElement(Host, { mode: 'none' }));
    await settle();
    const left = store.getTraining();
    assert.equal(left.running, false);
    assert.equal(left.startedAt, null);
    assert.equal(left.remainingMs, WORK_MS - 9_000);
    assert.equal(left.phase, 'work');
    assert.equal(vibeCount(END_VIBE), 0);
    assert.equal(vibeCount(START_VIBE), 1);
  } finally {
    screen.unmount();
    await settle();
    if (store.getTraining().running) store.pauseTrainingClock();
  }
});

test('strict mode remounting the rounds screen does not pause a running clock', async () => {
  configure();
  const t0 = 1_700_000_500_000;
  now = t0;
  store.toggleTrainingClock();
  const screen = mount(createElement(StrictMode, null, createElement(Probe)));
  try {
    await settle();
    const mid = store.getTraining();
    assert.equal(mid.running, true);
    assert.equal(mid.phase, 'work');
    assert.equal(mid.remainingMs, WORK_MS);
    assert.equal(vibeCount(END_VIBE), 0);
  } finally {
    screen.unmount();
    await settle();
    if (store.getTraining().running) store.pauseTrainingClock();
  }
});

test('the rounds display and the controller both use the shared clock', () => {
  const display = readFileSync(new URL('../pages/Training.tsx', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../pages/TrainingController.tsx', import.meta.url), 'utf8');
  const hook = readFileSync(new URL('../hooks/useTrainingClock.ts', import.meta.url), 'utf8');
  assert.match(display, /useTrainingClock\(\)/);
  assert.match(controller, /useTrainingClock\(\)/);
  assert.match(hook, /attachTrainingScreen\(\)/);
  assert.match(hook, /tickTraining\(\)/);
});

test.after(() => {
  Date.now = realNow;
});
});
