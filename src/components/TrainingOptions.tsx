import { useAudioPrefs, useTrainingSkin, useTrainingState } from '../hooks/useStores';
import { patchAudioPrefs, type StartCue } from '../lib/audio';
import { EndCueControls } from './EndCueControls';
import { usePolishedSkinsUnlocked, useWhiteBaseSkins } from '../hooks/usePolishedSkins';
import { setTrainingSkin, visibleTrainingSkin } from '../lib/trainingSkin';
import { TimerBackdropOptions } from './TimerBackdropOptions';
import { TimerSkinPicker } from './TimerSkinPicker';
import { WheelPicker } from './WheelPicker';
import { durationOptions, REST_RANGE, ROUND_COUNT_OPTIONS, ROUND_LENGTH_RANGE } from '../lib/timeWheel';
import {
  resetTrainingSession,
  setBreakMs,
  setEndSound,
  setRounds,
  setStartSound,
  setWarningSound,
  setWorkMs,
} from '../lib/trainingStore';

const WORK_OPTIONS = durationOptions(ROUND_LENGTH_RANGE);
const REST_OPTIONS = durationOptions(REST_RANGE);

/** Round length, break, count, sound, skin, and background & logo. Shared by the display sheet and the Rounds controller. */
export function TrainingOptions({ onReset }: { onReset?: () => void }) {
  const training = useTrainingState();
  const audio = useAudioPrefs();
  /** A locked polished pick shows as Classic, which is what the timer paints. White shows Mock-Tournament. */
  const polishedOpen = usePolishedSkinsUnlocked();
  const whiteBase = useWhiteBaseSkins();
  const skin = visibleTrainingSkin(useTrainingSkin(), polishedOpen, whiteBase);
  const picker = polishedOpen || whiteBase;

  return (
    <>
      <fieldset>
        <legend>Round length</legend>
        <WheelPicker label="Round length" value={training.workMs} options={WORK_OPTIONS} onChange={setWorkMs} />
      </fieldset>

      <fieldset>
        <legend>Break</legend>
        <WheelPicker label="Break" value={training.breakMs} options={REST_OPTIONS} onChange={setBreakMs} />
      </fieldset>

      <fieldset>
        <legend>Rounds</legend>
        <div className="presets presets--split" role="group" aria-label="Round mode">
          <button
            type="button"
            className={`preset${!training.endless ? ' preset--on' : ''}`}
            onClick={() => setRounds(training.rounds, false)}
          >
            Counted
          </button>
          <button
            type="button"
            className={`preset${training.endless ? ' preset--on' : ''}`}
            onClick={() => setRounds(training.rounds, true)}
          >
            Endless
          </button>
        </div>
        {!training.endless ? (
          <WheelPicker
            label="Rounds"
            value={training.rounds}
            options={ROUND_COUNT_OPTIONS}
            onChange={(rounds) => setRounds(rounds, false)}
          />
        ) : null}
      </fieldset>

      <fieldset>
        <legend>Sound</legend>
        <label className="toggle">
          <input
            type="checkbox"
            checked={training.startSound}
            onChange={(e) => setStartSound(e.target.checked)}
          />
          Start sound
        </label>
        <div className="cue-preview">
          <p className="cue-preview-label">Training start sound</p>
          <div className="presets presets--split" role="radiogroup" aria-label="Training start sound">
            {(['beep', 'combate'] as const satisfies readonly StartCue[]).map((id) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={audio.startCue === id}
                className={`preset${audio.startCue === id ? ' preset--on' : ''}`}
                onClick={() => patchAudioPrefs({ startCue: id })}
              >
                {id === 'beep' ? 'Beep' : 'Combate'}
              </button>
            ))}
          </div>
        </div>
        <label className="toggle">
          <input
            type="checkbox"
            checked={training.warningSound}
            onChange={(e) => setWarningSound(e.target.checked)}
          />
          10-second warning
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={training.endSound}
            onChange={(e) => setEndSound(e.target.checked)}
          />
          Training end sound
        </label>
        <EndCueControls label="Training end cue" value={audio.endCue} />
        {picker ? <TimerSkinPicker appearance="stack" /> : null}
        <label className="toggle">
          <input
            type="checkbox"
            checked={audio.muted}
            onChange={(e) => patchAudioPrefs({ muted: e.target.checked })}
          />
          Mute
        </label>
        <label className="toggle">
          Volume
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audio.volume}
            onChange={(e) => patchAudioPrefs({ volume: Number(e.target.value), muted: false })}
          />
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={audio.vibrate}
            onChange={(e) => patchAudioPrefs({ vibrate: e.target.checked })}
          />
          Vibrate
        </label>
      </fieldset>

      {picker ? null : (
      <fieldset>
        <legend>Skin</legend>
        {/* Student keeps the Classic / Advantage toggle. The fanned Skins tile is in Sound for White and Media. */}
          <div className="presets presets--split" role="radiogroup" aria-label="Timer skin">
            <button
              type="button"
              role="radio"
              aria-checked={skin === 'classic'}
              className={`preset${skin === 'classic' ? ' preset--on' : ''}`}
              onClick={() => setTrainingSkin('classic')}
            >
              Classic
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={skin === 'themed'}
              className={`preset${skin === 'themed' ? ' preset--on' : ''}`}
              onClick={() => setTrainingSkin('themed')}
            >
              Advantage
            </button>
          </div>
      </fieldset>
      )}

      <TimerBackdropOptions />

      <button
        type="button"
        className="btn"
        onClick={() => {
          resetTrainingSession();
          onReset?.();
        }}
      >
        Reset session
      </button>
    </>
  );
}
