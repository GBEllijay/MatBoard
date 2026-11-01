const STORAGE_KEY = 'matboard.audio.v1';

export type EndCue = 'buzzer' | 'parou';

export type BuzzerSound = 'classic' | 'arena' | 'airhorn' | 'bell' | 'triple';

export type AudioPrefs = {
  muted: boolean;
  volume: number;
  vibrate: boolean;
  endCue: EndCue;
  /** Which synthesized buzzer the "Buzzer" end cue plays. Per device. */
  buzzerSound: BuzzerSound;
  /** Drive the limiter harder for loud rooms (denser, slightly grittier). */
  extraLoud: boolean;
};

/**
 * Buzzer sounds the owner can compare. All are synthesized here with Web Audio
 * (no sample files, no licensing). `classic` is the original buzzer, boosted.
 */
export const BUZZER_SOUND_OPTIONS: { id: BuzzerSound; label: string; hint: string }[] = [
  { id: 'classic', label: 'Original buzzer', hint: 'Today\'s buzzer, louder and brighter' },
  { id: 'arena', label: 'Arena horn', hint: 'Basketball / gym scoreboard horn' },
  { id: 'airhorn', label: 'Air horn', hint: 'Two air-horn blasts' },
  { id: 'bell', label: 'Boxing bell', hint: 'Ding-ding-ding' },
  { id: 'triple', label: 'Triple beep', hint: 'Three sharp high beeps' },
];

const BUZZER_IDS = new Set<string>(BUZZER_SOUND_OPTIONS.map((o) => o.id));

export function parseBuzzerSound(value: unknown, fallback: BuzzerSound = 'classic'): BuzzerSound {
  return typeof value === 'string' && BUZZER_IDS.has(value) ? (value as BuzzerSound) : fallback;
}

export const END_CUE_OPTIONS: { id: EndCue; label: string }[] = [
  { id: 'buzzer', label: 'Buzzer' },
  { id: 'parou', label: 'PAROU! ("STOP!")' },
];

/**
 * Approved gaming-mic take: full “Parou… stop”.
 * File: `public/sounds/parou-stop-gaming-mic.mp3` (served as this URL).
 * The chip label stays PAROU! ("STOP!"); both words are spoken.
 */
const PAROU_URL = '/sounds/parou-stop-gaming-mic.mp3';

/**
 * Cue-only trim above the user volume slider.
 * This file already peaks at 0 dBFS, so 1.0 keeps the phrase from clipping.
 */
const PAROU_CUE_GAIN = 1;

const DEFAULT_PREFS: AudioPrefs = {
  muted: false,
  volume: 1,
  vibrate: true,
  endCue: 'buzzer',
  buzzerSound: 'classic',
  extraLoud: false,
};

/** Old default slider position. Saved prefs still sitting on it move to full once. */
const LEGACY_DEFAULT_VOLUME = 0.8;

let prefs: AudioPrefs = loadPrefs();
const listeners = new Set<() => void>();

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs> & { loudV2?: boolean };
    let volume = clampVolume(Number(parsed.volume ?? DEFAULT_PREFS.volume));
    // Before the louder cues, the slider defaulted to 80%. Devices that never
    // moved it get full volume once; a slider moved anywhere else is kept.
    if (!parsed.loudV2 && volume === LEGACY_DEFAULT_VOLUME) volume = 1;
    return {
      muted: Boolean(parsed.muted),
      volume,
      vibrate: parsed.vibrate !== false,
      endCue: parseEndCue(parsed.endCue),
      buzzerSound: parseBuzzerSound(parsed.buzzerSound),
      extraLoud: parsed.extraLoud === true,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_PREFS.volume;
  return Math.min(1, Math.max(0, n));
}

function persist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prefs, loudV2: true }));
  listeners.forEach((fn) => fn());
}

export function getAudioPrefs(): AudioPrefs {
  return prefs;
}

