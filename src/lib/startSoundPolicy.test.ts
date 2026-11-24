import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isFirstStart,
  matchStartCueChoice,
  parseStartSoundWhen,
  startSoundKind,
} from './startSoundPolicy.ts';

test('the default start-sound mode is first start only (Round Start Only on)', () => {
  assert.equal(parseStartSoundWhen(undefined), 'first');
  assert.equal(parseStartSoundWhen('first'), 'first');
  assert.equal(parseStartSoundWhen('every'), 'every');
  assert.equal(parseStartSoundWhen('nope'), 'first');
});

test('first start is a full clock, a reset, or a restart from 0:00', () => {
  assert.equal(isFirstStart(300_000, 300_000), true);
  assert.equal(isFirstStart(0, 300_000), true);
  assert.equal(isFirstStart(-1, 300_000), true);
  assert.equal(isFirstStart(299_000, 300_000), false);
  assert.equal(isFirstStart(120_000, 300_000), false);
});

test('migration: old Start beep off is None; on keeps the saved Beep or Combate cue', () => {
  assert.equal(matchStartCueChoice(false, 'combate'), 'none');
  assert.equal(matchStartCueChoice(false, 'beep'), 'none');
  assert.equal(matchStartCueChoice(true, 'combate'), 'combate');
  assert.equal(matchStartCueChoice(true, 'beep'), 'beep');
});

test('Round Start Only on: chosen cue at full time, low resume beep after a pause', () => {
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'first', firstStart: true }),
    'combate',
  );
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'first', firstStart: false }),
    'resume',
  );
  assert.equal(
    startSoundKind({ startCue: 'beep', when: 'first', firstStart: true }),
    'beep',
  );
  assert.equal(
    startSoundKind({ startCue: 'beep', when: 'first', firstStart: false }),
    'resume',
  );
});

test('Round Start Only off: chosen cue on the first start and on every later resume', () => {
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'every', firstStart: true }),
    'combate',
  );
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'every', firstStart: false }),
    'combate',
  );
  assert.equal(
    startSoundKind({ startCue: 'beep', when: 'every', firstStart: true }),
    'beep',
  );
  assert.equal(
    startSoundKind({ startCue: 'beep', when: 'every', firstStart: false }),
    'beep',
  );
});

test('rest and break periods never say Combate; they use a beep or the low resume beep', () => {
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'first', firstStart: true, rest: true }),
    'beep',
  );
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'first', firstStart: false, rest: true }),
    'resume',
  );
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'every', firstStart: true, rest: true }),
    'beep',
  );
  assert.equal(
    startSoundKind({ startCue: 'combate', when: 'every', firstStart: false, rest: true }),
    'beep',
  );
  assert.equal(
    startSoundKind({ startCue: 'beep', when: 'first', firstStart: true, rest: true }),
    'beep',
  );
});

test('a disabled start sound (old Start beep off / None) plays nothing', () => {
  assert.equal(
    startSoundKind({
      startCue: 'combate',
      when: 'first',
      firstStart: true,
      enabled: false,
    }),
    'none',
  );
  assert.equal(
    startSoundKind({
      startCue: 'beep',
      when: 'every',
      firstStart: false,
      enabled: false,
    }),
    'none',
  );
});
