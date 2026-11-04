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

test('fresh device: full volume, Buzzer end cue, extra loud off', async () => {
  const audio = await freshAudio();
  const prefs = audio.getAudioPrefs();
  assert.equal(prefs.volume, 1);
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

test('end cue and extra loud are remembered per device', async () => {
  const audio = await freshAudio();
  audio.patchAudioPrefs({ endCue: 'bell', extraLoud: true });
  const saved = JSON.parse(store.get(KEY)!);
  assert.equal(saved.endCue, 'bell');
  assert.equal(saved.extraLoud, true);
  assert.equal(saved.loudV2, true);
  assert.equal('buzzerSound' in saved, false);
  const again = (await import(`./audio.ts?reload=${n}`)) as typeof import('./audio.ts');
  assert.equal(again.getAudioPrefs().endCue, 'bell');
  assert.equal(again.getAudioPrefs().extraLoud, true);
  // Changing volume keeps the cue and extra loud.
  audio.patchAudioPrefs({ volume: 0.5 });
  assert.equal(audio.getAudioPrefs().endCue, 'bell');
  assert.equal(audio.getAudioPrefs().extraLoud, true);
});

test('migration: draft buzzer sounds map to Buzzer, Boxing bell to Bell, Parou kept', async () => {
  for (const legacy of ['arena', 'airhorn', 'triple', 'classic', 'kazoo']) {
    assert.equal((await freshAudio({ endCue: 'buzzer', buzzerSound: legacy })).getAudioPrefs().endCue, 'buzzer', legacy);
  }
  assert.equal((await freshAudio({ endCue: 'buzzer', buzzerSound: 'bell' })).getAudioPrefs().endCue, 'bell');
  assert.equal((await freshAudio({ endCue: 'parou', buzzerSound: 'bell' })).getAudioPrefs().endCue, 'parou');
  assert.equal((await freshAudio({ endCue: 'parou' })).getAudioPrefs().endCue, 'parou');
  assert.equal((await freshAudio({ endCue: 'nope' })).getAudioPrefs().endCue, 'buzzer');
  const audio = await freshAudio();
  assert.equal(audio.parseEndCue('bell'), 'bell');
  assert.equal(audio.parseEndCue('arena'), 'buzzer');
  assert.equal(audio.migrateEndCue(undefined, 'triple'), 'buzzer');
});

test('three end cue buttons: Buzzer, Bell, Parou', async () => {
  const audio = await freshAudio();
  assert.deepEqual(
    audio.END_CUE_OPTIONS.map((o) => [o.id, o.label]),
    [
      ['buzzer', 'Buzzer'],
      ['bell', 'Bell'],
      ['parou', 'PAROU! ("STOP!")'],
    ],
  );
});

test('Buzzer and Bell each have sound in the 1.5-4 kHz phone-speaker band', async () => {
  const audio = await freshAudio();
  for (const id of ['buzzer', 'bell'] as const) {
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

test('extra loud: Bell gets a gentler push than the Buzzer so it stays clean', async () => {
  const audio = await freshAudio();
  assert.equal(audio.loudnessMode(false, 'bell'), 'normal');
  assert.equal(audio.loudnessMode(false), 'normal');
  assert.equal(audio.loudnessMode(true), 'extra');
  assert.equal(audio.loudnessMode(true, 'bell'), 'extraBell');
  const { normal, extra, extraBell } = audio.LOUDNESS;
  assert.ok(extraBell.drive > normal.drive && extraBell.drive < extra.drive);
  assert.ok(extraBell.clipK >= normal.clipK && extraBell.clipK < extra.clipK);
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

test('next start cue waits for the whole end cue', async () => {
  const audio = await freshAudio();
  audio.patchAudioPrefs({ endCue: 'buzzer' });
  assert.equal(audio.endCueFollowMs(), audio.END_BUZZER_MS);
  audio.patchAudioPrefs({ endCue: 'bell' });
  assert.ok(audio.endCueFollowMs() >= audio.BUZZER_LENGTH_S.bell.training * 1000);
  audio.patchAudioPrefs({ endCue: 'parou' });
  assert.equal(audio.endCueFollowMs(), 2800);
  assert.equal(audio.PAROU_FOLLOW_MS, 2800);
});

test('loudness chain: compressor + makeup + soft limiter, volume after the limiter', () => {
  const src = readFileSync(new URL('./audio.ts', import.meta.url), 'utf8');
  assert.match(src, /createDynamicsCompressor\(\)/);
  assert.match(src, /drive\.connect\(compressor\);\s*compressor\.connect\(makeup\);\s*makeup\.connect\(clip\);\s*clip\.connect\(output\);/);
  assert.match(src, /bus\.output\.gain\.setValueAtTime\(LOUDNESS\.ceiling \* volume/);
  // Cue sounds stay on Web Audio (not <audio>) so they mix over floor music.
  assert.doesNotMatch(src, /new Audio\(/);
});

test('one shared end cue + Extra loud control on the Timer and the Scoreboard', () => {
  const shared = readFileSync(new URL('../components/EndCueControls.tsx', import.meta.url), 'utf8');
  assert.match(shared, /END_CUE_OPTIONS\.map/);
  assert.match(shared, /role="radiogroup" aria-label=\{label\}/);
  assert.match(shared, /patchAudioPrefs\(\{ endCue: cue \}\);\s*dispatchMatch\(\{ type: 'setEndCue', value: cue \}\);/);
  assert.match(shared, /patchAudioPrefs\(\{ extraLoud: e\.target\.checked \}\)/);
  // No edition / entitlement gating in the shared control.
  assert.doesNotMatch(shared, /import .*(entitle|edition|unlock|tier)|useEdition|whiteBoard|isPro/i);

  const timer = readFileSync(new URL('../components/TrainingOptions.tsx', import.meta.url), 'utf8');
  assert.match(timer, /<EndCueControls label="Training end cue" value=\{audio\.endCue\} begin \/>/);
  assert.doesNotMatch(timer, /Buzzer sound|BUZZER_SOUND_OPTIONS/);
  for (const needle of ['aria-label="Preview cues"', 'Mute', 'Volume', 'Vibrate', "playSelectedEndCue('training', audio.endCue)"]) {
    assert.ok(timer.includes(needle), needle);
  }

  const board = readFileSync(new URL('../pages/MatchController.tsx', import.meta.url), 'utf8');
  assert.match(board, /<EndCueControls label="Match end cue" value=\{match\.endCue\} \/>/);
  for (const needle of ['aria-label="Preview match cues"', 'Match end sound', "playSelectedEndCue('match', match.endCue)"]) {
    assert.ok(board.includes(needle), needle);
  }
});
