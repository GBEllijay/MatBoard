import { useAudioPrefs } from '../hooks/useStores';
import { END_CUE_OPTIONS, patchAudioPrefs, playBeginCue, type EndCue } from '../lib/audio';
import { dispatchMatch } from '../lib/matchStore';

/**
 * End cue (Buzzer / Bell / Parou) plus Extra loud. Shared by the round timer
 * and the scoreboard so both read and write the same per-device audio prefs
 * (and the live match state), for every edition.
 *
 * Selection only. Switching cues mid-round must not play a stop sound; the
 * page's "End" preview button plays the selected cue.
 *
 * `begin` adds the round-timer Begin button beside Buzzer, Bell, and Parou.
 * It plays the recorded start call and does not change the selected end cue.
 */
export function EndCueControls({ label, value, begin = false }: { label: string; value: EndCue; begin?: boolean }) {
  const audio = useAudioPrefs();
  const choose = (cue: EndCue) => {
    patchAudioPrefs({ endCue: cue });
    dispatchMatch({ type: 'setEndCue', value: cue });
  };
  const cues = (
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
  );
  return (
    <>
      {begin ? (
        <div className="end-cue-line">
          {cues}
          <button type="button" className="preset preset--begin" onClick={() => playBeginCue()}>
            Begin
          </button>
        </div>
      ) : (
        cues
      )}
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
