import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Chrome } from '../components/Chrome';
import { HoldButton } from '../components/HoldButton';
import { FullscreenChip } from '../components/FullscreenChip';
import { PlayExitMark } from '../components/PlayExitMark';
import { PolishedTimer } from '../components/PolishedTimer';
import { FlipRings } from '../components/ScoreBox';
import { LedClock } from '../skins/LedClock';
import { Sheet } from '../components/Sheet';
import { TrainingOptions } from '../components/TrainingOptions';
import { useCustomSkinUrl } from '../hooks/useCustomSkinUrl';
import { useTrainingClock } from '../hooks/useTrainingClock';
import { usePolishedSkinsUnlocked, useWhiteBaseSkins } from '../hooks/usePolishedSkins';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useSuiteOrigin } from '../hooks/useSuiteOrigin';
import { useWakeLock } from '../hooks/useWakeLock';
import { useGymLogo } from '../hooks/useGymBrand';
import { useTrainingSkin, useTrainingState } from '../hooks/useStores';
import { useEffectiveTimerBackdrop, useTimerBackgroundUrl } from '../hooks/useTimerBackdrop';
import { unlockAudio } from '../lib/audio';
import { customSkinRecordId, isCustomSkinId } from '../lib/customSkin';
import { formatMmSs } from '../lib/format';
import { fullscreenElement } from '../lib/fullscreen';
import { wantsRoundsFullscreen } from '../lib/roundsFullscreen';
import { lastOptionsClosedAt, optionsReopenBlocked } from '../lib/optionsReopenGuard';
import { safeTimerReturn } from '../lib/timerReturn';
import {
  isPolishedTrainingSkin,
  trainingHasProgressBar,
  trainingUsesAdvantageSkin,
  trainingUsesLedClock,
  trainingUsesSplitFlap,
  trainingUsesTrueFlipCards,
  visibleTrainingSkin,
  whiteTimerSurfaceClass,
} from '../lib/trainingSkin';
import { timerProgress } from '../skins/polished/timerText';
import { timerBackdropClasses, timerGymLogoSrc } from '../lib/timerBackdrop';
import { remainingTraining, resetTrainingPeriod, resetTrainingSession, toggleTrainingClock } from '../lib/trainingStore';

