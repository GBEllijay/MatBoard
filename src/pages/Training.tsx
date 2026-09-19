import { useCallback, useState, type MouseEvent } from 'react';
import { Chrome } from '../components/Chrome';
import { FullscreenChip } from '../components/FullscreenChip';
import { Sheet } from '../components/Sheet';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useWakeLock } from '../hooks/useWakeLock';
import { useAudioPrefs, useTrainingState } from '../hooks/useStores';
import { END_CUE_OPTIONS, patchAudioPrefs, playSelectedEndCue, playStartCue, playWarningCue, unlockAudio, type EndCue } from '../lib/audio';
import { formatMmSs, formatMss } from '../lib/format';
import {
  BREAK_PRESETS_MS,
  isBreakPreset,
  isWorkPreset,
  MAX_BREAK_MS,
  MAX_WORK_MS,
  MIN_BREAK_MS,
  MIN_WORK_MS,
  remainingTraining,
  resetTrainingSession,
  setBreakMs,
  setEndSound,
  setRounds,
  setWorkMs,
  tickTraining,
  toggleTrainingClock,
  WORK_PRESETS_MIN,
} from '../lib/trainingStore';
import { dispatchMatch } from '../lib/matchStore';

export function TrainingPage() {
  const training = useTrainingState();
  const audio = useAudioPrefs();
  const [options, setOptions] = useState(false);
  const [customWorkOpen, setCustomWorkOpen] = useState(false);
  const [customBreakOpen, setCustomBreakOpen] = useState(false);
  const [, setTick] = useState(0);
  const remaining = remainingTraining(training);
  const fs = usePlayFullscreen();
  const customWork = !isWorkPreset(training.workMs);
  const customBreak = !isBreakPreset(training.breakMs);
  const showCustomWork = customWorkOpen || customWork;
  const showCustomBreak = customBreakOpen || customBreak;
  const workCustomOn = customWorkOpen || customWork;
  const breakCustomOn = customBreakOpen || customBreak;

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

  const chooseEndCue = (cue: EndCue) => {
    patchAudioPrefs({ endCue: cue });
    dispatchMatch({ type: 'setEndCue', value: cue });
    if (training.endSound) {
      previewCue(() => playSelectedEndCue('training', cue));
    }
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
          shortcut={fs.tvStation}
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
          <div className="presets presets--round-length" role="group" aria-label="Round length">
            {WORK_PRESETS_MIN.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`preset${!workCustomOn && training.workMs === minutes * 60_000 ? ' preset--on' : ''}`}
                onClick={() => {
                  setCustomWorkOpen(false);
                  setWorkMs(minutes * 60_000);
                }}
              >
                {minutes}:00
              </button>
            ))}
            <button
              type="button"
              className={`preset${workCustomOn ? ' preset--on' : ''}`}
              aria-expanded={showCustomWork}
              onClick={() => setCustomWorkOpen((open) => (customWork ? true : !open))}
            >
              Custom
            </button>
          </div>
          {showCustomWork ? (
            <TimeNudges
              valueMs={training.workMs}
              minMs={MIN_WORK_MS}
              maxMs={MAX_WORK_MS}
              label="Custom round length"
              onChange={setWorkMs}
            />
          ) : null}
        </fieldset>

        <fieldset>
          <legend>Break</legend>
          <div className="presets presets--break-length" role="group" aria-label="Break length">
            {BREAK_PRESETS_MS.map((ms) => (
              <button
                key={ms}
                type="button"
                className={`preset${!breakCustomOn && training.breakMs === ms ? ' preset--on' : ''}`}
                onClick={() => {
                  setCustomBreakOpen(false);
                  setBreakMs(ms);
                }}
              >
                {formatMss(ms / 1000)}
              </button>
            ))}
            <button
              type="button"
              className={`preset${breakCustomOn ? ' preset--on' : ''}`}
              aria-expanded={showCustomBreak}
              onClick={() => setCustomBreakOpen((open) => (customBreak ? true : !open))}
            >
              Custom
            </button>
          </div>
          {showCustomBreak ? (
            <TimeNudges
              valueMs={training.breakMs}
              minMs={MIN_BREAK_MS}
              maxMs={MAX_BREAK_MS}
              label="Custom break length"
              onChange={setBreakMs}
            />
          ) : null}
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
              checked={training.endSound}
              onChange={(e) => setEndSound(e.target.checked)}
            />
            Training end sound
          </label>
          <div className="cue-preview">
            <p className="cue-preview-label">Training end cue</p>
            <div className="presets presets--end-cue" role="radiogroup" aria-label="Training end cue">
              {END_CUE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={audio.endCue === option.id}
                  className={`preset${audio.endCue === option.id ? ' preset--on' : ''}`}
                  onClick={() => chooseEndCue(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="cue-preview">
            <p className="cue-preview-label">Preview cues</p>
            <div className="presets presets--three" role="group" aria-label="Preview cues">
              <button type="button" className="preset" onClick={() => previewCue(playStartCue)}>
                Start
              </button>
              <button type="button" className="preset" onClick={() => previewCue(playWarningCue)}>
                10s
              </button>
              <button
                type="button"
                className="preset"
                disabled={!training.endSound}
                onClick={() => previewCue(() => playSelectedEndCue('training', audio.endCue))}
              >
                End
              </button>
            </div>
          </div>
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

function TimeNudges({
  valueMs,
  minMs,
  maxMs,
  label,
  onChange,
}: {
  valueMs: number;
  minMs: number;
  maxMs: number;
  label: string;
  onChange: (ms: number) => void;
}) {
  return (
    <div className="custom-round">
      <strong aria-live="polite">{formatMmSs(valueMs)}</strong>
      <div className="clock-nudges" role="group" aria-label={label}>
        <button
          type="button"
          className="clock-nudge"
          disabled={valueMs <= minMs}
          aria-label="Subtract one minute"
          onClick={() => onChange(valueMs - 60_000)}
        >
          −1m
        </button>
        <button
          type="button"
          className="clock-nudge"
          disabled={valueMs <= minMs}
          aria-label="Subtract one second"
          onClick={() => onChange(valueMs - 1_000)}
        >
          −1s
        </button>
        <button
          type="button"
          className="clock-nudge"
          disabled={valueMs >= maxMs}
          aria-label="Add one second"
          onClick={() => onChange(valueMs + 1_000)}
        >
          +1s
        </button>
        <button
          type="button"
          className="clock-nudge"
          disabled={valueMs >= maxMs}
          aria-label="Add one minute"
          onClick={() => onChange(valueMs + 60_000)}
        >
          +1m
        </button>
      </div>
    </div>
  );
}
