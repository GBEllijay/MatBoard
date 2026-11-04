import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { PolishedTimer } from '../components/PolishedTimer';
import { Sheet } from '../components/Sheet';
import { TrainingOptions } from '../components/TrainingOptions';
import { useInterval } from '../hooks/useClock';
import { usePolishedSkinsUnlocked, useWhiteBaseSkins } from '../hooks/usePolishedSkins';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useSuiteOrigin } from '../hooks/useSuiteOrigin';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGymLogo } from '../hooks/useGymBrand';
import { useTrainingSkin, useTrainingState } from '../hooks/useStores';
import { useEffectiveTimerBackdrop, useTimerBackgroundUrl } from '../hooks/useTimerBackdrop';
import { unlockAudio } from '../lib/audio';
import { formatMmSs } from '../lib/format';
import { fullscreenElement } from '../lib/fullscreen';
import { wantsRoundsFullscreen } from '../lib/roundsFullscreen';
import { safeTimerReturn } from '../lib/timerReturn';
import { isPolishedTrainingSkin, trainingUsesAdvantageSkin, visibleTrainingSkin, whiteTimerSurfaceClass } from '../lib/trainingSkin';
import { timerBackdropClasses, timerGymLogoSrc } from '../lib/timerBackdrop';
import { remainingTraining, tickTraining, toggleTrainingClock } from '../lib/trainingStore';

export function TrainingPage() {
  const training = useTrainingState();
  /** A polished pick paints only with Media Edition or above. White paints one of its three base skins. */
  const skin = visibleTrainingSkin(useTrainingSkin(), usePolishedSkinsUnlocked(), useWhiteBaseSkins());
  const whiteSurface = whiteTimerSurfaceClass(skin);
  const polished = isPolishedTrainingSkin(skin) ? skin : null;
  const [options, setOptions] = useState(false);
  const [, setTick] = useState(0);
  const remaining = remainingTraining(training);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const suite = useSuiteOrigin();
  const [searchParams] = useSearchParams();
  const back = safeTimerReturn(searchParams.get('back'));
  const exitTo = back ?? suite.homePath;
  const location = useLocation();
  const arriveFullscreen = wantsRoundsFullscreen(location.state);
  const enterFullscreen = fs.enter;
  // Media and up. A locked device shows the default background and no logo (data kept).
  const { prefs: backdrop } = useEffectiveTimerBackdrop();
  const backgroundUrl = useTimerBackgroundUrl(backdrop.backgroundStamp);
  const gymLogo = timerGymLogoSrc(backdrop, useGymLogo());
  const backdropClass = timerBackdropClasses(Boolean(backgroundUrl), backdrop, Boolean(gymLogo));

  // Phone controller "Rounds" tap: make sure the timer is fullscreen on arrival.
  useEffect(() => {
    if (!arriveFullscreen || fullscreenElement()) return;
    void enterFullscreen();
  }, [arriveFullscreen, enterFullscreen]);

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

  /** Tap the "Work · Round 1 / 5" line to enter fullscreen; tap again to leave. */
  const onRoundLabel = (event: MouseEvent) => {
    event.stopPropagation();
    void fs.toggle();
  };

  const exitTraining = () => {
    void fs.exit().finally(() => {
      navigate(exitTo);
    });
  };

  return (
    <main
      className={`training training--${training.phase}${
        trainingUsesAdvantageSkin(skin) ? ' training--themed' : ''
      }${whiteSurface ? ` ${whiteSurface}` : ''}${polished ? ' training--polished' : ''}${backdropClass ? ` ${backdropClass}` : ''}${
        suite.fromSuite ? ' origin-suite' : ''
      }${fs.className ? ` ${fs.className}` : ''}`}
      onClick={(event) => {
        const target = event.target as HTMLElement;
        if (
          target.closest(
            '.sheet, .training__clock, .training__phase, .tm-clock, .tm-phase, .chrome, .btn, input, fieldset, label, .play-fs, .play-exit, .training__gym-logo',
          )
        )
          return;
        setOptions(true);
      }}
    >
      {backgroundUrl ? (
        <>
          <div
            className="training__backdrop"
            aria-hidden="true"
            style={{ backgroundImage: `url("${backgroundUrl}")` }}
          />
          <div className="training__scrim" aria-hidden="true" />
        </>
      ) : null}
      <Chrome ghost title="" />
      <PlayExitMark to={exitTo} onExit={exitTraining} />
      {gymLogo ? (
        <div className="training__gym-logo">
          <img src={gymLogo} alt="Gym logo" draggable={false} />
        </div>
      ) : null}
      {back ? (
        <Link className="btn training__back" to={back}>
          Back to curriculum
        </Link>
      ) : null}
      <div className="play-fs-slot">
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          shortcut={fs.tvStation}
          onToggle={() => void fs.toggle()}
        />
      </div>
      {polished ? (
        <PolishedTimer
          slug={polished}
          rest={training.phase === 'break'}
          remainingMs={remaining}
          workMs={training.workMs}
          breakMs={training.breakMs}
          round={training.currentRound}
          phaseLine={`${training.phase === 'work' ? 'WORK' : 'REST'} · ${roundLabel.toUpperCase()}`}
          phaseLabel={`${training.phase === 'work' ? 'Work' : 'Break'} · ${roundLabel}. ${fs.active ? 'Tap to exit fullscreen' : 'Tap for fullscreen'}`}
          onPhase={onRoundLabel}
          onClock={onClock}
          running={training.running}
        />
      ) : (
        <>
          <button
            type="button"
            className="training__phase"
            aria-label={`${training.phase === 'work' ? 'Work' : 'Break'} · ${roundLabel}. ${
              fs.active ? 'Tap to exit fullscreen' : 'Tap for fullscreen'
            }`}
            onClick={onRoundLabel}
          >
            {training.phase === 'work' ? 'Work' : 'Break'} · {roundLabel}
          </button>
          <button type="button" className="training__clock" onClick={onClock}>
            {formatMmSs(remaining)}
          </button>
          <p className="training__hint">Tap the clock to start or pause. Tap the round line for fullscreen. Tap anywhere else for options.</p>
        </>
      )}

      <Sheet open={options} title="Training options" onClose={() => setOptions(false)}>
        <TrainingOptions onReset={() => setOptions(false)} />
      </Sheet>
    </main>
  );
}
