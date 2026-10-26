import { useState } from 'react';
import { useInterval } from '../hooks/useClock';
import { formatMss } from '../lib/format';
import { remainingNow, type MatchState } from '../lib/matchStore';
import { BRACKET_NAME_MAX } from '../lib/tournamentStore';
import { CarlosCheer } from './CarlosCheer';

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

/** Name painted on the bracket. Tap the pill to type. Blank stays blank. */
export function BracketHeadline({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="bracket-headline">
      <label className="bracket-headline__pill">
        <input
          value={value}
          maxLength={BRACKET_NAME_MAX}
          aria-label="Tournament title"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    </div>
  );
}

/** Live bout under the title. The title itself is BracketHeadline on every skin. */
export function KidsBracketChrome({
  liveLine,
  liveMatch,
}: {
  liveLine: string | null;
  liveMatch: Pick<MatchState, 'running' | 'startedAt' | 'remainingMs'> | null;
}) {
  if (!liveLine || !liveMatch) return null;
  return (
    <div className="kids-banner">
      <p className="kids-live" role="status">
        <span className="kids-live__badge">LIVE</span>
        <span>Current Match: {liveLine}</span>
        <KidsLiveClock match={liveMatch} />
      </p>
    </div>
  );
}

/** Reserved bottom corner. The figure stays in this strip so cards, SCORE, and Decision stay clear. */
export function KidsMascotDock({ lines }: { lines: readonly string[] }) {
  return (
    <div className="kids-mascot-dock">
      <CarlosCheer lines={lines} corner />
    </div>
  );
}
