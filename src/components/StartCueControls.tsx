import { useAudioPrefs } from '../hooks/useStores';
import { MATCH_START_CUE_OPTIONS, patchAudioPrefs, type StartCue } from '../lib/audio';
import { dispatchMatch } from '../lib/matchStore';
import { matchStartCueChoice, type MatchStartCueChoice } from '../lib/startSoundPolicy';

/**
 * Match start cue row: None / Beep / COMBATE! ("FIGHT!"), laid out like
 * the Match end cue buttons. None is the old Start beep checkbox off.
 * Beep and Combate write the shared per-device startCue pref.
 */
export function StartCueControls({ startBeep }: { startBeep: boolean }) {
  const audio = useAudioPrefs();
  const value = matchStartCueChoice(startBeep, audio.startCue);
  const choose = (cue: MatchStartCueChoice) => {
    if (cue === 'none') {
      dispatchMatch({ type: 'setStartBeep', value: false });
      return;
    }
    patchAudioPrefs({ startCue: cue satisfies StartCue });
    dispatchMatch({ type: 'setStartBeep', value: true });
  };
  return (
    <div className="cue-preview">
      <p className="cue-preview-label">Match start cue</p>
      <div className="presets presets--end-cue" role="radiogroup" aria-label="Match start cue">
        {MATCH_START_CUE_OPTIONS.map((option) => (
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
}
