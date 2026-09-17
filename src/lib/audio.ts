const STORAGE_KEY = 'matboard.audio.v1';

export type AudioPrefs = {
  muted: boolean;
  volume: number;
  vibrate: boolean;
};

const DEFAULT_PREFS: AudioPrefs = {
  muted: false,
  volume: 0.8,
  vibrate: true,
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

export function patchAudioPrefs(partial: Partial<AudioPrefs>): void {
  prefs = {
    ...prefs,
    ...partial,
    volume: clampVolume(partial.volume ?? prefs.volume),
  };
  persist();
}

let ctx: AudioContext | null = null;

export async function unlockAudio(): Promise<void> {
  const audio = getContext();
  if (audio.state === 'suspended') {
    await audio.resume();
  }
}

function getContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      throw new Error('Web Audio is not available');
    }
    ctx = new Ctor();
  }
  return ctx;
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

type Tone = {
  freq: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
  slideTo?: number;
};

function playTones(tones: Tone[]): void {
  let audio: AudioContext;
  try {
    audio = getContext();
  } catch {
    return;
  }
  if (audio.state === 'suspended') {
    void audio.resume();
  }
  const now = audio.currentTime;
  const volume = masterGain();
  if (volume <= 0) return;

  for (const tone of tones) {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    const filter = audio.createBiquadFilter();
    osc.type = tone.type;
    osc.frequency.setValueAtTime(tone.freq, now + (tone.delay ?? 0));
    if (tone.slideTo != null) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, tone.slideTo),
        now + (tone.delay ?? 0) + tone.duration,
      );
    }
    filter.type = 'lowpass';
    filter.frequency.value = tone.type === 'sine' ? 4000 : 1800;
    const start = now + (tone.delay ?? 0);
    const peak = Math.max(0.0001, tone.gain * volume);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(start + tone.duration + 0.02);
  }
}

/** Quieter two-blip cue used when a round or clock starts. */
export function playStartCue(): void {
  playTones([
    { freq: 660, duration: 0.12, type: 'sine', gain: 0.18 },
    { freq: 880, duration: 0.16, type: 'sine', gain: 0.22, delay: 0.14 },
  ]);
  buzz([18, 30, 18]);
}

/** Distinct 10-second warning. */
export function playWarningCue(): void {
  playTones([
    { freq: 494, duration: 0.11, type: 'triangle', gain: 0.32 },
    { freq: 494, duration: 0.11, type: 'triangle', gain: 0.32, delay: 0.16 },
    { freq: 392, duration: 0.22, type: 'triangle', gain: 0.36, delay: 0.32 },
  ]);
  buzz([40, 40, 40, 40, 80]);
}

/** Louder original end buzzer — not sampled from any federation. */
export function playEndBuzzer(): void {
  void playAfterResume(() => {
    playTones([
      { freq: 196, duration: 0.85, type: 'square', gain: 0.55, slideTo: 98 },
      { freq: 98, duration: 0.85, type: 'sawtooth', gain: 0.22 },
      { freq: 147, duration: 0.28, type: 'square', gain: 0.4, delay: 0.9 },
    ]);
    buzz([220, 80, 220, 80, 320]);
  });
}

/** Match clock hit 0:00 — longer and more present than the training end cue. */
export function playMatchEndBuzzer(): void {
  void playAfterResume(() => {
    playTones([
      { freq: 185, duration: 1.2, type: 'square', gain: 0.72, slideTo: 92 },
      { freq: 92, duration: 1.2, type: 'sawtooth', gain: 0.36 },
      { freq: 277, duration: 0.2, type: 'square', gain: 0.5, delay: 0.16 },
      { freq: 165, duration: 0.42, type: 'square', gain: 0.68, delay: 1.22 },
      { freq: 110, duration: 0.42, type: 'sawtooth', gain: 0.3, delay: 1.22 },
    ]);
    buzz([280, 70, 280, 70, 420]);
  });
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
