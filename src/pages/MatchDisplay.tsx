import { useCallback, useState, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { OutcomeCalls, OutcomePickSheet, useOutcomeSheet } from '../components/OutcomeCalls';
import { OutcomeSplash } from '../components/OutcomeSplash';
import { TvTip } from '../components/TvTip';
import { RankChip } from '../components/RankChip';
import { CarlosCheer } from '../components/CarlosCheer';
import { ScoreBox } from '../components/ScoreBox';
import { useBoutQuerySync, useBracketOutcomeReturn } from '../hooks/useBracketBoutReturn';
import { useInterval } from '../hooks/useClock';
import { useMatchBoard } from '../hooks/useMatchBoard';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMatchState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { controllerPath, declareMatchOutcome } from '../lib/bracketBout';
import { roundDisplay } from '../lib/roundDisplay';
import { competitorFocus, type DisplayFocus } from '../lib/matchFocus';
import { dispatchMatch, expireMatchClock, remainingNow, type Side } from '../lib/matchStore';
import { needsRefDecision } from '../lib/outcomes';
import { formatMmSs } from '../lib/format';
import { carlosMatchComplete, matchCarlosView } from '../lib/carlosCelebration';
import { withSuiteFrom } from '../lib/productNames';
import { SCOREBOARD_SKIN, scoreboardSkinClass } from '../lib/scoreboardSkin';

export function MatchDisplayPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const remaining = remainingNow(match);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();
  const board = useMatchBoard();
  const suite = board.suite;
  const linkedId = board.linkedId;
  const refNeeded = needsRefDecision({ ...match, remainingMs: remaining });
  const endedWithoutWinner = remaining <= 0 && !match.running && !match.outcome;
  const splash = match.outcomeFlash && match.outcome ? match.outcome : null;
  const flashing = Boolean(match.outcomeFlash);
  const outcomeSheet = useOutcomeSheet();
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
    const path = board.originPath(controllerPath(linkedId, focus));
    void fs.exit().finally(() => navigate(path));
  };

  const onBoardClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, .score, .tv-tip, .display__chrome, .display-splash')) return;
    // Landscape / fullscreen / TV: leave empty taps for play chrome (F, idle cursor). Portrait phone can open Controller.
    if (fs.active || fs.landscape || fs.tvStation) return;
    openController(endedWithoutWinner ? 'outcome' : undefined);
  };

  const roundLine = roundDisplay(match.round, Boolean(linkedId));
  const clockStatus = match.running ? 'Running' : remaining <= 0 ? 'Ended' : 'Paused';
  const clockStatusAction = match.running ? 'Pause match clock' : remaining <= 0 ? 'Restart match clock' : 'Start match clock';
  const skin = board.skinFor(match.skin);
  const flap = skin === SCOREBOARD_SKIN.OLD_SCHOOL;
  const boardCalls = !flap;
  const carlos = board.showCarlos
    ? matchCarlosView({
        prefs: match.carlos,
        outcome: match.outcome,
        blueName: match.blue.name,
        whiteName: match.white.name,
        bluePoints: match.blue.points,
        whitePoints: match.white.points,
        matchComplete: carlosMatchComplete({
          running: match.running,
          remainingMs: remaining,
          outcome: match.outcome,
        }),
      })
    : { show: false, lines: [] as string[] };

  const clockControl = (
    <button type="button" className="clock-btn" onClick={toggleClock} aria-label="Start or pause match clock">
      {formatMmSs(remaining)}
    </button>
  );
  const statusControl = refNeeded ? (
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
  );

  return (
    <main
      className={`display ${scoreboardSkinClass(skin)}${linkedId ? ' display--linked' : ''}${splash ? ' display--splash' : ''}${
        suite.fromSuite ? ' origin-suite' : ''
      }${fs.className ? ` ${fs.className}` : ''}`}
      onPointerDown={() => {
        void unlockAudio();
      }}
      onClick={onBoardClick}
    >
      <div className="display__chrome">
        <div className="display__chrome-start">
          {linkedId ? (
            <Link to={withSuiteFrom('/tournament', suite.fromSuite)} className="chip chip--keep">
              Back to bracket
            </Link>
          ) : (
            <Link to={suite.homePath} className="chip">
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
          <Link
            to={board.originPath(controllerPath(linkedId, endedWithoutWinner ? 'outcome' : undefined))}
            className="chip chip--gold"
          >
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
        flap={flap}
        onOpenController={openController}
        calls={
          boardCalls
            ? {
                disabled: flashing,
                highlight: refNeeded,
                onWin: () => outcomeSheet.openWin('blue', 'Blue'),
                onDq: () => outcomeSheet.openDq('blue', 'Blue'),
              }
            : undefined
        }
      />

      <section className={`display__mid${flap ? ' display__mid--stack' : ''}`}>
        {flap ? clockControl : null}
        <div className="display__meta">
          {roundLine ? (
            <ControllerFocusLink focus="round" label="Edit round on Controller" onOpen={openController}>
              {roundLine}
            </ControllerFocusLink>
          ) : null}
          <ControllerFocusLink focus="division" label="Edit division on Controller" onOpen={openController}>
            {match.division || 'Open'}
          </ControllerFocusLink>
        </div>
        {flap ? null : clockControl}
        {statusControl}
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
        flap={flap}
        onOpenController={openController}
        calls={
          boardCalls
            ? {
                disabled: flashing,
                highlight: refNeeded,
                onWin: () => outcomeSheet.openWin('white', 'White'),
                onDq: () => outcomeSheet.openDq('white', 'White'),
              }
            : undefined
        }
      />

      {boardCalls ? (
        <OutcomePickSheet
          open={outcomeSheet.sheet?.call ?? null}
          title={
            outcomeSheet.sheet?.call === 'dq'
              ? `${outcomeSheet.sheet.label} DQ`
              : `${outcomeSheet.sheet?.label ?? ''} win`
          }
          onClose={outcomeSheet.close}
          onPickWin={(method) => {
            if (!outcomeSheet.sheet) return;
            declareMatchOutcome(outcomeSheet.sheet.side, { call: 'win', method });
            outcomeSheet.close();
          }}
          onPickDq={(reason) => {
            if (!outcomeSheet.sheet) return;
            declareMatchOutcome(outcomeSheet.sheet.side, { call: 'dq', reason });
            outcomeSheet.close();
          }}
        />
      ) : null}

      {splash ? <OutcomeSplash outcome={splash} name={splashName} /> : null}
      {carlos.show ? <CarlosCheer lines={carlos.lines} board /> : null}
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
  flap,
  onOpenController,
  calls,
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
  flap: boolean;
  onOpenController: (focus?: DisplayFocus) => void;
  calls?: {
    disabled: boolean;
    highlight: boolean;
    onWin: () => void;
    onDq: () => void;
  };
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
        {calls ? (
          <OutcomeCalls
            sideLabel={label}
            disabled={calls.disabled}
            highlight={calls.highlight}
            variant="bout"
            onWin={calls.onWin}
            onDq={calls.onDq}
          />
        ) : null}
      </div>
      <div className="bout__scores">
        <ScoreBox side={side} kind="points" value={points} flap={flap} />
        <ScoreBox side={side} kind="advantages" value={advantages} flap={flap} />
        <ScoreBox side={side} kind="disadvantages" value={disadvantages} flap={flap} />
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
  const board = useMatchBoard();
  return (
    <Link
      to={board.originPath(controllerPath(board.linkedId, focus))}
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
