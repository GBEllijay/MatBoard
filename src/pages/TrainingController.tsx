import { useCallback, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { PlayExitMark } from '../components/PlayExitMark';
import { TrainingOptions } from '../components/TrainingOptions';
import { useInterval } from '../hooks/useClock';
import { useSuiteOrigin } from '../hooks/useSuiteOrigin';
import { useWakeLock } from '../hooks/useWakeLock';
import { useTrainingSkin, useTrainingState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { formatMmSs } from '../lib/format';
import { fullscreenSupported, requestPageFullscreen } from '../lib/fullscreen';
import { ROUNDS_FULLSCREEN_STATE, readRoundsDeviceEnv, roundsChipAction, roundsDisplayPath } from '../lib/roundsFullscreen';
import { trainingUsesAdvantageSkin } from '../lib/trainingSkin';
import { remainingTraining, tickTraining, toggleTrainingClock } from '../lib/trainingStore';

function openRoundsWindow(fromSuite: boolean): void {
  window.open(roundsDisplayPath(fromSuite), 'matboard-rounds', 'popup,noopener,noreferrer,width=1280,height=720');
}

/** Fat-thumb remote for the rounds timer. The gym TV stays on /training. */
export function TrainingControllerPage() {
  const training = useTrainingState();
  const skin = useTrainingSkin();
  const suite = useSuiteOrigin();
  const navigate = useNavigate();
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

  /**
   * Phone / installed app: fullscreen rounds display in this window (asked for
   * inside the tap, so Android allows it). Desktop browser: the TV popup, as before.
   */
  const openRounds = () => {
    if (roundsChipAction(readRoundsDeviceEnv()) === 'popup') {
      openRoundsWindow(suite.fromSuite);
      return;
    }
    if (fullscreenSupported()) void requestPageFullscreen();
    navigate(roundsDisplayPath(suite.fromSuite), { state: ROUNDS_FULLSCREEN_STATE });
  };

  return (
    <main
      className={`controller training-control${
        trainingUsesAdvantageSkin(skin) ? '' : ' controller--classic'
      }${training.phase === 'break' ? ' controller--break' : ''}${suite.fromSuite ? ' origin-suite' : ''}`}
    >
      <PlayExitMark to={suite.homePath} />
      <Chrome
        title="Rounds"
        onTitleClick={openRounds}
        titleLabel="Rounds: open the round timer fullscreen"
        right={
          <button type="button" className="chip chip--gold" onClick={openRounds}>
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
