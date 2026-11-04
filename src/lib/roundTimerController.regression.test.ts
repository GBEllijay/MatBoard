import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const options = readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
const cues = readFileSync(new URL('../components/EndCueControls.tsx', import.meta.url), 'utf8');
const audio = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');

test('round timer keeps every control that was not replaced by a wheel', () => {
  for (const needle of [
    'Round length',
    'Break',
    'Rounds',
    'Counted',
    'Endless',
    'Start sound',
    '10-second warning',
    'Training end sound',
    'Mute',
    'Volume',
    'Vibrate',
    'aria-label="Timer skin"',
    'Classic',
    'Advantage',
    '<TimerSkinPicker',
    '<TimerBackdropOptions />',
    'Reset session',
    'aria-label="Preview cues"',
    'playStartCue',
    'playWarningCue',
    "playSelectedEndCue('training', audio.endCue)",
    'FINAL-CLEANUP',
    'data-final-cleanup="preview-cues"',
    'controller-slot--flexible',
  ]) {
    assert.ok(options.includes(needle), needle);
  }
  assert.match(options, /<EndCueControls label="Training end cue" value=\{audio\.endCue\} begin \/>/);
  assert.doesNotMatch(options, /WORK_PRESETS|BREAK_PRESETS|type="number"|Custom round length/);
  assert.doesNotMatch(options, /aria-label="3 minutes"|aria-label="5 minutes"|aria-label="10 minutes"|TIME_PRESETS/);
  const picker = readFileSync(new URL('../components/WheelPicker.tsx', import.meta.url), 'utf8');
  assert.match(picker, /event\.key === 'ArrowDown' \? 1 : -1/);
  assert.match(picker, /precise\.current = true/);
});

test('Begin plays the owner Combate file through the shared cue bus', () => {
  assert.match(audio, /export const BEGIN_CUE_URL = '\/sounds\/combate\.mp3'/);
  assert.match(audio, /Owner's "Combate" start call/);
  assert.match(audio, /function startRecorded\(buffer: AudioBuffer, gain: number\): void \{\s*const audio = getContext\(\);\s*if \(masterGain\(\) <= 0\) return;\s*const bus = getMaster\(\);/s);
  assert.match(cues, /className="preset preset--begin"/);
  assert.match(cues, /Begin/);
  assert.match(cues, /onClick=\{\(\) => playBeginCue\(\)\}/);
  const beginAt = cues.indexOf('className="preset preset--begin"');
  const begin = cues.slice(beginAt, beginAt + 180);
  assert.match(begin, /playBeginCue\(\)/);
  assert.doesNotMatch(begin, /setEndCue/);
  const choose = cues.slice(cues.indexOf('const choose'), cues.indexOf('const cues'));
  assert.match(choose, /setEndCue/);
  assert.doesNotMatch(choose, /playBeginCue/);
  assert.match(vite, /sounds\/combate\.mp3/);
  assert.match(vite, /sounds\/parou-stop-gaming-mic\.mp3/);
  assert.match(vite, /\*\*\/\*\.\{js,css,ico,png,jpg,jpeg,svg,woff,woff2,ttf,otf,webp,mp3/);
});

test('trimmed Parou stays on the same URL and the follow wait matches the shorter clip', () => {
  assert.match(audio, /const PAROU_URL = '\/sounds\/parou-stop-gaming-mic\.mp3'/);
  assert.match(audio, /export const PAROU_FOLLOW_MS = 2800/);
  assert.match(audio, /trimmed at 0\.90s/);
  assert.doesNotMatch(audio, /return 3700/);
});
