import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const matchStore = readFileSync(new URL('./matchStore.ts', import.meta.url), 'utf8');
const trainingStore = readFileSync(new URL('./trainingStore.ts', import.meta.url), 'utf8');
const board = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
const timer = readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
const startCue = readFileSync(new URL('../components/StartCueControls.tsx', import.meta.url), 'utf8');
const toggle = readFileSync(new URL('../components/RoundStartOnlyToggle.tsx', import.meta.url), 'utf8');

test('scoreboard and round timer share the same Round Start Only toggle', () => {
  assert.match(toggle, /patchAudioPrefs\(\{ startSoundWhen: e\.target\.checked \? 'first' : 'every' \}\)/);
  assert.match(toggle, /Round Start Only/);
  assert.match(toggle, /startSoundWhen === 'first'/);
  assert.doesNotMatch(toggle, /When to play Combate|First start only|Every start|Begin buttons you tap/);
  assert.doesNotMatch(toggle, /import .*(entitle|edition|unlock|tier)|useEdition|whiteBoard|isPro/i);
  assert.match(board, /<RoundStartOnlyToggle \/>/);
  assert.match(timer, /<RoundStartOnlyToggle \/>/);
});

test('match start cue row is None, Beep, and COMBATE! ("FIGHT!"), styled like the end cue', () => {
  assert.match(startCue, /MATCH_START_CUE_OPTIONS\.map/);
  assert.match(startCue, /aria-label="Match start cue"/);
  assert.match(startCue, /presets--end-cue/);
  assert.match(startCue, /matchStartCueChoice\(startBeep, audio\.startCue\)/);
  assert.match(board, /<StartCueControls startBeep=\{match\.startBeep\} \/>/);
  assert.doesNotMatch(board, /Start beep|StartSoundWhenControls|When to play Combate|First start only/);
  const audio = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
  assert.match(audio, /id: 'combate', label: 'COMBATE! \("FIGHT!"\)'/);
  assert.match(audio, /id: 'none', label: 'None'/);
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

test('manual round-timer begin uses the same policy and never says Combate on rest; automatic work/rest cues stay as they were', () => {
  assert.match(trainingStore, /playTrainManualStartCue\(firstStart\)/);
  assert.match(
    trainingStore,
    /function playTrainManualStartCue\(firstStart: boolean\): void \{\s*if \(!state\.startSound\) return;\s*playManualStartSound\(firstStart, \{ rest: state\.phase === 'break' \}\);/s,
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
