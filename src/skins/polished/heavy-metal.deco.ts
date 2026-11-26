// Hellfire Stage decorations. Original art only: stage rig, amp stacks, flames, and embers.
// No names, scores, or labels. Every piece is pointer-events: none in heavy-metal.css.

/** Small seeded generator so the embers are the same on every render. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const EMBER_COLORS = ['#FFE2C4', '#FFB070', '#FF7A2A', '#FF4A14'] as const;

function embers(): string {
  const rnd = seeded(20261126);
  let html = '<div class="embers">';
  for (let i = 0; i < 34; i += 1) {
    const color = EMBER_COLORS[Math.floor(rnd() * EMBER_COLORS.length)];
    const size = (0.2 + rnd() * 0.4).toFixed(2);
    const left = (rnd() * 100).toFixed(1);
    // Most embers hang low, near the pyro.
    const top = (rnd() < 0.7 ? 55 + rnd() * 45 : rnd() * 55).toFixed(1);
    const delay = (-rnd() * 6).toFixed(1);
    const opacity = (0.45 + rnd() * 0.5).toFixed(2);
    html += `<i class="ember" style="left:${left}%;top:${top}%;width:${size}vh;height:${size}vh;background:${color};box-shadow:0 0 ${(Number(size) * 3).toFixed(1)}vh ${color};opacity:${opacity};animation-delay:${delay}s"></i>`;
  }
  return `${html}</div>`;
}

/** Five par-can lamps on a truss, each throwing a soft beam. */
function rig(): string {
  const lamps = [
    { left: 10, angle: -14, hue: 'r' },
    { left: 30, angle: -5, hue: 'o' },
    { left: 50, angle: 0, hue: 'r' },
    { left: 70, angle: 5, hue: 'o' },
    { left: 90, angle: 14, hue: 'r' },
  ];
  const items = lamps
    .map((lamp) => `<i class="lamp ${lamp.hue}" style="left:${lamp.left}%;--a:${lamp.angle}deg"></i>`)
    .join('');
  return `<div class="rig"><span class="truss"></span>${items}</div>`;
}

const STAGE = `<div class="bg"></div>${rig()}<div class="amp l"></div><div class="amp r"></div><div class="flames-bot"></div>${embers()}`;

export const SCOREBOARD_DECO = STAGE;
export const TIMER_DECO = STAGE;
export const TIMER_REST_DECO: string | null = null;

const ROW = '<i class="rail"></i><i class="rv r1"></i><i class="rv r2"></i><i class="rv r3"></i><i class="rv r4"></i>';
export const ROW_EXTRA: readonly [string, string] | null = [ROW, ROW];
