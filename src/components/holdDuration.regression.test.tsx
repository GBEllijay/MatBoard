/**
 * Round timer holds. A press under 3 seconds does not reset and does not start or pause.
 * Holding the round indicator resets the session. Holding the clock restores the period.
 * A short tap still runs the control's existing action.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { HoldButton } from './HoldButton.tsx';
import { HOLD_VIBRATE_MS, holdOutcome } from '../lib/holdDuration.ts';
import type { HoldClock } from '../hooks/useTimedHold.ts';
import {
  getTraining,
  resetTrainingPeriod,
  resetTrainingSession,
  setBreakMs,
  setEndSound,
  setRounds,
  setStartSound,
  setWarningSound,
  setWorkMs,
  tickTraining,
  toggleTrainingClock,
} from '../lib/trainingStore.ts';

const dom = new Window({ url: 'http://localhost/training', width: 390, height: 844 });
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
installGlobal('HTMLButtonElement', view.HTMLButtonElement);
installGlobal('Element', view.Element);
installGlobal('Node', view.Node);
installGlobal('Event', view.Event);
installGlobal('MouseEvent', view.MouseEvent);
installGlobal('PointerEvent', view.PointerEvent);
installGlobal('KeyboardEvent', view.KeyboardEvent);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);

const vibes: Array<number | number[]> = [];
view.navigator.vibrate = (pattern: number | number[]) => {
  vibes.push(pattern);
  return true;
};

function setReduced(on: boolean) {
  view.matchMedia = ((query: string) => ({
    matches: on && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
    onchange: null,
  })) as typeof view.matchMedia;
  installGlobal('matchMedia', view.matchMedia);
}
setReduced(false);

function makeClock() {
  let now = 0;
  let seq = 1;
  const tasks = new Map<number, { at: number; fn: () => void }>();
  const clock: HoldClock = {
    now: () => now,
    schedule(fn, ms) {
      const id = seq++;
      tasks.set(id, { at: now + ms, fn });
      return id;
    },
    cancel(id) {
      tasks.delete(id);
    },
  };
  function advance(ms: number) {
    const end = now + ms;
    for (;;) {
      let nextId: number | null = null;
      let nextAt = Infinity;
      for (const [id, task] of tasks) {
        if (task.at <= end && (task.at < nextAt || (task.at === nextAt && (nextId == null || id < nextId)))) {
          nextId = id;
          nextAt = task.at;
        }
      }
      if (nextId == null) break;
      const task = tasks.get(nextId)!;
      tasks.delete(nextId);
      now = task.at;
      act(() => {
        task.fn();
      });
    }
    now = end;
  }
  return { clock, advance };
}

function configure() {
  resetTrainingSession();
  setWorkMs(7 * 60_000);
  setBreakMs(20_000);
  setRounds(8, false);
  setStartSound(false);
  setWarningSound(false);
  setEndSound(false);
}

function toRoundTwoPaused() {
  configure();
  const real = Date.now;
  try {
    const t0 = 1_700_000_300_000;
    Date.now = () => t0;
    toggleTrainingClock();
    Date.now = () => t0 + 7 * 60_000;
    tickTraining();
    Date.now = () => t0 + 7 * 60_000 + 20_000;
    tickTraining();
    Date.now = () => t0 + 7 * 60_000 + 20_000 + 9_000;
    toggleTrainingClock();
  } finally {
    Date.now = real;
  }
  const mid = getTraining();
  assert.equal(mid.currentRound, 2);
  assert.equal(mid.phase, 'work');
  assert.equal(mid.running, false);
  assert.equal(mid.remainingMs, 7 * 60_000 - 9_000);
}

type Mounted = { root: Root; host: HTMLElement; taps: { round: number; clock: number } };

function mount(clock: HoldClock): Mounted {
  const taps = { round: 0, clock: 0 };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => {
    root.render(
      <>
        <HoldButton
          className="training__phase"
          dataHold="round"
          clock={clock}
          onTap={() => {
            taps.round += 1;
          }}
          onComplete={() => resetTrainingSession()}
        >
          Round 2
        </HoldButton>
        <HoldButton
          className="training__clock"
          dataHold="timer"
          clock={clock}
          onTap={() => {
            taps.clock += 1;
            toggleTrainingClock();
          }}
          onComplete={() => resetTrainingPeriod()}
        >
          05:00
        </HoldButton>
      </>,
    );
  });
  return { root, host, taps };
}

function unmount(mounted: Mounted) {
  act(() => mounted.root.unmount());
  mounted.host.remove();
}

function button(host: ParentNode, hold: 'round' | 'timer'): HTMLButtonElement {
  const found = host.querySelector(`[data-hold="${hold}"]`);
  assert.ok(found instanceof HTMLButtonElement, hold);
  return found;
}

function pointer(target: Element, type: string, pointerType: 'touch' | 'mouse') {
  act(() => {
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        pointerId: 1,
        pointerType,
        isPrimary: true,
      }),
    );
  });
}

function click(target: Element) {
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
}

function key(target: Element, type: 'keydown' | 'keyup', keyName: string, repeat = false) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, cancelable: true, key: keyName, repeat }));
  });
}

function ringProgress(host: ParentNode): string | null {
  return host.querySelector('.hold-ring')?.getAttribute('data-progress') ?? null;
}

test('a hold under 3 seconds does nothing on the round indicator and the timer', () => {
  toRoundTwoPaused();
  vibes.length = 0;
  const time = makeClock();
  const mounted = mount(time.clock);
  const before = getTraining();
  try {
    const round = button(mounted.host, 'round');
    pointer(round, 'pointerdown', 'touch');
    time.advance(1500);
    assert.equal(ringProgress(mounted.host), '0.500');
    pointer(round, 'pointerup', 'touch');
    click(round);
    assert.equal(ringProgress(mounted.host), null);
    assert.equal(mounted.taps.round, 0);
    assert.equal(mounted.taps.clock, 0);
    assert.deepEqual(
      {
        round: getTraining().currentRound,
        phase: getTraining().phase,
        remaining: getTraining().remainingMs,
        running: getTraining().running,
        work: getTraining().workMs,
        rest: getTraining().breakMs,
        rounds: getTraining().rounds,
      },
      {
        round: before.currentRound,
        phase: before.phase,
        remaining: before.remainingMs,
        running: before.running,
        work: before.workMs,
        rest: before.breakMs,
        rounds: before.rounds,
      },
    );

    const timer = button(mounted.host, 'timer');
    pointer(timer, 'pointerdown', 'mouse');
    time.advance(2999);
    assert.ok(holdOutcome(2999) === 'cancel');
    pointer(timer, 'pointerup', 'mouse');
    click(timer);
    assert.equal(mounted.taps.clock, 0);
    assert.equal(getTraining().running, false);
    assert.equal(getTraining().currentRound, 2);
    assert.equal(getTraining().remainingMs, before.remainingMs);
    assert.equal(vibes.length, 0);
  } finally {
    unmount(mounted);
  }
});

test('holding the round indicator for 3 seconds resets the session and does not toggle', () => {
  toRoundTwoPaused();
  vibes.length = 0;
  const time = makeClock();
  const mounted = mount(time.clock);
  try {
    const round = button(mounted.host, 'round');
    pointer(round, 'pointerdown', 'touch');
    time.advance(3000);
    assert.equal(ringProgress(mounted.host), '1.000');
    const reset = getTraining();
    assert.equal(reset.currentRound, 1);
    assert.equal(reset.phase, 'work');
    assert.equal(reset.remainingMs, 7 * 60_000);
    assert.equal(reset.running, false);
    assert.equal(reset.workMs, 7 * 60_000);
    assert.equal(reset.breakMs, 20_000);
    assert.equal(reset.rounds, 8);
    pointer(round, 'pointerup', 'touch');
    click(round);
    assert.equal(mounted.taps.round, 0);
    assert.equal(getTraining().running, false);
    assert.equal(getTraining().currentRound, 1);
    assert.deepEqual(vibes, [HOLD_VIBRATE_MS]);
  } finally {
    unmount(mounted);
  }
});

test('holding the timer for 3 seconds restores the configured duration and keeps the round', () => {
  toRoundTwoPaused();
  vibes.length = 0;
  const time = makeClock();
  const mounted = mount(time.clock);
  try {
    const timer = button(mounted.host, 'timer');
    pointer(timer, 'pointerdown', 'mouse');
    time.advance(3000);
    const reset = getTraining();
    assert.equal(reset.currentRound, 2);
    assert.equal(reset.phase, 'work');
    assert.equal(reset.remainingMs, 7 * 60_000);
    assert.notEqual(reset.remainingMs, 0);
    assert.equal(reset.running, false);
    assert.equal(reset.workMs, 7 * 60_000);
    assert.equal(reset.breakMs, 20_000);
    assert.equal(reset.rounds, 8);
    pointer(timer, 'pointerup', 'mouse');
    click(timer);
    assert.equal(mounted.taps.clock, 0);
    assert.equal(getTraining().running, false);
    assert.equal(getTraining().currentRound, 2);
    assert.equal(getTraining().remainingMs, 7 * 60_000);
    assert.deepEqual(vibes, [HOLD_VIBRATE_MS]);
  } finally {
    unmount(mounted);
  }
});

test('a short tap still fires on the round indicator and still starts or pauses the timer', () => {
  toRoundTwoPaused();
  const time = makeClock();
  const mounted = mount(time.clock);
  try {
    const round = button(mounted.host, 'round');
    pointer(round, 'pointerdown', 'touch');
    time.advance(80);
    pointer(round, 'pointerup', 'touch');
    click(round);
    assert.equal(mounted.taps.round, 1);
    assert.equal(getTraining().currentRound, 2);
    assert.equal(getTraining().running, false);

    const timer = button(mounted.host, 'timer');
    pointer(timer, 'pointerdown', 'mouse');
    time.advance(120);
    pointer(timer, 'pointerup', 'mouse');
    click(timer);
    assert.equal(mounted.taps.clock, 1);
    assert.equal(getTraining().running, true);
    assert.equal(getTraining().currentRound, 2);
    assert.equal(getTraining().remainingMs, 7 * 60_000 - 9_000);

    pointer(timer, 'pointerdown', 'mouse');
    time.advance(40);
    pointer(timer, 'pointerup', 'mouse');
    click(timer);
    assert.equal(mounted.taps.clock, 2);
    assert.equal(getTraining().running, false);
    assert.equal(getTraining().currentRound, 2);
  } finally {
    unmount(mounted);
  }
});

test('keyboard hold matches the pointer: Space under 3 seconds cancels, Enter at 3 seconds resets', () => {
  toRoundTwoPaused();
  vibes.length = 0;
  const time = makeClock();
  const mounted = mount(time.clock);
  try {
    const timer = button(mounted.host, 'timer');
    timer.focus();
    key(timer, 'keydown', ' ');
    time.advance(1000);
    key(timer, 'keydown', ' ', true);
    time.advance(1500);
    key(timer, 'keyup', ' ');
    click(timer);
    assert.equal(mounted.taps.clock, 0);
    assert.equal(getTraining().currentRound, 2);
    assert.equal(getTraining().remainingMs, 7 * 60_000 - 9_000);
    assert.equal(vibes.length, 0);

    const round = button(mounted.host, 'round');
    round.focus();
    key(round, 'keydown', 'Enter');
    time.advance(3000);
    assert.equal(getTraining().currentRound, 1);
    assert.equal(getTraining().remainingMs, 7 * 60_000);
    assert.equal(getTraining().running, false);
    key(round, 'keyup', 'Enter');
    click(round);
    assert.equal(mounted.taps.round, 0);
    assert.equal(getTraining().currentRound, 1);
  } finally {
    unmount(mounted);
  }
});

test('reduced motion steps the hold ring instead of sweeping it', () => {
  setReduced(true);
  configure();
  const time = makeClock();
  const mounted = mount(time.clock);
  try {
    const timer = button(mounted.host, 'timer');
    pointer(timer, 'pointerdown', 'touch');
    time.advance(749);
    assert.equal(ringProgress(mounted.host), '0.000');
    time.advance(1);
    assert.equal(ringProgress(mounted.host), '0.250');
    time.advance(750);
    assert.equal(ringProgress(mounted.host), '0.500');
    pointer(timer, 'pointerup', 'touch');
    click(timer);
    assert.equal(getTraining().currentRound, 1);
    assert.equal(getTraining().remainingMs, 7 * 60_000);
    assert.equal(mounted.taps.clock, 0);
  } finally {
    setReduced(false);
    unmount(mounted);
  }
});
