import { useCallback, useState, type MouseEvent } from 'react';
import { Chrome } from '../components/Chrome';
import { Sheet } from '../components/Sheet';
import { useInterval } from '../hooks/useClock';
import { useWakeLock } from '../hooks/useWakeLock';
import { useAudioPrefs, useTrainingState } from '../hooks/useStores';
import { patchAudioPrefs, unlockAudio } from '../lib/audio';
import { formatMmSs } from '../lib/format';
import {
  BREAK_PRESETS_MS,
  remainingTraining,
  resetTrainingSession,
  setBreakMs,
  setRounds,
  setWorkMs,
  tickTraining,
  toggleTrainingClock,
  WORK_PRESETS_MIN,
} from '../lib/trainingStore';

export function TrainingPage() {
  const training = useTrainingState();
  const audio = useAudioPrefs();
  const [options, setOptions] = useState(false);
  const [, setTick] = useState(0);
  const remaining = remainingTraining(training);

  useWakeLock(training.running);
  useInterval(
    useCallback(() => {
      tickTraining();
      setTick((n) => n + 1);
    }, []),
    100,
    true,
  );

  const roundLabel = training.endless
    ? `Round ${training.currentRound} · Endless`
    : `Round ${training.currentRound} / ${training.rounds}`;

  const onClock = (event: MouseEvent) => {
    event.stopPropagation();
    void unlockAudio();
    toggleTrainingClock();
  };

  return (
    <main
      className={`training training--${training.phase}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .training__clock, .chrome, .btn, input, fieldset, label')) return;
        setOptions(true);
      }}
    >
      <Chrome ghost title="" />
      <p className="training__phase">
        {training.phase === 'work' ? 'Work' : 'Break'} · {roundLabel}
      </p>
      <button type="button" className="training__clock" onClick={onClock}>
        {formatMmSs(remaining)}
      </button>
      <p className="training__hint">Tap the clock to start or pause. Tap anywhere else for options.</p>

      <Sheet open={options} title="Training options" onClose={() => setOptions(false)}>
        <fieldset>
          <legend>Round length</legend>
          <div className="presets">
            {WORK_PRESETS_MIN.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`preset${training.workMs === minutes * 60_000 ? ' preset--on' : ''}`}
                onClick={() => setWorkMs(minutes * 60_000)}
              >
                {minutes}:00
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Break</legend>
          <div className="presets">
            {BREAK_PRESETS_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                className={`preset${training.breakMs === ms ? ' preset--on' : ''}`}
                onClick={() => setBreakMs(ms)}
              >
                {formatMmSs(ms)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend>Rounds</legend>
          <div className="presets">
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
            <label className="stepper">
              Rounds 1–99
              <input
                type="number"
                min={1}
                max={99}
                value={training.rounds}
                onChange={(e) => setRounds(Number(e.target.value) || 1, false)}
              />
            </label>
          ) : null}
        </fieldset>

        <fieldset>
          <legend>Sound</legend>
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

        <button
          type="button"
          className="btn"
          onClick={() => {
            resetTrainingSession();
            setOptions(false);
          }}
        >
          Reset session
        </button>
      </Sheet>
    </main>
  );
}
