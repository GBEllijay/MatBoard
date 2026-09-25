import { useCallback, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { Chrome } from '../components/Chrome';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { Sheet } from '../components/Sheet';
import { TrainingOptions } from '../components/TrainingOptions';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useSuiteOrigin } from '../hooks/useSuiteOrigin';
import { useWakeLock } from '../hooks/useWakeLock';
import { useTrainingSkin, useTrainingState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { formatMmSs } from '../lib/format';
import { remainingTraining, tickTraining, toggleTrainingClock } from '../lib/trainingStore';

export function TrainingPage() {
  const training = useTrainingState();
  const skin = useTrainingSkin();
  const [options, setOptions] = useState(false);
  const [, setTick] = useState(0);
  const remaining = remainingTraining(training);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const suite = useSuiteOrigin();

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

  const exitTraining = () => {
    void fs.exit().finally(() => {
      navigate(suite.homePath);
    });
  };

  return (
    <main
      className={`training training--${training.phase}${
        skin === 'themed' || suite.fromSuite ? ' training--themed' : ''
      }${suite.fromSuite ? ' origin-suite' : ''}${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.sheet, .training__clock, .chrome, .btn, input, fieldset, label, .play-fs, .play-exit')) return;
        setOptions(true);
      }}
    >
      {suite.fromSuite ? <BeltRail kind="tournament" /> : null}
      <Chrome ghost title="" />
      <PlayExitMark to={suite.homePath} onExit={exitTraining} />
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
        <TrainingOptions onReset={() => setOptions(false)} />
      </Sheet>
    </main>
  );
}
