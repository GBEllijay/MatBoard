import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HOLD_MS, HOLD_TAP_MS, HOLD_VIBRATE_MS, holdOutcome, holdProgress, steppedHoldProgress } from './holdDuration.ts';

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

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('hold timing: a short press is a tap, under 3 seconds cancels, 3 seconds completes', () => {
  assert.equal(HOLD_MS, 3000);
  assert.equal(holdProgress(0), 0);
  assert.equal(holdProgress(1500), 0.5);
  assert.equal(holdProgress(HOLD_MS), 1);
  assert.equal(holdProgress(HOLD_MS + 50), 1);
  assert.equal(holdOutcome(HOLD_TAP_MS), 'tap');
  assert.equal(holdOutcome(HOLD_TAP_MS + 1), 'cancel');
  assert.equal(holdOutcome(2999), 'cancel');
  assert.equal(holdOutcome(3000), 'complete');
  assert.equal(steppedHoldProgress(0.2), 0);
  assert.equal(steppedHoldProgress(0.25), 0.25);
  assert.equal(steppedHoldProgress(0.9), 0.75);
  assert.equal(steppedHoldProgress(1), 1);
});

const store = await import('./trainingStore.ts');

function silence() {
  store.setStartSound(false);
  store.setWarningSound(false);
  store.setEndSound(false);
}

function configure() {
  store.resetTrainingSession();
  store.setWorkMs(7 * 60_000);
  store.setBreakMs(15_000);
  store.setRounds(8, false);
  silence();
  const next = store.getTraining();
  assert.equal(next.workMs, 7 * 60_000);
  assert.equal(next.breakMs, 15_000);
  assert.equal(next.rounds, 8);
  assert.equal(next.currentRound, 1);
  assert.equal(next.phase, 'work');
}

test('timer hold restores the configured period, not zero, and keeps the round', () => {
  configure();
  const real = Date.now;
  try {
    const t0 = 1_700_000_000_000;
    Date.now = () => t0;
    store.toggleTrainingClock();
    Date.now = () => t0 + 12_000;
    store.toggleTrainingClock();
  } finally {
    Date.now = real;
  }
  const paused = store.getTraining();
  assert.equal(paused.running, false);
  assert.equal(paused.remainingMs, 7 * 60_000 - 12_000);
  assert.equal(paused.currentRound, 1);
  assert.equal(paused.phase, 'work');

  store.resetTrainingPeriod();
  const reset = store.getTraining();
  assert.equal(reset.remainingMs, 7 * 60_000);
  assert.notEqual(reset.remainingMs, 0);
  assert.equal(reset.running, false);
  assert.equal(reset.startedAt, null);
  assert.equal(reset.phase, 'work');
  assert.equal(reset.currentRound, 1);
  assert.equal(reset.workMs, 7 * 60_000);
  assert.equal(reset.breakMs, 15_000);
  assert.equal(reset.rounds, 8);
  assert.equal(reset.endless, false);
  assert.equal(reset.startSound, false);

  const real2 = Date.now;
  try {
    const t0 = 1_700_000_100_000;
    Date.now = () => t0;
    store.toggleTrainingClock();
    Date.now = () => t0 + 7 * 60_000;
    store.tickTraining();
    const onBreak = store.getTraining();
    assert.equal(onBreak.phase, 'break');
    assert.equal(onBreak.currentRound, 1);
    assert.equal(onBreak.running, true);
    Date.now = () => t0 + 7 * 60_000 + 4_000;
    store.toggleTrainingClock();
  } finally {
    Date.now = real2;
  }
  assert.equal(store.getTraining().remainingMs, 11_000);
  store.resetTrainingPeriod();
  const rest = store.getTraining();
  assert.equal(rest.phase, 'break');
  assert.equal(rest.currentRound, 1);
  assert.equal(rest.remainingMs, 15_000);
  assert.notEqual(rest.remainingMs, 0);
  assert.equal(rest.running, false);
  assert.equal(rest.workMs, 7 * 60_000);
  assert.equal(rest.rounds, 8);
});