export function TrainingPage() {
  const training = useTrainingState();
  /** A polished pick paints only with Media Edition or above. White paints one of its three base skins. */
  const skin = visibleTrainingSkin(useTrainingSkin(), usePolishedSkinsUnlocked(), useWhiteBaseSkins());
  const whiteSurface = whiteTimerSurfaceClass(skin);
  const customRecordId = isCustomSkinId(skin) ? customSkinRecordId(skin) : null;
  const customUrl = useCustomSkinUrl(customRecordId);
  const polished = customRecordId || !isPolishedTrainingSkin(skin) ? null : skin;
  const splitFlap = trainingUsesSplitFlap(skin);
  const trueFlip = trainingUsesTrueFlipCards(skin);
  const ledClock = trainingUsesLedClock(skin);
  const showProgress = trainingHasProgressBar(skin);
  const [options, setOptions] = useState(false);
  const remaining = remainingTraining(training);
  const formattedClock = formatMmSs(remaining);
  const finalTen = ledClock && remaining > 0 && remaining <= 10_000;
  const progressShare = timerProgress(remaining, training.phase === 'break' ? training.breakMs : training.workMs);
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
  const photoUrl = customUrl ?? (customRecordId ? null : backgroundUrl);
  const backdropClass = customUrl
    ? 'training--custom-bg training--skin-auto-scrim'
    : timerBackdropClasses(Boolean(photoUrl), backdrop, Boolean(gymLogo));

  // Phone controller "Rounds" tap: make sure the timer is fullscreen on arrival.
  useEffect(() => {
    if (!arriveFullscreen || fullscreenElement()) return;
    void enterFullscreen();
  }, [arriveFullscreen, enterFullscreen]);

  useWakeLock(training.running);
  useTrainingClock();

  const roundLabel = training.endless
    ? `Round ${training.currentRound} · Endless`
    : `Round ${training.currentRound} / ${training.rounds}`;

  const onClock = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    void unlockAudio()
      .catch(() => undefined)
      .then(() => {
        toggleTrainingClock();
      });
  };

  /** Tap the "Work · Round 1 / 5" line to enter fullscreen; tap again to leave. */
  const onRoundLabel = (event: { stopPropagation: () => void }) => {
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
      }${whiteSurface ? ` ${whiteSurface}` : ''}${finalTen ? ' training--final-10' : ''}${polished ? ' training--polished' : ''}${backdropClass ? ` ${backdropClass}` : ''}${
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
        // The tap that just closed Options must not open it again.
        if (optionsReopenBlocked(lastOptionsClosedAt(), Date.now())) return;
        setOptions(true);
      }}
    >
      {photoUrl ? (
        <>
          <div
            className="training__backdrop"
            data-custom-skin-bg={customUrl ? '' : undefined}
            aria-hidden="true"
            style={{ backgroundImage: `url("${photoUrl}")` }}
          />
          <div className="training__scrim" data-custom-skin-scrim={customUrl ? '' : undefined} aria-hidden="true" />
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
          onPhaseHold={() => resetTrainingSession()}
          onClockHold={() => resetTrainingPeriod()}
          running={training.running}
        />
      ) : (
        <>
          <HoldButton
            className="training__phase"
            dataHold="round"
            ariaLabel={`${training.phase === 'work' ? 'Work' : 'Break'} · ${roundLabel}. ${
              fs.active ? 'Tap to exit fullscreen' : 'Tap for fullscreen'
            } Hold 3 seconds to reset the session.`}
            onTap={onRoundLabel}
            onComplete={() => resetTrainingSession()}
          >
            {training.phase === 'work' ? 'Work' : 'Break'} · {roundLabel}
          </HoldButton>
          <div className="training__clock-block">
          <p className="clock-field-label clock-field-label--display">Round time</p>
          <HoldButton
            className="training__clock"
            dataHold="timer"
            ariaLabel={`${formattedClock}. Tap to start or pause. Hold 3 seconds to reset this period.`}
            onTap={onClock}
            onComplete={() => resetTrainingPeriod()}
          >
            {ledClock ? (
              <LedClock mmss={formattedClock} />
            ) : splitFlap ? (
              <span className="wt-sf-clock" aria-hidden="true">
                {formattedClock.split('').map((ch, idx) =>
                  ch === ':' ? (
                    <span key={`sep-${idx}`} className="wt-sf-clock__colon">:</span>
                  ) : (
                    <span key={`${idx}-${ch}`} className="wt-sf-tile">
                      <span className="wt-sf-tile__face">{ch}</span>
                      <span className="wt-sf-tile__seam" />
                    </span>
                  ),
                )}
              </span>
            ) : trueFlip ? (
              <span className="wt-tf-clock" aria-hidden="true">
                {formattedClock.split('').map((ch, idx) =>
                  ch === ':' ? (
                    <span key={`sep-${idx}`} className="wt-tf-clock__colon">:</span>
                  ) : (
                    <span key={idx} className="wt-tf-slot">
                      <FlipRings variant="old-school" />
                      <span key={`${idx}-${ch}`} className="wt-tf-card">
                        <span className="wt-tf-card__face">{ch}</span>
                        <span className="wt-tf-card__seam" />
                      </span>
                    </span>
                  ),
                )}
              </span>
            ) : (
              formattedClock
            )}
          </HoldButton>
          </div>
          <p className="training__hint">Tap the clock to start or pause. Hold the clock for 3 seconds to reset this period. Tap the round line for fullscreen. Hold the round line for 3 seconds to reset the session. Tap anywhere else for options.</p>
          {showProgress ? (
            <div className="wt-timer-progress" style={{ '--p': String(Math.round(progressShare * 1000) / 1000) } as CSSProperties} aria-hidden="true">
              <div className="wt-timer-progress__fill" />
            </div>
          ) : null}
        </>
      )}

      <Sheet open={options} title="Training options" onClose={() => setOptions(false)} pinClose>
        <TrainingOptions onReset={() => setOptions(false)} />
      </Sheet>
    </main>
  );
}
