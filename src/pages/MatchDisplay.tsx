import { useCallback, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { TvTip } from '../components/TvTip';
import { ScoreBox } from '../components/ScoreBox';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMatchState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { competitorFocusPath, type CompetitorFocusField } from '../lib/matchFocus';
import { dispatchMatch, expireMatchClock, remainingNow, type Side } from '../lib/matchStore';
import { formatMmSs } from '../lib/format';

export function MatchDisplayPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const remaining = remainingNow(match);
  const fs = usePlayFullscreen();
  const navigate = useNavigate();

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

  const openController = (path = '/match/control') => {
    void fs.exit().finally(() => navigate(path));
  };

  const onBoardClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, .score, .tv-tip, .display__chrome')) return;
    // Landscape / fullscreen / TV: leave empty taps for play chrome (F, idle cursor). Portrait phone can open Controller.
    if (fs.active || fs.landscape || fs.tvStation) return;
    openController();
  };

  return (
    <main
      className={`display${fs.className ? ` ${fs.className}` : ''}`}
      onPointerDown={() => {
        void unlockAudio();
      }}
      onClick={onBoardClick}
    >
      <div className="display__chrome">
        <Link to="/" className="chip">
          Home
        </Link>
        <FullscreenChip
          supported={fs.supported}
          active={fs.active}
          nudge={fs.showFallback}
          shortcut={fs.tvStation}
          onToggle={() => void fs.toggle()}
        />
        <Link to="/match/control" className="chip chip--gold">
          Controller
        </Link>
      </div>
      <TvTip onFullscreen={() => void fs.enter()} />

      <CompetitorBand
        side="blue"
        name={match.blue.name}
        gym={match.blue.gym}
        points={match.blue.points}
        advantages={match.blue.advantages}
        disadvantages={match.blue.disadvantages}
        fallbackName="Competitor 1"
        onOpenController={openController}
      />

      <section className="display__mid">
        <div className="display__meta">
          <span>Round {match.round || '—'}</span>
          <span>{match.division || 'Open'}</span>
        </div>
        <button type="button" className="clock-btn" onClick={toggleClock} aria-label="Start or pause match clock">
          {formatMmSs(remaining)}
        </button>
        <p className="display__clock-hint">{match.running ? 'Running' : remaining <= 0 ? 'Ended' : 'Paused'}</p>
      </section>

      <CompetitorBand
        side="white"
        name={match.white.name}
        gym={match.white.gym}
        points={match.white.points}
        advantages={match.white.advantages}
        disadvantages={match.white.disadvantages}
        fallbackName="Competitor 2"
        onOpenController={openController}
      />
    </main>
  );
}

function CompetitorBand({
  side,
  name,
  gym,
  points,
  advantages,
  disadvantages,
  fallbackName,
  onOpenController,
}: {
  side: Side;
  name: string;
  gym: string;
  points: number;
  advantages: number;
  disadvantages: number;
  fallbackName: string;
  onOpenController: (path: string) => void;
}) {
  const label = side === 'blue' ? 'Blue' : 'White';

  return (
    <section className={`bout bout--${side}`} aria-label={`${label} competitor`}>
      <div className="bout__who">
        <h1>
          <WhoLink side={side} field="name" label={`Edit ${label} name on Controller`} onOpenController={onOpenController}>
            {name || fallbackName}
          </WhoLink>
        </h1>
        <p>
          <WhoLink side={side} field="gym" label={`Edit ${label} gym on Controller`} onOpenController={onOpenController}>
            {gym || '\u00a0'}
          </WhoLink>
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

function WhoLink({
  side,
  field,
  label,
  onOpenController,
  children,
}: {
  side: Side;
  field: CompetitorFocusField;
  label: string;
  onOpenController: (path: string) => void;
  children: string;
}) {
  const to = competitorFocusPath(side, field);

  return (
    <Link
      to={to}
      aria-label={label}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onOpenController(to);
      }}
    >
      {children}
    </Link>
  );
}
