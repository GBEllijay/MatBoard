/**
 * Thin progress ring from the polished mock (decos.py ring_svg), ported so progress is live.
 * A rounded rect starting top-centre, clockwise: track, gradient-along-arc progress made of
 * butt-capped dash segments, round caps, optional glow and end dot.
 */

export type RingStop = readonly [number, string];

type Seg =
  | { kind: 'L'; a: [number, number]; b: [number, number] }
  | { kind: 'A'; c: [number, number]; from: number; to: number };

const f2 = (n: number) => n.toFixed(2);
const f3 = (n: number) => n.toFixed(3);

export function rrectPath(w: number, h: number, radius: number, inset: number) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const r = Math.max(0, Math.min(radius, (y1 - y0) / 2, (x1 - x0) / 2));
  const cx = w / 2;
  const d =
    `M${f2(cx)} ${f2(y0)} H${f2(x1 - r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x1)} ${f2(y0 + r)} V${f2(y1 - r)} ` +
    `A${f2(r)} ${f2(r)} 0 0 1 ${f2(x1 - r)} ${f2(y1)} H${f2(x0 + r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x0)} ${f2(y1 - r)} ` +
    `V${f2(y0 + r)} A${f2(r)} ${f2(r)} 0 0 1 ${f2(x0 + r)} ${f2(y0)} Z`;
  const q = (Math.PI * r) / 2;
  const segs: Seg[] = [
    { kind: 'L', a: [cx, y0], b: [x1 - r, y0] },
    { kind: 'A', c: [x1 - r, y0 + r], from: -90, to: 0 },
    { kind: 'L', a: [x1, y0 + r], b: [x1, y1 - r] },
    { kind: 'A', c: [x1 - r, y1 - r], from: 0, to: 90 },
    { kind: 'L', a: [x1 - r, y1], b: [x0 + r, y1] },
    { kind: 'A', c: [x0 + r, y1 - r], from: 90, to: 180 },
    { kind: 'L', a: [x0, y1 - r], b: [x0, y0 + r] },
    { kind: 'A', c: [x0 + r, y0 + r], from: 180, to: 270 },
    { kind: 'L', a: [x0 + r, y0], b: [cx, y0] },
  ];
  const length = (s: Seg) => (s.kind === 'L' ? Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) : q);
  const total = segs.reduce((sum, s) => sum + length(s), 0);
  const point = (f: number): [number, number] => {
    let left = f * total;
    for (const s of segs) {
      const l = length(s);
      if (left <= l + 1e-9) {
        const t = l ? left / l : 0;
        if (s.kind === 'L') return [s.a[0] + (s.b[0] - s.a[0]) * t, s.a[1] + (s.b[1] - s.a[1]) * t];
        const ang = ((s.from + (s.to - s.from) * t) * Math.PI) / 180;
        return [s.c[0] + r * Math.cos(ang), s.c[1] + r * Math.sin(ang)];
      }
      left -= l;
    }
    return [cx, y0];
  };
  return { d, point };
}

export function lerpHex(stops: readonly RingStop[], t: number): string {
  for (let i = 0; i < stops.length - 1; i += 1) {
    const [a, ca] = stops[i];
    const [b, cb] = stops[i + 1];
    if (t <= b) {
      const u = b > a ? (t - a) / (b - a) : 0;
      const A = [1, 3, 5].map((k) => parseInt(ca.slice(k, k + 2), 16));
      const B = [1, 3, 5].map((k) => parseInt(cb.slice(k, k + 2), 16));
      return `#${A.map((v, j) => Math.round(v + (B[j] - v) * u).toString(16).padStart(2, '0').toUpperCase()).join('')}`;
    }
  }
  return stops[stops.length - 1][1];
}

export type RingOptions = {
  cls: string;
  w: number;
  h: number;
  r: number;
  sw: number;
  /** Progress 0..1 (1 = full ring). */
  p: number;
  stops: readonly RingStop[];
  track: string;
  dot?: readonly [number, string, string];
  glow?: readonly [number, number];
  n?: number;
};

export function ringSvg({ cls, w, h, r, sw, p, stops, track, dot, glow, n = 140 }: RingOptions): string {
  const prog = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  const { d, point } = rrectPath(w, h, r, sw / 2 + (dot ? sw : 0));
  let segs = '';
  for (let i = 0; i < n; i += 1) {
    const a = (prog * i) / n;
    const b = (prog * (i + 1)) / n;
    const c = lerpHex(stops, (i + 0.5) / n);
    segs += `<path d="${d}" pathLength="1000" stroke="${c}" stroke-dasharray="${f3((b - a) * 1000 + 0.6)} 2000" stroke-dashoffset="${f3(-a * 1000)}"/>`;
  }
  const [sx, sy] = point(0);
  const [ex, ey] = point(prog);
  const caps =
    `<circle cx="${f2(sx)}" cy="${f2(sy)}" r="${f2(sw / 2)}" fill="${stops[0][1]}"/>` +
    `<circle cx="${f2(ex)}" cy="${f2(ey)}" r="${f2(sw / 2)}" fill="${stops[stops.length - 1][1]}"/>`;
  const body = segs + caps;
  const g = glow
    ? `<g filter="url(#${cls}-b)" opacity="${glow[1]}" fill="none" stroke-width="${f2(sw * 1.6)}">${body}</g>`
    : '';
  const dt = dot
    ? `<circle cx="${f2(ex)}" cy="${f2(ey)}" r="${f2(dot[0])}" fill="${dot[1]}" style="filter:drop-shadow(0 0 ${(dot[0] * 1.2).toFixed(1)}px ${dot[2]})"/>`
    : '';
  return (
    `<svg class="${cls}" viewBox="0 0 ${w.toFixed(1)} ${h.toFixed(1)}" preserveAspectRatio="none" aria-hidden="true">` +
    `<defs><filter id="${cls}-b" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="${glow ? glow[0] : 0}"/></filter></defs>` +
    `<path d="${d}" fill="none" stroke="${track}" stroke-width="${sw}"/>${g}` +
    `<g fill="none" stroke-width="${sw}">${body}</g>${dt}</svg>`
  );
}

export const KEYNOTE_WORK_STOPS: readonly RingStop[] = [
  [0, '#4B5BFF'],
  [0.45, '#0A84FF'],
  [1, '#8BE0FF'],
];
export const KEYNOTE_REST_STOPS: readonly RingStop[] = [
  [0, '#24A148'],
  [0.6, '#30D158'],
  [1, '#A8FFC0'],
];

/** Keynote: 84vw x 76vh box, r 96, stroke 7, glow, end dot. */
export function keynoteRing(vw: number, vh: number, p: number, rest: boolean): string {
  return ringSvg({
    cls: 'kring',
    w: vw * 0.84,
    h: vh * 0.76,
    r: 96 * Math.min(1, vh / 600),
    sw: 7,
    p,
    stops: rest ? KEYNOTE_REST_STOPS : KEYNOTE_WORK_STOPS,
    track: 'rgba(255,255,255,.07)',
    dot: [7.5, '#FFFFFF', rest ? '#9BFFB4' : '#7FDBFF'],
    glow: [9, 0.75],
  });
}

/** Brasil: white ring round the globe on a navy track. */
export function brasilRing(vw: number, vh: number, p: number): string {
  const h = vh * 0.58 + 22;
  return ringSvg({
    cls: 'gring',
    w: vw * 0.68 + 22,
    h,
    r: h / 2,
    sw: 8,
    p,
    stops: [
      [0, '#FFFFFF'],
      [1, '#FFFFFF'],
    ],
    track: 'rgba(0,26,82,.55)',
    n: 2,
  });
}
