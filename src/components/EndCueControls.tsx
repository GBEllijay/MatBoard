import { useAudioPrefs } from '../hooks/useStores';
import { END_CUE_OPTIONS, patchAudioPrefs, type EndCue } from '../lib/audio';
import { dispatchMatch } from '../lib/matchStore';

/**
 * End cue (Buzzer / Bell / Parou) plus Extra loud. Shared by the round timer
 * and the scoreboard so both read and write the same per-device audio prefs
 * (and the live match state), for every edition.
 *
 * Selection only. Switching cues does not play the sound. The live clock plays it.
 */
export function EndCueControls({ label, value }: { label: string; value: EndCue }) {
  const audio = useAudioPrefs();
  const choose = (cue: EndCue) => {
    patchAudioPrefs({ endCue: cue });
    dispatchMatch({ type: 'setEndCue', value: cue });
  };
  return (
    <>
      <div className="cue-preview">
        <p className="cue-preview-label">{label}</p>
        <div className="presets presets--end-cue" role="radiogroup" aria-label={label}>
          {END_CUE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={value === option.id}
              className={`preset${value === option.id ? ' preset--on' : ''}`}
              onClick={() => choose(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={audio.extraLoud}
          onChange={(e) => patchAudioPrefs({ extraLoud: e.target.checked })}
        />
        Extra loud (for rooms with music)
      </label>
    </>
  );
}