export function subscribeAudioPrefs(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function parseEndCue(value: unknown, fallback: EndCue = DEFAULT_PREFS.endCue): EndCue {
  return value === 'parou' || value === 'buzzer' ? value : fallback;
}

export function patchAudioPrefs(partial: Partial<AudioPrefs>): void {
  prefs = {
    ...prefs,
    ...partial,
    volume: clampVolume(partial.volume ?? prefs.volume),
    endCue: parseEndCue(partial.endCue ?? prefs.endCue),
    buzzerSound: parseBuzzerSound(partial.buzzerSound ?? prefs.buzzerSound),
    extraLoud: partial.extraLoud ?? prefs.extraLoud,
  };
  persist();
}

let ctx: AudioContext | null = null;
let master: MasterBus | null = null;
let noiseBuffer: AudioBuffer | null = null;
let parouBuffer: AudioBuffer | null = null;
let parouLoad: Promise<AudioBuffer | null> | null = null;

export async function unlockAudio(): Promise<void> {
  const audio = getContext();
  if (audio.state === 'suspended') {
    await audio.resume();
  }
  void loadParouBuffer();
}

/** True when this document already has an unlocked context that can be heard. */
export function isAudioRunning(): boolean {
  return ctx?.state === 'running';
}

/** Resume this document's context. False when the browser still blocks audio. */
export async function ensureAudioRunning(): Promise<boolean> {
  try {
    const audio = getContext();
    if (audio.state === 'suspended') await audio.resume();
    return audio.state === 'running';
  } catch {
    return false;
  }
}

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      throw new Error('Web Audio is not available');
    }
    // Synth + decoded Parou stay on this context (not <audio>/<video>) so short
    // gym cues mix over floor music instead of taking the media session.
    ctx = new Ctor();
    master = buildMaster(ctx);
  }
  return ctx;
}

function getMaster(): GainNode {
  getContext();
  applyLoudness(master!, ctx!);
  return master!.input;
}

type MasterBus = {
  input: GainNode;
  drive: GainNode;
  clip: WaveShaperNode;
  output: GainNode;
  extraLoud: boolean | null;
  volume: number | null;
};

/**
 * Loudness chain: drive -> compressor -> makeup -> soft limiter -> volume.
 *
 * Cues are mixed near full scale, the compressor squeezes peaks so the
 * makeup gain can lift the average (perceived) level, and a tanh soft
 * limiter keeps the final peak just under 0 dBFS so phones do not crackle.
 * The user's volume slider is applied after the limiter, so 100% really is
 * full scale and lower settings are a clean linear trim.
 */
export const LOUDNESS = {
  normal: { drive: 1, clipK: 1.6 },
  extra: { drive: 2.2, clipK: 2.6 },
  makeup: 1.9,
  ceiling: 0.97,
} as const;

function buildMaster(audio: BaseAudioContext): MasterBus {
  const input = audio.createGain();
  input.gain.value = 1;

  const drive = audio.createGain();
  drive.gain.value = LOUDNESS.normal.drive;

  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 6;
  compressor.ratio.value = 10;
  compressor.attack.value = 0.002;
  compressor.release.value = 0.12;

  const makeup = audio.createGain();
  makeup.gain.value = LOUDNESS.makeup;

  const clip = audio.createWaveShaper();
  clip.curve = makeSoftClipCurve(LOUDNESS.normal.clipK);
  clip.oversample = '4x';

  const output = audio.createGain();
  output.gain.value = LOUDNESS.ceiling;

  input.connect(drive);
  drive.connect(compressor);
  compressor.connect(makeup);
  makeup.connect(clip);
  clip.connect(output);
  output.connect(audio.destination);
  return { input, drive, clip, output, extraLoud: null, volume: null };
}

function applyLoudness(bus: MasterBus, audio: BaseAudioContext): void {
  const extra = prefs.extraLoud;
  if (bus.extraLoud !== extra) {
    const mode = extra ? LOUDNESS.extra : LOUDNESS.normal;
    bus.drive.gain.setValueAtTime(mode.drive, audio.currentTime);
    bus.clip.curve = makeSoftClipCurve(mode.clipK);
    bus.extraLoud = extra;
  }
  const volume = masterGain();
  if (bus.volume !== volume) {
    bus.output.gain.setValueAtTime(LOUDNESS.ceiling * volume, audio.currentTime);
    bus.volume = volume;
  }
}

function makeSoftClipCurve(k: number) {
  const n = 4096;
  const curve = new Float32Array(n);
  const denom = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = Math.tanh(x * k) / denom;
  }
  return curve;
}

