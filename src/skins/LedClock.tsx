/**
 * 7-segment LED wall clock digits for the LED Gym Wall Clock timer skin.
 * Renders crisp beveled SVG segments with faint unlit ghost segments behind them.
 */

const SEGMENTS: Record<string, readonly boolean[]> = {
  //        a      b      c      d      e      f      g
  '0': [true, true, true, true, true, true, false],
  '1': [false, true, true, false, false, false, false],
  '2': [true, true, false, true, true, false, true],
  '3': [true, true, true, true, false, false, true],
  '4': [false, true, true, false, false, true, true],
  '5': [true, false, true, true, false, true, true],
  '6': [true, false, true, true, true, true, true],
  '7': [true, true, true, false, false, false, false],
  '8': [true, true, true, true, true, true, true],
  '9': [true, true, true, true, false, true, true],
};

// Segment polygon paths inside a 64x112 viewBox (classic slightly-slanted / beveled LED bar)
const PATHS = [
  // a (top)
  'M 13 8 L 19 3 L 45 3 L 51 8 L 45 14 L 19 14 Z',
  // b (top-right)
  'M 54 11 L 59 16 L 59 48 L 53 54 L 47 48 L 47 17 Z',
  // c (bottom-right)
  'M 53 58 L 59 64 L 59 96 L 54 101 L 47 95 L 47 64 Z',
  // d (bottom)
  'M 19 98 L 45 98 L 51 104 L 45 109 L 19 109 L 13 104 Z',
  // e (bottom-left)
  'M 11 58 L 17 64 L 17 95 L 10 101 L 5 96 L 5 64 Z',
  // f (top-left)
  'M 10 11 L 17 17 L 17 48 L 11 54 L 5 48 L 5 16 Z',
  // g (middle)
  'M 13 56 L 19 50 L 45 50 L 51 56 L 45 62 L 19 62 Z',
] as const;

function LedDigit({ digit }: { digit: string }) {
  const active = SEGMENTS[digit] ?? SEGMENTS['0'];
  return (
    <svg className="wt-led-digit" viewBox="0 0 64 112" aria-hidden="true">
      {PATHS.map((d, index) => (
        <path
          key={index}
          d={d}
          className={active[index] ? 'wt-led-seg wt-led-seg--on' : 'wt-led-seg wt-led-seg--off'}
        />
      ))}
    </svg>
  );
}

export function LedClock({ mmss }: { mmss: string }) {
  return (
    <span className="wt-led-clock" aria-hidden="true">
      {mmss.split('').map((ch, index) =>
        ch === ':' ? (
          <span key={`sep-${index}`} className="wt-led-colon">
            <span className="wt-led-dot" />
            <span className="wt-led-dot" />
          </span>
        ) : (
          <LedDigit key={index} digit={ch} />
        ),
      )}
    </span>
  );
}