test('round hold resets the session and keeps length, rest, and rounds', () => {
  configure();
  const real = Date.now;
  try {
    const t0 = 1_700_000_200_000;
    Date.now = () => t0;
    store.toggleTrainingClock();
    Date.now = () => t0 + 7 * 60_000;
    store.tickTraining();
    Date.now = () => t0 + 7 * 60_000 + 15_000;
    store.tickTraining();
    Date.now = () => t0 + 7 * 60_000 + 15_000 + 9_000;
    store.toggleTrainingClock();
  } finally {
    Date.now = real;
  }
  const mid = store.getTraining();
  assert.equal(mid.currentRound, 2);
  assert.equal(mid.phase, 'work');
  assert.equal(mid.running, false);
  assert.equal(mid.remainingMs, 7 * 60_000 - 9_000);

  store.resetTrainingSession();
  const reset = store.getTraining();
  assert.equal(reset.currentRound, 1);
  assert.equal(reset.phase, 'work');
  assert.equal(reset.remainingMs, 7 * 60_000);
  assert.equal(reset.running, false);
  assert.equal(reset.startedAt, null);
  assert.equal(reset.workMs, 7 * 60_000);
  assert.equal(reset.breakMs, 15_000);
  assert.equal(reset.rounds, 8);
  assert.equal(reset.endless, false);
  assert.equal(reset.startSound, false);
  assert.equal(reset.warningSound, false);
  assert.equal(reset.endSound, false);
});

test('round and timer holds are on the display, the polished timer, and the controller', () => {
  const page = read('../pages/Training.tsx');
  const polished = read('../components/PolishedTimer.tsx');
  const controller = read('../pages/TrainingController.tsx');
  const options = read('../components/TrainingOptions.tsx');
  const css = read('../index.css');
  const score = read('../components/ScoreBox.tsx');
  const board = read('../components/PolishedScoreboard.tsx');

  assert.match(page, /dataHold="round"/);
  assert.match(page, /onTap=\{onRoundLabel\}/);
  assert.match(page, /onComplete=\{\(\) => resetTrainingSession\(\)\}/);
  assert.match(page, /dataHold="timer"/);
  assert.match(page, /onTap=\{onClock\}/);
  assert.match(page, /onComplete=\{\(\) => resetTrainingPeriod\(\)\}/);
  assert.match(page, /onPhaseHold=\{\(\) => resetTrainingSession\(\)\}/);
  assert.match(page, /onClockHold=\{\(\) => resetTrainingPeriod\(\)\}/);
  assert.match(page, /wantsRoundsFullscreen/);

  assert.match(polished, /dataHold="round"/);
  assert.match(polished, /onComplete=\{onPhaseHold\}/);
  assert.match(polished, /dataHold="timer"/);
  assert.match(polished, /onComplete=\{onClockHold\}/);
  assert.match(polished, /onTap=\{onPhase\}/);
  assert.match(polished, /onTap=\{onClock\}/);

  assert.match(controller, /dataHold="round"/);
  assert.match(controller, /onComplete=\{\(\) => resetTrainingSession\(\)\}/);
  assert.match(controller, /className="clock-btn clock-btn--control"/);
  assert.match(controller, /onTap=\{\(\) => toggleClock\(\)\}/);
  assert.match(controller, /onComplete=\{\(\) => resetTrainingPeriod\(\)\}/);
  assert.match(controller, /className="btn" onClick=\{toggleClock\}/);
  assert.match(controller, /<TrainingOptions \/>/);

  assert.match(options, /onClick=\{\(\) => \{\s*resetTrainingSession\(\);\s*onReset\?\.\(\);\s*\}\}/);
  assert.doesNotMatch(options, /HoldButton|useTimedHold|resetTrainingPeriod/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.hold-ring/s);
  assert.match(css, /stroke: var\(--gold-2\)/);
  assert.match(css, /transform-box:\s*view-box/);
  assert.doesNotMatch(css, /transform-box:\s*fill-box/);
  assert.match(polished, /disc hold-ring-host/);
  assert.match(polished, /globe-wrap hold-ring-host/);
  assert.match(polished, /clockBtn\(digits, 'digits', undefined, ringHostRef\)/);
  assert.equal(HOLD_VIBRATE_MS > 0 && HOLD_VIBRATE_MS <= 30, true);

  assert.doesNotMatch(score, /HoldButton|resetTrainingPeriod|resetTrainingSession/);
  assert.doesNotMatch(board, /HoldButton|resetTrainingPeriod|resetTrainingSession/);
});
