import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  },
  configurable: true,
});

const KEY = 'matboard.audio.v1';
let n = 0;
/** Fresh module instance so loadPrefs() re-reads storage. */
async function freshAudio(saved?: object) {
  store.clear();
  if (saved) store.set(KEY, JSON.stringify(saved));
  n += 1;
  return import(`./audio.ts?case=${n}`) as Promise<typeof import('./audio.ts')>;
}

test('fresh device: full volume, classic buzzer, extra loud off, buzzer end cue', async () => {
  const audio = await freshAudio();
  const prefs = audio.getAudioPrefs();
  assert.equal(prefs.volume, 1);
  assert.equal(prefs.buzzerSound, 'classic');
  assert.equal(prefs.extraLoud, false);
  assert.equal(prefs.endCue, 'buzzer');
  assert.equal(prefs.muted, false);
  assert.equal(prefs.vibrate, true);
});

test('saved prefs on the old 80% default move to 100% once; other volumes are kept', async () => {
  assert.equal((await freshAudio({ volume: 0.8, endCue: 'parou' })).getAudioPrefs().volume, 1);
  assert.equal((await freshAudio({ volume: 0.8, endCue: 'parou' })).getAudioPrefs().endCue, 'parou');
  assert.equal((await freshAudio({ volume: 0.8, loudV2: true })).getAudioPrefs().volume, 0.8);
  assert.equal((await freshAudio({ volume: 0.35 })).getAudioPrefs().volume, 0.35);
  assert.equal((await freshAudio({ volume: 0, muted: true })).getAudioPrefs().muted, true);
});

test('buzzer choice and extra loud are remembered per device', async () => {
  const audio = await freshAudio();
  audio.patchAudioPrefs({ buzzerSound: 'airhorn', extraLoud: true });
  const saved = JSON.parse(store.get(KEY)!);
  assert.equal(saved.buzzerSound, 'airhorn');
  assert.equal(saved.extraLoud, true);
  assert.equal(saved.loudV2, true);
  const again = await import(`./audio.ts?reload=${n}`) as typeof import('./audio.ts');
  assert.equal(again.getAudioPrefs().buzzerSound, 'airhorn');
  assert.equal(again.getAudioPrefs().extraLoud, true);
  // Changing volume or end cue keeps the buzzer choice.
  audio.patchAudioPrefs({ volume: 0.5 });
  audio.patchAudioPrefs({ endCue: 'parou' });
  assert.equal(audio.getAudioPrefs().buzzerSound, 'airhorn');
});

test('unknown buzzer ids fall back to classic', async () => {
  const audio = await freshAudio({ buzzerSound: 'kazoo' });
  assert.equal(audio.getAudioPrefs().buzzerSound, 'classic');
  assert.equal(audio.parseBuzzerSound(undefined), 'classic');
  assert.equal(audio.parseBuzzerSound('bell'), 'bell');
});

test('five buzzer options, each with sound in the 1.5-4 kHz phone-speaker band', async () => {
  const audio = await freshAudio();
  const ids = audio.BUZZER_SOUND_OPTIONS.map((o) => o.id);
  assert.deepEqual(ids, ['classic', 'arena', 'airhorn', 'bell', 'triple']);
  for (const id of ids) {
    for (const kind of ['training', 'match'] as const) {
      const voices = audio.buzzerVoices(id, kind);
      assert.ok(voices.length > 0, `${id} ${kind} has voices`);
      const presence = voices.some((v) =>
        v.kind === 'noise' ? (v.filterFreq ?? 0) >= 1500 : v.freq >= 1500 && v.freq <= 4000,
      );
      assert.ok(presence, `${id} has a voice between 1.5 and 4 kHz`);
      for (const v of voices) assert.ok(v.gain > 0 && v.gain <= 0.5, `${id} voice gain stays mixable`);
    }
  }
});

test('start and 10s cues now reach the phone band; old sines were all under 1.6 kHz at low gain', async () => {
  const audio = await freshAudio();
  assert.ok(audio.startCueVoices().some((v) => v.kind !== 'noise' && v.freq >= 1500 && v.type === 'square'));
  assert.ok(audio.warningCueVoices().some((v) => v.kind !== 'noise' && v.freq >= 1500 && v.type === 'square'));
  // Same rising two-note shape and three-tick shape as before.
  const startPitches = audio.startCueVoices().map((v) => (v.kind === 'noise' ? 0 : v.freq));
  assert.ok(startPitches.includes(784) && startPitches.includes(1175));
  assert.equal(new Set(audio.warningCueVoices().map((v) => v.delay ?? 0)).size, 3);
});

test('next start cue waits for the whole buzzer', async () => {
  const audio = await freshAudio();
  for (const option of audio.BUZZER_SOUND_OPTIONS) {
    audio.patchAudioPrefs({ buzzerSound: option.id, endCue: 'buzzer' });
    assert.ok(audio.endCueFollowMs() >= audio.BUZZER_LENGTH_S[option.id].training * 1000, option.id);
  }
  audio.patchAudioPrefs({ endCue: 'parou' });
  assert.equal(audio.endCueFollowMs(), 3700);
});

test('loudness chain: compressor + makeup + soft limiter, volume after the limiter', () => {
  const src = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
  assert.match(src, /createDynamicsCompressor\(\)/);
  assert.match(src, /drive\.connect\(compressor\);\s*compressor\.connect\(makeup\);\s*makeup\.connect\(clip\);\s*clip\.connect\(output\);/);
  assert.match(src, /bus\.output\.gain\.setValueAtTime\(LOUDNESS\.ceiling \* volume/);
  // Cue sounds stay on Web Audio (not <audio>) so they mix over floor music.
  assert.doesNotMatch(src, /new Audio\(/);
});

test('round timer settings: Buzzer sound picker with a Test button per option and Extra loud toggle', () => {
  const ui = readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
  assert.match(ui, /aria-label="Buzzer sound"/);
  assert.match(ui, /BUZZER_SOUND_OPTIONS\.map/);
  assert.match(ui, /aria-label=\{`Test \$\{option\.label\}`\}/);
  assert.match(ui, /previewBuzzerSound\(option\.id\)/);
  assert.match(ui, /patchAudioPrefs\(\{ buzzerSound: option\.id \}\)/);
  assert.match(ui, /patchAudioPrefs\(\{ extraLoud: e\.target\.checked \}\)/);
  // Existing controls are still there.
  for (const needle of ['aria-label="Training end cue"', 'aria-label="Preview cues"', 'Mute', 'Volume', 'Vibrate', "playSelectedEndCue('training', audio.endCue)"]) {
    assert.ok(ui.includes(needle), needle);
  }
});