function masterGain(): number {
  if (prefs.muted) return 0;
  return prefs.volume;
}

function buzz(pattern: number[]): void {
  if (!prefs.vibrate) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

function getNoiseBuffer(audio: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === audio.sampleRate) return noiseBuffer;
  const length = Math.max(1, Math.floor(audio.sampleRate * 0.5));
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

type OscVoice = {
  kind?: 'osc';
  freq: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
  slideTo?: number;
  /** Start at this pitch and glide up/down to `freq` over `bendTime` (air-horn "blat"). */
  bendFrom?: number;
  bendTime?: number;
  attack?: number;
  release?: number;
  detune?: number;
  filterFreq?: number;
  filterType?: BiquadFilterType;
  filterQ?: number;
  /** Amplitude-modulation Hz — gives an electric-buzzer rasp. */
  raspHz?: number;
  raspDepth?: number;
};

type NoiseVoice = {
  kind: 'noise';
  duration: number;
  gain: number;
  delay?: number;
  attack?: number;
  release?: number;
  filterFreq?: number;
  filterType?: BiquadFilterType;
  filterQ?: number;
};

export type Voice = OscVoice | NoiseVoice;

function playVoices(voices: Voice[]): void {
  let audio: AudioContext;
  try {
    audio = getContext();
  } catch {
    return;
  }
  const volume = masterGain();
  if (volume <= 0) return;
  const now = audio.currentTime;
  const bus = getMaster();
  // Volume is applied after the limiter (see applyLoudness), so voices are
  // always mixed at their designed level and the limiter sees a steady input.
  for (const voice of voices) {
    if (voice.kind === 'noise') {
      scheduleNoise(audio, bus, now, 1, voice);
    } else {
      scheduleOsc(audio, bus, now, 1, voice);
    }
  }
}

function envelope(
  gain: AudioParam,
  start: number,
  duration: number,
  peak: number,
  attack: number,
  release: number,
): void {
  const a = Math.min(attack, duration * 0.45);
  const r = Math.min(release, Math.max(0.02, duration - a));
  const peakTime = start + a;
  const end = start + duration;
  gain.cancelScheduledValues(start);
  gain.setValueAtTime(0.0001, start);
  gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), peakTime);
  const hold = end - r;
  if (hold > peakTime + 0.01) {
    gain.setValueAtTime(Math.max(0.0001, peak), hold);
  }
  gain.exponentialRampToValueAtTime(0.0001, end);
}

function scheduleOsc(
  audio: AudioContext,
  bus: GainNode,
  now: number,
  volume: number,
  voice: OscVoice,
): void {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  const filter = audio.createBiquadFilter();
  osc.type = voice.type;
  const start = now + (voice.delay ?? 0);
  if (voice.bendFrom != null) {
    osc.frequency.setValueAtTime(voice.bendFrom, start);
    osc.frequency.exponentialRampToValueAtTime(voice.freq, start + (voice.bendTime ?? 0.06));
  } else {
    osc.frequency.setValueAtTime(voice.freq, start);
  }
  if (voice.detune != null) osc.detune.setValueAtTime(voice.detune, start);
  if (voice.slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, voice.slideTo), start + voice.duration);
  }

  filter.type = voice.filterType ?? 'lowpass';
  filter.frequency.value = voice.filterFreq ?? (voice.type === 'sine' ? 6000 : 2400);
  filter.Q.value = voice.filterQ ?? 0.7;

  const peak = Math.max(0.0001, voice.gain * volume);
  envelope(amp.gain, start, voice.duration, peak, voice.attack ?? 0.012, voice.release ?? 0.06);

  if (voice.raspHz && voice.raspDepth) {
    const lfo = audio.createOscillator();
    const lfoGain = audio.createGain();
    lfo.frequency.setValueAtTime(voice.raspHz, start);
    lfoGain.gain.setValueAtTime(peak * voice.raspDepth, start);
    lfo.connect(lfoGain);
    lfoGain.connect(amp.gain);
    lfo.start(start);
    lfo.stop(start + voice.duration + 0.03);
  }

  osc.connect(filter);
  filter.connect(amp);
  amp.connect(bus);
  osc.start(start);
  osc.stop(start + voice.duration + 0.03);
}

