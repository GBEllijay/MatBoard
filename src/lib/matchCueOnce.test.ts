import assert from 'node:assert/strict';
import test from 'node:test';
import { endCueAlreadyClaimed, playOnceAcrossTabs } from './matchCueOnce.ts';

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

function serialLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request(_name: string, callback: () => boolean): Promise<boolean> {
      const run = tail.then(() => callback());
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
}

Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage(), configurable: true });
Object.defineProperty(globalThis, 'navigator', {
  value: { locks: serialLocks() },
  configurable: true,
});

test('match end cue plays once when Controller and Display can both hear it', async () => {
  let plays = 0;
  const play = () => {
    plays += 1;
  };
  await Promise.all([
    playOnceAcrossTabs('end:1', () => true, async () => true, play),
    playOnceAcrossTabs('end:1', () => true, async () => true, play),
  ]);
  assert.equal(plays, 1);
  assert.equal(endCueAlreadyClaimed('end:1'), true);
});

test('a locked tab does not steal the cue from a tab that can already play', async () => {
  let plays = 0;
  const play = () => {
    plays += 1;
  };
  await Promise.all([
    playOnceAcrossTabs('end:2', () => true, async () => true, play, 40),
    playOnceAcrossTabs('end:2', () => false, async () => true, play, 40),
  ]);
  assert.equal(plays, 1);
});

test('a lone locked tab still plays after audio resumes', async () => {
  let plays = 0;
  await playOnceAcrossTabs('end:3', () => false, async () => true, () => {
    plays += 1;
  }, 10);
  assert.equal(plays, 1);
});

test('a locked tab that cannot resume does not claim the cue', async () => {
  let plays = 0;
  await playOnceAcrossTabs('end:4', () => false, async () => false, () => {
    plays += 1;
  }, 10);
  assert.equal(plays, 0);
  assert.equal(endCueAlreadyClaimed('end:4'), false);
});

test('the next end-of-match still plays after an earlier claim', async () => {
  let plays = 0;
  const play = () => {
    plays += 1;
  };
  await playOnceAcrossTabs('end:5', () => true, async () => true, play);
  await playOnceAcrossTabs('end:6', () => true, async () => true, play);
  assert.equal(plays, 2);
});

test('two locked tabs that both resume still play a single copy', async () => {
  let plays = 0;
  const play = () => {
    plays += 1;
  };
  await Promise.all([
    playOnceAcrossTabs('end:7', () => false, async () => true, play, 15),
    playOnceAcrossTabs('end:7', () => false, async () => true, play, 15),
  ]);
  assert.equal(plays, 1);
});
