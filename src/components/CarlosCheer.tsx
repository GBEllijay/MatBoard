import { CARLOS_ASSET } from '../lib/kidsScoreboard';

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

/** Grand Master Carlos slide-in. Shared by the bracket champion and the match scoreboard. */
export function CarlosCheer({ lines, board = false }: { lines: readonly string[]; board?: boolean }) {
  const lastIsScore = lines.length > 2;
  return (
    <div className={`kids-carlos${board ? ' kids-carlos--board' : ''}`} role="status">
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
          {lines.map((line, index) => (
            <span
              key={`${index}-${line}`}
              className={
                index === 0
                  ? 'kids-carlos__cheer'
                  : lastIsScore && index === lines.length - 1
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
  );
}