function scheduleNoise(
  audio: AudioContext,
  bus: GainNode,
  now: number,
  volume: number,
  voice: NoiseVoice,
): void {
  const src = audio.createBufferSource();
  src.buffer = getNoiseBuffer(audio);
  src.loop = true;
  const amp = audio.createGain();
  const filter = audio.createBiquadFilter();
  filter.type = voice.filterType ?? 'bandpass';
  filter.frequency.value = voice.filterFreq ?? 1600;
  filter.Q.value = voice.filterQ ?? 1.2;
  const start = now + (voice.delay ?? 0);
  const peak = Math.max(0.0001, voice.gain * volume);
  envelope(amp.gain, start, voice.duration, peak, voice.attack ?? 0.006, voice.release ?? 0.04);
  src.connect(filter);
  filter.connect(amp);
  amp.connect(bus);
  src.start(start);
  src.stop(start + voice.duration + 0.03);
}

async function playAfterResume(play: () => void): Promise<void> {
  try {
    const audio = getContext();
    if (audio.state === 'suspended') await audio.resume();
    if (audio.state === 'suspended') return;
    play();
  } catch {
    /* no Web Audio */
  }
}

function playCue(voices: Voice[], vibe: number[]): void {
  buzz(vibe);
  void playAfterResume(() => playVoices(voices));
}

/**
 * Original gym "go": two rising notes, now in the 1.5-2.4 kHz band phone
 * speakers reproduce well (the old 784 Hz sines were mostly lost on phones).
 */
export function startCueVoices(): Voice[] {
  return [
    { freq: 784, duration: 0.14, type: 'triangle', gain: 0.32, attack: 0.006, release: 0.04, filterFreq: 6000 },
    { freq: 1568, duration: 0.14, type: 'square', gain: 0.3, attack: 0.006, release: 0.04, filterFreq: 5200 },
    { freq: 1175, duration: 0.24, type: 'triangle', gain: 0.34, delay: 0.16, attack: 0.006, release: 0.06, filterFreq: 6000 },
    { freq: 2350, duration: 0.24, type: 'square', gain: 0.32, delay: 0.16, attack: 0.006, release: 0.06, filterFreq: 6000 },
  ];
}

export function playStartCue(): void {
  playCue(startCueVoices(), [18, 30, 18]);
}

/**
 * Original 10-second warning: three staccato ticks on one pitch, plus an
 * octave-up square so the ticks cut through floor music.
 */
export function warningCueVoices(): Voice[] {
  const tick = (delay: number, duration: number): Voice[] => [
    { freq: 1047, duration, type: 'triangle', gain: 0.3, delay, attack: 0.003, release: 0.03, filterFreq: 5000 },
    { freq: 2093, duration, type: 'square', gain: 0.3, delay, attack: 0.003, release: 0.03, filterFreq: 5200 },
  ];
  return [...tick(0, 0.09), ...tick(0.15, 0.09), ...tick(0.3, 0.12)];
}

export function playWarningCue(): void {
  playCue(warningCueVoices(), [40, 40, 40, 40, 80]);
}

/** Original electric square-wave buzzer, boosted: open filter + 2-4 kHz presence. */
function classicBuzzerVoices(duration: number): Voice[] {
  const body = duration;
  const tail = 0.12;
  const rasp = { raspHz: 23, raspDepth: 0.18 };
  return [
    { kind: 'noise', duration: 0.05, gain: 0.3, attack: 0.002, release: 0.03, filterType: 'bandpass', filterFreq: 2600, filterQ: 1.2 },
    { freq: 392, duration: body, type: 'square', gain: 0.34, attack: 0.008, release: tail, filterFreq: 5000, filterQ: 0.7, ...rasp },
    { freq: 406, duration: body, type: 'square', gain: 0.28, attack: 0.008, release: tail, filterFreq: 5000, filterQ: 0.7, ...rasp },
    { freq: 196, duration: body, type: 'sawtooth', gain: 0.14, attack: 0.01, release: tail, filterFreq: 1400, filterQ: 0.6 },
    { freq: 784, duration: body, type: 'square', gain: 0.14, attack: 0.008, release: tail, filterFreq: 4200, ...rasp },
    { freq: 1568, duration: body, type: 'square', gain: 0.22, attack: 0.008, release: tail, filterFreq: 4500, ...rasp },
    { freq: 2352, duration: body, type: 'square', gain: 0.12, attack: 0.008, release: tail, filterFreq: 5000, ...rasp },
  ];
}

