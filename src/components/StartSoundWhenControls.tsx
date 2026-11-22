import { useAudioPrefs } from '../hooks/useStores';
import { patchAudioPrefs } from '../lib/audio';
import type { StartSoundWhen } from '../lib/startSoundPolicy';

const OPTIONS: { id: StartSoundWhen; label: string }[] = [
  { id: 'first', label: 'First start only' },
  { id: 'every', label: 'Every start' },
];

/**
 * Shared by the scoreboard controller and the round-timer options so both
 * read and write the same per-device startSoundWhen pref.
 */
export function StartSoundWhenControls() {
  const audio = useAudioPrefs();
  return (
    <div className="cue-preview">
      <p className="cue-preview-label">When to play Combate</p>
      <div className="presets presets--split" role="radiogroup" aria-label="When to play Combate">
        {OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={audio.startSoundWhen === option.id}
            className={`preset${audio.startSoundWhen === option.id ? ' preset--on' : ''}`}
            onClick={() => patchAudioPrefs({ startSoundWhen: option.id })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="cue-preview-hint">
        First start only plays Combate when the clock is at full time. Later begins after a pause or
        rest play a short beep.
      </p>
    </div>
  );
}
