import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { FullscreenChip } from '../components/FullscreenChip';
import { TvTip } from '../components/TvTip';
import { ScoreBox } from '../components/ScoreBox';
import { useInterval } from '../hooks/useClock';
import { usePlayFullscreen } from '../hooks/usePlayFullscreen';
import { useVisibleViewportHeight } from '../hooks/useVisibleViewportHeight';
import { useWakeLock } from '../hooks/useWakeLock';
import { useMatchState } from '../hooks/useStores';
import { unlockAudio } from '../lib/audio';
import { dispatchMatch, expireMatchClock, remainingNow } from '../lib/matchStore';
import { formatMmSs } from '../lib/format';

export function MatchDisplayPage() {
  const match = useMatchState();
  const [, setTick] = useState(0);
  const remaining = remainingNow(match);
  const fs = usePlayFullscreen();

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

  return (
    <main
      className={`display${fs.className ? ` ${fs.className}` : ''}`}
      onPointerDown={() => {
        void unlockAudio();
      }}
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

      <section className="bout bout--blue" aria-label="Blue competitor">
        <div className="bout__who">
          <h1>{match.blue.name || 'Competitor 1'}</h1>
          <p>{match.blue.gym || '\u00a0'}</p>
        </div>
        <div className="bout__scores">
          <ScoreBox side="blue" kind="points" value={match.blue.points} />
          <ScoreBox side="blue" kind="advantages" value={match.blue.advantages} />
          <ScoreBox side="blue" kind="disadvantages" value={match.blue.disadvantages} />
        </div>
      </section>

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

      <section className="bout bout--white" aria-label="White competitor">
        <div className="bout__who">
          <h1>{match.white.name || 'Competitor 2'}</h1>
          <p>{match.white.gym || '\u00a0'}</p>
        </div>
        <div className="bout__scores">
          <ScoreBox side="white" kind="points" value={match.white.points} />
          <ScoreBox side="white" kind="advantages" value={match.white.advantages} />
          <ScoreBox side="white" kind="disadvantages" value={match.white.disadvantages} />
        </div>
      </section>
    </main>
  );
}