/** Basketball / gym scoreboard horn: a harsh sawtooth chord with buzz. */
function arenaHornVoices(duration: number): Voice[] {
  const tail = 0.1;
  const rasp = { raspHz: 55, raspDepth: 0.22 };
  return [
    { freq: 311, duration, type: 'sawtooth', gain: 0.3, attack: 0.01, release: tail, filterFreq: 6000, ...rasp },
    { freq: 466, duration, type: 'sawtooth', gain: 0.26, attack: 0.01, release: tail, filterFreq: 6000, ...rasp },
    { freq: 622, duration, type: 'square', gain: 0.2, attack: 0.01, release: tail, filterFreq: 5000, ...rasp },
    { freq: 2490, duration, type: 'square', gain: 0.18, attack: 0.01, release: tail, filterFreq: 4200, filterType: 'lowpass' },
    { kind: 'noise', duration, gain: 0.1, attack: 0.01, release: tail, filterType: 'bandpass', filterFreq: 2800, filterQ: 2 },
  ];
}

/** Air horn: two blasts of detuned saws that "blat" up to pitch. */
function airHornVoices(duration: number): Voice[] {
  const blast = (delay: number, len: number): Voice[] => [
    { freq: 466, bendFrom: 380, bendTime: 0.07, duration: len, delay, type: 'sawtooth', gain: 0.26, attack: 0.012, release: 0.08, filterFreq: 7000, detune: -8 },
    { freq: 466, bendFrom: 380, bendTime: 0.07, duration: len, delay, type: 'sawtooth', gain: 0.26, attack: 0.012, release: 0.08, filterFreq: 7000, detune: 9 },
    { freq: 587, bendFrom: 480, bendTime: 0.07, duration: len, delay, type: 'sawtooth', gain: 0.24, attack: 0.012, release: 0.08, filterFreq: 7000 },
    { freq: 1864, duration: len, delay, type: 'square', gain: 0.16, attack: 0.02, release: 0.08, filterFreq: 4500 },
    { freq: 2796, duration: len, delay, type: 'square', gain: 0.08, attack: 0.02, release: 0.08, filterFreq: 5000 },
  ];
  const first = 0.42;
  const gap = 0.1;
  return [...blast(0, first), ...blast(first + gap, Math.max(0.5, duration - first - gap))];
}

/** Boxing bell: three strikes of an inharmonic bell (partials 0.9-3.2 kHz). */
function boxingBellVoices(strikes: number): Voice[] {
  const f0 = 900;
  const partials: [number, number][] = [
    [1, 0.3],
    [1.48, 0.26],
    [2.0, 0.26],
    [2.76, 0.2],
    [3.5, 0.12],
  ];
  const voices: Voice[] = [];
  for (let i = 0; i < strikes; i++) {
    const delay = i * 0.3;
    const last = i === strikes - 1;
    const ring = last ? 1.1 : 0.55;
    voices.push({ kind: 'noise', duration: 0.03, gain: 0.25, delay, attack: 0.001, release: 0.025, filterType: 'highpass', filterFreq: 2500, filterQ: 0.7 });
    for (const [ratio, gain] of partials) {
      voices.push({ freq: f0 * ratio, duration: ring, type: 'sine', gain, delay, attack: 0.002, release: ring - 0.01, filterFreq: 9000 });
    }
  }
  return voices;
}

/** Sharp triple beep: 2.5 kHz squares, right where phone speakers are loudest. */
function tripleBeepVoices(longLast: number): Voice[] {
  const beep = (delay: number, len: number): Voice[] => [
    { freq: 2500, duration: len, delay, type: 'square', gain: 0.4, attack: 0.003, release: 0.02, filterFreq: 7000 },
    { freq: 1250, duration: len, delay, type: 'square', gain: 0.22, attack: 0.003, release: 0.02, filterFreq: 5000 },
  ];
  return [...beep(0, 0.2), ...beep(0.3, 0.2), ...beep(0.6, longLast)];
}

