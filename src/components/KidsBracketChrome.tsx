import { useState } from 'react';
import { useInterval } from '../hooks/useClock';
import { formatMss } from '../lib/format';
import { KIDS_SCOREBOARDS_NAME, kidsSkinLabel, kidsWinLines, type KidsSkinId } from '../lib/kidsScoreboard';
import { remainingNow, type MatchState } from '../lib/matchStore';
import { CarlosCheer } from './CarlosCheer';

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
      {win ? <CarlosCheer lines={winLines} /> : null}
    </>
  );
}
