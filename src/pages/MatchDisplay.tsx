import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { OutcomeSplash } from '../components/OutcomeSplash';
import { TvTip } from '../components/TvTip';
import { RankChip } from '../components/RankChip';
import { ScoreBox } from '../components/ScoreBox';
import { useBoutQuerySync, useBracketOutcomeReturn } from '../hooks/useBracketBoutReturn';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMatchState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { controllerPath, linkedBracketMatchId, roundDisplay } from '../lib/bracketBout';
import { competitorFocus, type DisplayFocus } from '../lib/matchFocus';
import { dispatchMatch, expireMatchClock, remainingNow, type Side } from '../lib/matchStore';
import { needsRefDecision } from '../lib/outcomes';
import { formatMmSs } from '../lib/format';

export function MatchDisplayPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const remaining = remainingNow(match);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const linkedId = linkedBracketMatchId(match.bracketMatchId);
  const refNeeded = needsRefDecision({ ...match, remainingMs: remaining });
  const endedWithoutWinner = remaining <= 0 && !match.running && !match.outcome;
  const splash = match.outcomeFlash && match.outcome ? match.outcome : null;
  const splashName = splash
    ? (splash.side === 'blue' ? match.blue.name : match.white.name).trim() ||
      (splash.side === 'blue' ? 'Competitor 1' : 'Competitor 2')
    : '';

  useBoutQuerySync();
  useBracketOutcomeReturn();
  useVisibleViewportHeight();
  useWakeLock(match.running);
  useInterval(
    useCallback(() => {
      expireMatchClock();
      setTick((n) => n + 1);
    }, []),
    100,
    true,
  );

  const toggleClock = () => {
    void unlockAudio();
    dispatchMatch({ type: 'toggleClock' });
  };

  const openController = (focus?: DisplayFocus) => {
    const path = controllerPath(linkedId, focus);
    void fs.exit().finally(() => navigate(path));
  };

  const onBoardClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, .score, .tv-tip, .display__chrome, .display-splash')) return;
    // Landscape / fullscreen / TV: leave empty taps for play chrome (F, idle cursor). Portrait phone can open Controller.
    if (fs.active || fs.landscape || fs.tvStation) return;
    openController(endedWithoutWinner ? 'outcome' : undefined);
  };

  const clockStatus = match.running ? 'Running' : remaining <= 0 ? 'Ended' : 'Paused';
  const clockStatusAction = match.running ? 'Pause match clock' : remaining <= 0 ? 'Restart match clock' : 'Start match clock';

  return (
    <main
      className={`display${linkedId ? ' display--linked' : ''}${splash ? ' display--splash' : ''}${fs.className ? ` ${fs.className}` : ''}`}
      onPointerDown={() => {
        void unlockAudio();
      }}
      onClick={onBoardClick}
    >
      <div className="display__chrome">
        <div className="display__chrome-start">
          {linkedId ? (
            <Link to="/tournament" className="chip chip--keep">
              Back to bracket
            </Link>
          ) : (
            <Link to="/" className="chip">
              Home
            </Link>
          )}
        </div>
        <div className="display__chrome-end">
          <FullscreenChip
            supported={fs.supported}
            active={fs.active}
            nudge={fs.showFallback}
            shortcut={fs.tvStation}
            onToggle={() => void fs.toggle()}
          />
          <Link to={controllerPath(linkedId, endedWithoutWinner ? 'outcome' : undefined)} className="chip chip--gold">
            Controller
          </Link>
        </div>
      </div>
      <TvTip onFullscreen={() => void fs.enter()} />

      <CompetitorBand
        side="blue"
        name={match.blue.name}
        gym={match.blue.gym}
        rank={match.blue.rank}
        points={match.blue.points}
        advantages={match.blue.advantages}
        disadvantages={match.blue.disadvantages}
        fallbackName="Competitor 1"
        linked={Boolean(linkedId)}
        onOpenController={openController}
      />

      <section className="display__mid">
        <div className="display__meta">
          <ControllerFocusLink focus="round" label="Edit round on Controller" onOpen={openController}>
            {roundDisplay(match.round, Boolean(linkedId))}
          </ControllerFocusLink>
          <ControllerFocusLink focus="division" label="Edit division on Controller" onOpen={openController}>
            {match.division || 'Open'}
          </ControllerFocusLink>
        </div>
        <button type="button" className="clock-btn" onClick={toggleClock} aria-label="Start or pause match clock">
          {formatMmSs(remaining)}
        </button>
        {refNeeded ? (
          <button
            type="button"
            className="display__clock-hint display__clock-hint--ref"
            onClick={() => openController('outcome')}
          >
            Referee decision
          </button>
        ) : (
          <button type="button" className="display__clock-hint" onClick={toggleClock} aria-label={clockStatusAction}>
            {clockStatus}
          </button>
        )}
      </section>

      <CompetitorBand
        side="white"
        name={match.white.name}
        gym={match.white.gym}
        rank={match.white.rank}
        points={match.white.points}
        advantages={match.white.advantages}
        disadvantages={match.white.disadvantages}
        fallbackName="Competitor 2"
        linked={Boolean(linkedId)}
        onOpenController={openController}
      />

      {splash ? <OutcomeSplash outcome={splash} name={splashName} /> : null}
    </main>
  );
}

function CompetitorBand({
  side,
  name,
  gym,
  rank,
  points,
  advantages,
  disadvantages,
  fallbackName,
  linked,
  onOpenController,
}: {
  side: Side;
  name: string;
  gym: string;
  rank: string;
  points: number;
  advantages: number;
  disadvantages: number;
  fallbackName: string;
  linked: boolean;
  onOpenController: (focus?: DisplayFocus) => void;
}) {
  const label = side === 'blue' ? 'Blue' : 'White';

  return (
    <section className={`bout bout--${side}${linked ? ' bout--linked' : ''}`} aria-label={`${label} competitor`}>
      <div className="bout__who">
        <h1>
          <ControllerFocusLink
            focus={competitorFocus(side, 'name')}
            label={`Edit ${label} name on Controller`}
            onOpen={onOpenController}
          >
            {name || fallbackName}
          </ControllerFocusLink>
          {rank ? <RankChip belt={rank} /> : null}
        </h1>
        <p>
          <ControllerFocusLink
            focus={competitorFocus(side, 'gym')}
            label={`Edit ${label} gym on Controller`}
            onOpen={onOpenController}
          >
            {gym || '\u00a0'}
          </ControllerFocusLink>
        </p>
      </div>
      <div className="bout__scores">
        <ScoreBox side={side} kind="points" value={points} />
        <ScoreBox side={side} kind="advantages" value={advantages} />
        <ScoreBox side={side} kind="disadvantages" value={disadvantages} />
      </div>
    </section>
  );
}

function ControllerFocusLink({
  focus,
  label,
  onOpen,
  children,
}: {
  focus: DisplayFocus;
  label: string;
  onOpen: (focus: DisplayFocus) => void;
  children: ReactNode;
}) {
  const linkedId = linkedBracketMatchId(useMatchState().bracketMatchId);
  return (
    <Link
      to={controllerPath(linkedId, focus)}
      aria-label={label}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpen(focus);
      }}
    >
      {children}
    </Link>
  );
}