/** Seconds of sound for each buzzer (training / match), used for follow-up timing. */
export const BUZZER_LENGTH_S: Record<BuzzerSound, { training: number; match: number }> = {
  classic: { training: 1.15, match: 1.55 },
  arena: { training: 1.2, match: 1.6 },
  airhorn: { training: 1.25, match: 1.6 },
  bell: { training: 1.7, match: 2.3 },
  triple: { training: 0.95, match: 1.1 },
};

export function buzzerVoices(sound: BuzzerSound, kind: 'match' | 'training' = 'training'): Voice[] {
  const len = BUZZER_LENGTH_S[sound][kind];
  switch (sound) {
    case 'arena':
      return arenaHornVoices(len);
    case 'airhorn':
      return airHornVoices(len);
    case 'bell':
      return boxingBellVoices(kind === 'match' ? 5 : 3);
    case 'triple':
      return tripleBeepVoices(kind === 'match' ? 0.5 : 0.35);
    case 'classic':
    default:
      return classicBuzzerVoices(len);
  }
}

const MATCH_END_VIBE = [280, 70, 280, 70, 420];
const TRAIN_END_VIBE = [220, 80, 220, 80, 320];

/** Training / round-end buzzer: the sound picked in Buzzer sound (default Classic). */
export function playEndBuzzer(sound: BuzzerSound = prefs.buzzerSound): void {
  playCue(buzzerVoices(sound, 'training'), TRAIN_END_VIBE);
}

/** Match clock hit 0:00. Same picked buzzer, held a bit longer. */
export function playMatchEndBuzzer(sound: BuzzerSound = prefs.buzzerSound): void {
  playCue(buzzerVoices(sound, 'match'), MATCH_END_VIBE);
}

/** Settings "Test" button for one buzzer option (does not change the saved choice). */
export function previewBuzzerSound(sound: BuzzerSound): void {
  playEndBuzzer(parseBuzzerSound(sound));
}

async function loadParouBuffer(): Promise<AudioBuffer | null> {
  if (parouBuffer) return parouBuffer;
  if (!parouLoad) {
    parouLoad = (async () => {
      try {
        const audio = getContext();
        const res = await fetch(PAROU_URL);
        if (!res.ok) return null;
        const data = await res.arrayBuffer();
        parouBuffer = await audio.decodeAudioData(data.slice(0));
        return parouBuffer;
      } catch {
        parouLoad = null;
        return null;
      }
    })();
  }
  return parouLoad;
}

function startParou(buffer: AudioBuffer): void {
  const audio = getContext();
  if (masterGain() <= 0) return;
  const bus = getMaster();
  const src = audio.createBufferSource();
  const amp = audio.createGain();
  src.buffer = buffer;
  amp.gain.value = PAROU_CUE_GAIN;
  src.connect(amp);
  amp.connect(bus);
  src.start();
}

function playParouCue(kind: 'match' | 'training'): void {
  buzz(kind === 'match' ? MATCH_END_VIBE : TRAIN_END_VIBE);
  void playAfterResume(() => {
    void loadParouBuffer().then((buffer) => {
      if (buffer) {
        startParou(buffer);
        return;
      }
      playVoices(buzzerVoices(prefs.buzzerSound, kind));
    });
  });
}

/** Play the user-selected end cue (synth buzzer or the “Parou… stop” take). */
export function playSelectedEndCue(kind: 'match' | 'training' = 'match', cue: EndCue = prefs.endCue): void {
  if (parseEndCue(cue) === 'parou') {
    playParouCue(kind);
    return;
  }
  if (kind === 'match') playMatchEndBuzzer();
  else playEndBuzzer();
}

/** Time to wait after a Training end cue before a back-to-back start cue (classic buzzer). */
export const END_BUZZER_MS = 1250;

export function endCueFollowMs(): number {
  // Full take is ~3.5s (speech ends ~2.4s). Wait it out before the next start cue.
  if (prefs.endCue === 'parou') return 3700;
  return Math.max(END_BUZZER_MS, Math.round(BUZZER_LENGTH_S[prefs.buzzerSound].training * 1000) + 100);
}
