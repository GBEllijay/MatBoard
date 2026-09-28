import { useState } from 'react';
import { useInterval } from '../hooks/useClock';
import { formatMss } from '../lib/format';
import {
  CARLOS_ASSET,
  KIDS_SCOREBOARDS_NAME,
  kidsSkinLabel,
  kidsWinLines,
  type KidsSkinId,
} from '../lib/kidsScoreboard';
import { remainingNow, type MatchState } from '../lib/matchStore';

const CONFETTI = [
  { left: '6%', delay: '0s', color: '#ff4d6d', duration: '3.4s', rotate: '-18deg' },
  { left: '14%', delay: '0.4s', color: '#ffd166', duration: '3.8s', rotate: '24deg' },
  { left: '22%', delay: '0.15s', color: '#4cc9f0', duration: '3.1s', rotate: '12deg' },
  { left: '31%', delay: '0.7s', color: '#80ed99', duration: '3.6s', rotate: '-30deg' },
  { left: '40%', delay: '0.2s', color: '#f72585', duration: '3.2s', rotate: '8deg' },
  { left: '48%', delay: '0.55s', color: '#ff9f1c', duration: '3.9s', rotate: '-12deg' },
  { left: '57%', delay: '0.1s', color: '#c77dff', duration: '3.3s', rotate: '20deg' },
  { left: '66%', delay: '0.85s', color: '#fee440', duration: '3.5s', rotate: '-8deg' },
  { left: '74%', delay: '0.3s', color: '#4ea8de', duration: '3.7s', rotate: '16deg' },
  { left: '83%', delay: '0.6s', color: '#ff6b6b', duration: '3.2s', rotate: '-22deg' },
  { left: '91%', delay: '0.25s', color: '#b8f2e6', duration: '3.8s', rotate: '10deg' },
  { left: '18%', delay: '1s', color: '#ffd6a5', duration: '3.4s', rotate: '28deg' },
  { left: '52%', delay: '1.1s', color: '#caffbf', duration: '3.6s', rotate: '-14deg' },
  { left: '78%', delay: '0.95s', color: '#bdb2ff', duration: '3.1s', rotate: '6deg' },
] as const;

function SkinMark() {
  return (
    <svg className="kids-banner__mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.2 3.2c1.6 0 2.6 1.3 2.6 2.8 0 1-.4 1.8-1 2.4.8.3 1.7.4 2.5.2 1.2-.3 2.2-1.2 2.6-2.3.5-1.4 1.8-2.3 3.3-2.1 1.6.2 2.8 1.6 2.8 3.3 0 1.2-.6 2.2-1.5 2.8 1 .7 1.7 1.8 1.7 3.1 0 2.1-1.8 3.6-3.8 3.4-1.1-.1-2-.7-2.6-1.5-.5 1.3-1.6 2.3-3.1 2.6-2.2.5-4.3-.7-5.1-2.7-.3.2-.7.3-1.1.3-1.5 0-2.7-1.2-2.7-2.7 0-.8.3-1.5.9-2-.8-.5-1.3-1.4-1.3-2.4 0-1.6 1.3-2.9 2.9-2.9.5 0 1 .1 1.4.4.2-1.6 1.4-2.7 3.1-2.7Z"
      />
    </svg>
  );
}

function KidsLiveClock({
  match,
}: {
  match: Pick<MatchState, 'running' | 'startedAt' | 'remainingMs'>;
}) {
  const [, setTick] = useState(0);
  useInterval(() => setTick((n) => n + 1), 250, match.running);
  const seconds = Math.max(0, Math.ceil(remainingNow(match) / 1000));
  return <span className="kids-live__clock">{formatMss(seconds)}</span>;
}

export function KidsBracketChrome({
  skin,
  win,
  champion,
  scoreLine,
  liveLine,
  liveMatch,
}: {
  skin: KidsSkinId;
  win: boolean;
  champion: string;
  scoreLine: string | null;
  liveLine: string | null;
  liveMatch: Pick<MatchState, 'running' | 'startedAt' | 'remainingMs'> | null;
}) {
  const label = kidsSkinLabel(skin);
  const winLines = kidsWinLines(champion, scoreLine);
  return (
    <>
      <div className="kids-banner">
        <p className="kids-banner__title">
          <SkinMark />
          <span>
            {KIDS_SCOREBOARDS_NAME} · {label}
            {win ? ' · Win' : ''}
          </span>
          <SkinMark />
        </p>
        {liveLine && liveMatch ? (
          <p className="kids-live" role="status">
            <span className="kids-live__badge">LIVE</span>
            <span>Current Match: {liveLine}</span>
            <KidsLiveClock match={liveMatch} />
          </p>
        ) : null}
      </div>
      {win ? (
        <div className="kids-carlos" role="status">
          <div className="kids-confetti" aria-hidden="true">
            {CONFETTI.map((piece) => (
              <span
                key={`${piece.left}-${piece.delay}`}
                style={{
                  left: piece.left,
                  animationDelay: piece.delay,
                  animationDuration: piece.duration,
                  background: piece.color,
                  ['--kids-spin' as string]: piece.rotate,
                }}
              />
            ))}
          </div>
          <figure className="kids-carlos__figure">
            <p className="kids-carlos__bubble">
              {winLines.map((line, index) => (
                <span
                  key={`${index}-${line}`}
                  className={
                    index === 0
                      ? 'kids-carlos__cheer'
                      : scoreLine && index === winLines.length - 1
                        ? 'kids-carlos__score'
                        : 'kids-carlos__name'
                  }
                >
                  {line}
                </span>
              ))}
            </p>
            <img src={CARLOS_ASSET} alt="" width={845} height={1200} />
          </figure>
        </div>
      ) : null}
    </>
  );
}
