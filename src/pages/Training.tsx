import { useCallback, useState, type MouseEvent } from 'react';
import { Chrome } from '../components/Chrome';
import { FullscreenChip } from '../components/FullscreenChip';
import { Sheet } from '../components/Sheet';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useWakeLock } from '../hooks/useWakeLock';
import { useAudioPrefs, useTrainingState } from '../hooks/useStores';
import { patchAudioPrefs, playEndBuzzer, playStartCue, playWarningCue, unlockAudio } from '../lib/audio';
import { formatMmSs } from '../lib/format';
import {
  BREAK_PRESETS_MS,
  isWorkPreset,
  MAX_WORK_MS,
  MIN_WORK_MS,
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
  const [customOpen, setCustomOpen] = useState(false);
  const [, setTick] = useState(0);
  const remaining = remainingTraining(training);
  const fs = usePlayFullscreen();
  const customWork = !isWorkPreset(training.workMs);
  const showCustomWork = customOpen || customWork;

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
    void unlockAudio()
      .catch(() => undefined)
      .then(() => {
        toggleTrainingClock();
      });
  };

  const previewCue = (play: () => void) => {
    void unlockAudio().then(play);
  };

  return (
    <main
      className={`training training--${training.phase}${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .training__clock, .chrome, .btn, input, fieldset, label, .play-fs')) return;
        setOptions(true);
      }}
    >
      <Chrome ghost title="" />
      <div className="play-fs-slot">
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          onToggle={() => void fs.toggle()}
        />
      </div>
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
          <div className="presets" role="group" aria-label="Round length">
            {WORK_PRESETS_MIN.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`preset${training.workMs === minutes * 60_000 ? ' preset--on' : ''}`}
                onClick={() => {
                  setCustomOpen(false);
                  setWorkMs(minutes * 60_000);
                }}
              >
                {minutes}:00
              </button>
            ))}
            <button
              type="button"
              className={`preset${customWork ? ' preset--on' : ''}`}
              onClick={() => setCustomOpen(true)}
            >
              Custom
            </button>
          </div>
          {showCustomWork ? (
            <div className="custom-round">
              <strong aria-live="polite">{formatMmSs(training.workMs)}</strong>
              <div className="clock-nudges" role="group" aria-label="Custom round length">
                <button
                  type="button"
                  className="clock-nudge"
                  disabled={training.workMs <= MIN_WORK_MS}
                  aria-label="Subtract one minute"
                  onClick={() => setWorkMs(training.workMs - 60_000)}
                >
                  −1m
                </button>
                <button
                  type="button"
                  className="clock-nudge"
                  disabled={training.workMs <= MIN_WORK_MS}
                  aria-label="Subtract one second"
                  onClick={() => setWorkMs(training.workMs - 1_000)}
                >
                  −1s
                </button>
                <button
                  type="button"
                  className="clock-nudge"
                  disabled={training.workMs >= MAX_WORK_MS}
                  aria-label="Add one second"
                  onClick={() => setWorkMs(training.workMs + 1_000)}
                >
                  +1s
                </button>
                <button
                  type="button"
                  className="clock-nudge"
                  disabled={training.workMs >= MAX_WORK_MS}
                  aria-label="Add one minute"
                  onClick={() => setWorkMs(training.workMs + 60_000)}
                >
                  +1m
                </button>
              </div>
            </div>
          ) : null}
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
          <p className="cue-preview-label">Preview original cues</p>
          <div className="presets" role="group" aria-label="Preview original cues">
            <button type="button" className="preset" onClick={() => previewCue(playStartCue)}>
              Start
            </button>
            <button type="button" className="preset" onClick={() => previewCue(playWarningCue)}>
              10s
            </button>
            <button type="button" className="preset" onClick={() => previewCue(playEndBuzzer)}>
              End
            </button>
          </div>
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
