import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matchStore = readFileSync(new URL('./matchStore.ts', import.meta.url), 'utf8');
const trainingStore = readFileSync(new URL('./trainingStore.ts', import.meta.url), 'utf8');
const board = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
const timer = readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
const shared = readFileSync(new URL('../components/StartSoundWhenControls.tsx', import.meta.url), 'utf8');

test('scoreboard and round timer share the same Combate-when toggle', () => {
  assert.match(shared, /patchAudioPrefs\(\{ startSoundWhen: option\.id \}\)/);
  assert.match(shared, /First start only/);
  assert.match(shared, /Every start/);
  assert.doesNotMatch(shared, /import .*(entitle|edition|unlock|tier)|useEdition|whiteBoard|isPro/i);
  assert.match(board, /<StartSoundWhenControls \/>/);
  assert.match(timer, /<StartSoundWhenControls \/>/);
});

test('manual match begin uses the shared first-start policy, not a beep on every start', () => {
  assert.match(
    matchStore,
    /playManualStartSound\(isFirstStart\(next\.remainingMs, next\.durationMs\)\)/,
  );
  assert.doesNotMatch(
    matchStore.slice(matchStore.indexOf('function maybeMatchCues')),
    /playStartCue\(\)/,
  );
});

test('manual round-timer begin uses the same policy; automatic work/rest cues stay as they were', () => {
  assert.match(trainingStore, /playTrainManualStartCue\(firstStart\)/);
  assert.match(
    trainingStore,
    /function playTrainManualStartCue\(firstStart: boolean\): void \{\s*if \(!state\.startSound\) return;\s*playManualStartSound\(firstStart\);/s,
  );
  assert.match(
    trainingStore,
    /function playTrainStartCue\(\): void \{\s*if \(!state\.startSound\) return;\s*playTrainingStart\(\);/s,
  );
  assert.match(trainingStore, /function followWithStartCue\(\): void \{/);
  assert.match(trainingStore, /window\.setTimeout\(\(\) => playTrainingStart\(\), endCueFollowMs\(\)\)/);
  const afterBreak = trainingStore.slice(trainingStore.indexOf('function nextAfterBreak'));
  assert.match(afterBreak, /playTrainStartCue\(\)/);
  const afterWork = trainingStore.slice(
    trainingStore.indexOf('function nextAfterWork'),
    trainingStore.indexOf('function nextAfterBreak'),
  );
  assert.match(afterWork, /playTrainEndCue\(\);\s*followWithStartCue\(\);/s);
  assert.doesNotMatch(afterWork, /playTrainManualStartCue/);
  assert.doesNotMatch(afterBreak, /playTrainManualStartCue/);
});
