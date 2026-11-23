import { useAudioPrefs } from '../hooks/useStores';
import { patchAudioPrefs } from '../lib/audio';

/**
 * Shared by the scoreboard controller and the round-timer options so both
 * read and write the same per-device startSoundWhen pref. Checked is the
 * default "first" mode: the chosen start cue at full time, and the low
 * resume beep after a pause.
 */
export function RoundStartOnlyToggle() {
  const audio = useAudioPrefs();
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={audio.startSoundWhen === 'first'}
        onChange={(e) => patchAudioPrefs({ startSoundWhen: e.target.checked ? 'first' : 'every' })}
      />
      Round Start Only
    </label>
  );
}
