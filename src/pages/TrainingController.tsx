import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../components/BeltRail';
import { Chrome } from '../components/Chrome';
import { PlayExitMark } from '../components/PlayExitMark';
import { TrainingOptions } from '../components/TrainingOptions';
import { useInterval } from '../hooks/useClock';
import { useSuiteOrigin } from '../hooks/useSuiteOrigin';
import { useWakeLock } from '../hooks/useWakeLock';
import { useTrainingState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { formatMmSs } from '../lib/format';
import { remainingTraining, tickTraining, toggleTrainingClock } from '../lib/trainingStore';

function openRoundsWindow(fromSuite: boolean): void {
  const path = fromSuite ? '/training?from=suite' : '/training';
  window.open(path, 'matboard-rounds', 'popup,noopener,noreferrer,width=1280,height=720');
}

/** Fat-thumb remote for the rounds timer. The gym TV stays on /training. */
export function TrainingControllerPage() {
  const training = useTrainingState();
  const suite = useSuiteOrigin();
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

  const toggleClock = () => {
    void unlockAudio()
      .catch(() => undefined)
      .then(() => {
        toggleTrainingClock();
      });
  };

  return (
    <main className={`controller training-control${suite.fromSuite ? ' origin-suite' : ''}`}>
      {suite.fromSuite ? <BeltRail kind="tournament" /> : null}
      <PlayExitMark to={suite.homePath} />
      <Chrome
        title="Rounds"
        right={
          <button type="button" className="chip chip--gold" onClick={() => openRoundsWindow(suite.fromSuite)}>
            Rounds
          </button>
        }
      />

      <section className="controller__clock">
        <p className="training-control__phase">
          {training.phase === 'work' ? 'Work' : 'Break'} · {roundLabel}
        </p>
        <button type="button" className="clock-btn clock-btn--control" onClick={toggleClock}>
          {formatMmSs(remaining)}
        </button>
        <div className="training-control__actions">
          <button type="button" className="btn" onClick={toggleClock}>
            {training.running ? 'Pause' : 'Start'}
          </button>
        </div>
      </section>

      <div className="training-control__options">
        <TrainingOptions />
      </div>

      <p className="training-control__open">
        <Link className="text-link" to={suite.withFrom('/training')}>
          Open rounds on this device
        </Link>
      </p>
    </main>
  );
}
