const STORAGE_KEY = 'matboard.audio.v1';

export type EndCue = 'buzzer' | 'parou';

export type AudioPrefs = {
  muted: boolean;
  volume: number;
  vibrate: boolean;
  endCue: EndCue;
};

export const END_CUE_OPTIONS: { id: EndCue; label: string }[] = [
  { id: 'buzzer', label: 'Buzzer' },
  { id: 'parou', label: 'Parou ("stop")' },
];

const PAROU_URL = '/sounds/parou-stop.mp3';

const DEFAULT_PREFS: AudioPrefs = {
  muted: false,
  volume: 0.8,
  vibrate: true,
  endCue: 'buzzer',
};

let prefs: AudioPrefs = loadPrefs();
const listeners = new Set<() => void>();

function loadPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      muted: Boolean(parsed.muted),
      volume: clampVolume(Number(parsed.volume ?? DEFAULT_PREFS.volume)),
      vibrate: parsed.vibrate !== false,
      endCue: parseEndCue(parsed.endCue),
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
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
  };
  persist();
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
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

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      throw new Error('Web Audio is not available');
    }
    ctx = new Ctor();
    master = buildMaster(ctx);
  }
  return ctx;
}

function getMaster(): GainNode {
  getContext();
  return master!;
}

/**
 * Voices mix into a compressor + soft clipper so gym-level buzzers stay
 * present without DAC clipping.
 */
function buildMaster(audio: AudioContext): GainNode {
  const input = audio.createGain();
  input.gain.value = 1;

  const compressor = audio.createDynamicsCompressor();
  compressor.threshold.value = -14;
  compressor.knee.value = 10;
  compressor.ratio.value = 6;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.16;

  const clip = audio.createWaveShaper();
  clip.curve = makeSoftClipCurve();
  clip.oversample = '2x';

  const output = audio.createGain();
  output.gain.value = 0.92;

  input.connect(compressor);
  compressor.connect(clip);
  clip.connect(output);
  output.connect(audio.destination);
  return input;
}

function makeSoftClipCurve() {
  const n = 4096;
  const curve = new Float32Array(n);
  const k = 1.15;
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

type Voice = OscVoice | NoiseVoice;

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

  for (const voice of voices) {
    if (voice.kind === 'noise') {
      scheduleNoise(audio, bus, now, volume, voice);
    } else {
      scheduleOsc(audio, bus, now, volume, voice);
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
  osc.frequency.setValueAtTime(voice.freq, start);
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
 * Original gym "go" — two rising sine notes (not a sampled whistle).
 * Brighter and shorter than the warning ticks.
 */
export function playStartCue(): void {
  playCue(
    [
      { freq: 784, duration: 0.11, type: 'sine', gain: 0.18, attack: 0.008, release: 0.04, filterFreq: 7000 },
      { freq: 1568, duration: 0.11, type: 'sine', gain: 0.05, attack: 0.008, release: 0.04, filterFreq: 8000 },
      { freq: 1175, duration: 0.18, type: 'sine', gain: 0.22, delay: 0.13, attack: 0.008, release: 0.05, filterFreq: 7000 },
      { freq: 2350, duration: 0.18, type: 'sine', gain: 0.06, delay: 0.13, attack: 0.008, release: 0.05, filterFreq: 8000 },
    ],
    [18, 30, 18],
  );
}

/**
 * Original 10-second warning — three light staccato ticks on one pitch.
 * Distinct from the rising start cue and much lighter than the end buzzer.
 */
export function playWarningCue(): void {
  playCue(
    [
      { freq: 1047, duration: 0.07, type: 'triangle', gain: 0.14, attack: 0.004, release: 0.03, filterFreq: 4200 },
      { freq: 1047, duration: 0.07, type: 'triangle', gain: 0.14, delay: 0.13, attack: 0.004, release: 0.03, filterFreq: 4200 },
      { freq: 1047, duration: 0.09, type: 'triangle', gain: 0.16, delay: 0.26, attack: 0.004, release: 0.04, filterFreq: 4200 },
    ],
    [40, 40, 40, 40, 80],
  );
}

function endBuzzerVoices(duration: number, level: number): Voice[] {
  const body = duration;
  const tail = 0.12;
  return [
    {
      kind: 'noise',
      duration: 0.045,
      gain: 0.1 * level,
      attack: 0.002,
      release: 0.03,
      filterType: 'bandpass',
      filterFreq: 1400,
      filterQ: 1.4,
    },
    {
      freq: 392,
      duration: body,
      type: 'square',
      gain: 0.4 * level,
      attack: 0.01,
      release: tail,
      filterFreq: 2200,
      filterQ: 0.8,
      raspHz: 23,
      raspDepth: 0.18,
    },
    {
      freq: 406,
      duration: body,
      type: 'square',
      gain: 0.34 * level,
      attack: 0.01,
      release: tail,
      filterFreq: 2200,
      filterQ: 0.8,
      raspHz: 23,
      raspDepth: 0.16,
    },
    {
      freq: 196,
      duration: body,
      type: 'sawtooth',
      gain: 0.2 * level,
      attack: 0.012,
      release: tail,
      filterFreq: 900,
      filterQ: 0.6,
    },
    {
      freq: 784,
      duration: body * 0.22,
      type: 'triangle',
      gain: 0.1 * level,
      delay: 0.02,
      attack: 0.006,
      release: 0.05,
      filterFreq: 3200,
    },
  ];
}

const MATCH_END_VIBE = [280, 70, 280, 70, 420];
const TRAIN_END_VIBE = [220, 80, 220, 80, 320];

/** Training / round-end buzzer — original electric square-wave horn. */
export function playEndBuzzer(): void {
  playCue(endBuzzerVoices(1.05, 1), TRAIN_END_VIBE);
}

/**
 * Match clock hit 0:00. Same original buzzer character as Training, held
 * longer and a bit more present so it cuts through a gym without clipping.
 */
export function playMatchEndBuzzer(): void {
  playCue(endBuzzerVoices(1.45, 1.12), MATCH_END_VIBE);
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
  const volume = masterGain();
  if (volume <= 0) return;
  const src = audio.createBufferSource();
  const amp = audio.createGain();
  src.buffer = buffer;
  amp.gain.value = volume * 1.15;
  src.connect(amp);
  amp.connect(getMaster());
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
      playVoices(endBuzzerVoices(kind === 'match' ? 1.45 : 1.05, kind === 'match' ? 1.12 : 1));
    });
  });
}

/** Play the user-selected end cue (original synth buzzer or owner-recorded Parou). */
export function playSelectedEndCue(kind: 'match' | 'training' = 'match', cue: EndCue = prefs.endCue): void {
  if (parseEndCue(cue) === 'parou') {
    playParouCue(kind);
    return;
  }
  if (kind === 'match') playMatchEndBuzzer();
  else playEndBuzzer();
}

/** Time to wait after a Training end cue before a back-to-back start cue. */
export const END_BUZZER_MS = 1100;

export function endCueFollowMs(): number {
  if (prefs.endCue === 'parou') return 2200;
  return END_BUZZER_MS;
}
