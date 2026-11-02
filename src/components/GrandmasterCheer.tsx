import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BAND_FIGURE_PHONE_MAX_PX,
  PHONE_BAND_FIGURE_WIDTH_PX,
  isPhoneBand,
  phoneBandFigureBox,
  splashFigureGutter,
} from '../lib/bandFigureLayout';
import {
  grandmasterById,
  isGrandmasterId,
  pickGrandmaster,
  readLastGrandmasterId,
  writeLastGrandmasterId,
  type GrandmasterId,
} from '../lib/grandmasters';

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

function boxStyle(box: { left: number; top: number; width: number; height: number }) {
  return {
    left: `${box.left}%`,
    top: `${box.top}%`,
    width: `${box.width}%`,
    height: `${box.height}%`,
  };
}

type Box = { left: number; top: number; right: number; bottom: number };

function overlaps(a: Box, b: Box): boolean {
  const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return ix > 1 && iy > 1;
}

function boxOf(node: Element): Box {
  const rect = node.getBoundingClientRect();
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
}

function tightBox(node: HTMLElement): Box {
  const range = document.createRange();
  range.selectNodeContents(node);
  const rect = range.getBoundingClientRect();
  if (rect.width > 2 && rect.height > 2) {
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
  }
  return boxOf(node);
}

function visibleBoxes(nodes: Element[], tight: boolean): Box[] {
  return nodes
    .filter((node): node is HTMLElement => node instanceof HTMLElement)
    .map((node) => (tight ? tightBox(node) : boxOf(node)))
    .filter((box) => box.right - box.left > 2 && box.bottom - box.top > 2);
}

function padBox(box: Box, amount: number): Box {
  return {
    left: box.left - amount,
    top: box.top - amount,
    right: box.right + amount,
    bottom: box.bottom + amount,
  };
}

/** Names, gyms, score cards, and the header links (Home, Controller). Never covered. */
function hardObstacles(display: HTMLElement): Box[] {
  return [
    ...visibleBoxes([...display.querySelectorAll('.score, .display__chrome a')], false),
    ...visibleBoxes([...display.querySelectorAll('.bout__who h1, .bout__who p')], false),
  ].map((box) => padBox(box, 4));
}

type Weighted = { box: Box; weight: number };

/**
 * Clock digits and the round label. The winner splash counts more, so the
 * bubble steps off "Winner by submission" when another spot is open.
 * The right-hand clock status ("Ended" / "Paused") is not listed: that word
 * sits in the empty end of the band, which is where the figure stands.
 */
function softObstacles(display: HTMLElement): Weighted[] {
  const pad = (boxes: Box[], weight: number) => boxes.map((box) => ({ box: padBox(box, 2), weight }));
  return [
    ...pad(visibleBoxes([...display.querySelectorAll('.clock-btn, .display__meta')], true), 1),
    ...pad(
      visibleBoxes([...display.querySelectorAll('.display-splash__name, .display-splash__line')], true),
      4,
    ),
  ];
}

type Slot = { box: Box; speechTop: number; rank: number };

function betterSlot(next: Slot, prev: Slot): boolean {
  if (next.rank !== prev.rank) return next.rank < prev.rank;
  if (next.box.right > prev.box.right + 12) return true;
  if (prev.box.right > next.box.right + 12) return false;
  const nextH = next.box.bottom - next.box.top;
  const prevH = prev.box.bottom - prev.box.top;
  if (nextH > prevH + 8) return true;
  if (prevH > nextH + 8) return false;
  return Math.abs(next.speechTop - next.box.top) < Math.abs(prev.speechTop - prev.box.top);
}

/**
 * Right end of the clock band, feet on the band's bottom edge.
 * The body may rise into the row above only while it still misses every hard obstacle.
 * `speech` is the bubble to the figure's left; pass zeros when the figure has none.
 */
function softCost(target: Box, soft: Weighted[]): number {
  let cost = 0;
  for (const block of soft) {
    if (overlaps(target, block.box)) cost += block.weight;
  }
  return cost;
}

function findBandSlot(
  displayBox: Box,
  bandBox: Box,
  hard: Box[],
  soft: Weighted[],
  speechW: number,
  speechH: number,
  rightInset: number,
): Slot | null {
  const aspect = 845 / 1200;
  const margin = 8;
  const bandHeight = bandBox.bottom - bandBox.top;
  if (bandHeight < 48) return null;
  const minHeight = Math.min(96, Math.max(64, bandHeight * 0.7));
  const maxHeight = Math.min(280, Math.max(bandHeight, bandHeight + 48));
  let best: Slot | null = null;

  for (let height = maxHeight; height >= minHeight; height -= 8) {
    const width = height * aspect;
    for (let right = displayBox.right - rightInset; right - width >= displayBox.left + margin; right -= 8) {
      const left = right - width;
      const bottom = bandBox.bottom;
      const top = bottom - height;
      const box = { left, top, right, bottom };
      if (top < displayBox.top + margin || left < displayBox.left + margin) continue;
      if (hard.some((block) => overlaps(box, block))) continue;
      const figureCost = softCost(box, soft) * 3;
      if (speechH <= 0) {
        const candidate = { box, speechTop: top, rank: figureCost };
        if (!best || betterSlot(candidate, best)) best = candidate;
        continue;
      }
      const speechLeft = left - speechW;
      if (speechLeft < displayBox.left + 2) continue;
      const speechTopMin = displayBox.top + margin;
      const speechTopMax = Math.min(displayBox.bottom - speechH - margin, bottom - 4);
      for (let speechTop = speechTopMin; speechTop <= speechTopMax; speechTop += 14) {
        const speech = { left: speechLeft, top: speechTop, right: left - 8, bottom: speechTop + speechH };
        if (hard.some((block) => overlaps(speech, block))) continue;
        const candidate = { box, speechTop, rank: figureCost + softCost(speech, soft) };
        if (!best || betterSlot(candidate, best)) best = candidate;
      }
    }
  }
  return best;
}

/**
 * Last resort: stand in the gap between the name text and the Points card,
 * sized down so the figure and its bubble both fit there.
 */
function findRowSlot(
  display: HTMLElement,
  displayBox: Box,
  hard: Box[],
  soft: Weighted[],
  speechW: number,
  speechH: number,
): Slot | null {
  const aspect = 845 / 1200;
  let best: Slot | null = null;
  for (const bout of display.querySelectorAll('.bout')) {
    if (!(bout instanceof HTMLElement)) continue;
    const who = bout.querySelector('.bout__who h1');
    const points = bout.querySelector('.score');
    if (!(who instanceof HTMLElement) || !(points instanceof HTMLElement)) continue;
    const name = tightBox(who);
    const card = boxOf(points);
    const boutBox = boxOf(bout);
    const gapLeft = name.right + 8;
    const gapRight = card.left - 8;
    if (gapRight - gapLeft < 56) continue;
    let width = gapRight - gapLeft - speechW;
    if (width < 48) width = Math.min(gapRight - gapLeft - 8, 96);
    let height = width / aspect;
    const maxHeight = Math.max(48, boutBox.bottom - boutBox.top - 8);
    if (height > maxHeight) {
      height = maxHeight;
      width = height * aspect;
    }
    const bottom = Math.min(boutBox.bottom - 4, displayBox.bottom - 8);
    const top = bottom - height;
    const right = gapRight;
    const left = right - width;
    const box = { left, top, right, bottom };
    const speechTop = Math.max(top + 4, displayBox.top + 4);
    const speech = { left: left - speechW, top: speechTop, right: left - 8, bottom: speechTop + speechH };
    const blocks = speech.left < gapLeft ? [box] : [box, speech];
    const covers = (block: Box) => blocks.some((part) => overlaps(part, block));
    if (hard.some(covers)) continue;
    if (box.top < displayBox.top || box.left < displayBox.left) continue;
    const candidate = { box, speechTop, rank: 20 + softCost(box, soft) };
    if (!best || betterSlot(candidate, best)) best = candidate;
  }
  return best;
}

const gutterWatch = new WeakMap<HTMLElement, MutationObserver>();

/** Drop the phone splash inset. Desktop never sets it. Safe to call twice. */
export function clearBandFigureGutter(display: HTMLElement): void {
  display.classList.remove('display--band-figure');
  display.style.removeProperty('--band-figure-gutter');
  for (const node of display.querySelectorAll('.display-splash__name, .display-splash__line')) {
    if (node instanceof HTMLElement) node.style.fontSize = '';
  }
}

function untrackGutter(root: HTMLElement) {
  const prev = gutterWatch.get(root);
  prev?.disconnect();
  gutterWatch.delete(root);
}

/** Clear the gutter in the same turn the figure node leaves the board. */
function trackGutterUntilLeave(root: HTMLElement, display: HTMLElement) {
  untrackGutter(root);
  const parent = root.parentElement;
  if (!parent) return;
  const obs = new MutationObserver(() => {
    if (!root.isConnected) {
      clearBandFigureGutter(display);
      obs.disconnect();
      gutterWatch.delete(root);
    }
  });
  obs.observe(parent, { childList: true });
  gutterWatch.set(root, obs);
}

function bumpPlaceCount(root: HTMLElement) {
  const next = Number(root.dataset.placeCount ?? '0') + 1;
  root.dataset.placeCount = String(next);
}

function textHitsFigure(node: HTMLElement, figure: DOMRect): boolean {
  const range = document.createRange();
  range.selectNodeContents(node);
  const fig = { left: figure.left, top: figure.top, right: figure.right, bottom: figure.bottom };
  for (const rect of range.getClientRects()) {
    if (rect.width < 1 || rect.height < 1) continue;
    const box = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom };
    if (overlaps(box, fig)) return true;
  }
  return false;
}

/** After the gutter is reserved, shrink a line that still runs under the figure. */
function relaxSplashBeside(display: HTMLElement, figure: HTMLElement) {
  const figureBox = figure.getBoundingClientRect();
  const nodes = [...display.querySelectorAll('.display-splash__name, .display-splash__line')].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  for (const node of nodes) node.style.fontSize = '';
  for (const node of nodes) {
    if (!textHitsFigure(node, figureBox)) continue;
    const start = parseFloat(getComputedStyle(node).fontSize);
    if (!Number.isFinite(start)) continue;
    for (let size = Math.floor(start); size >= 13; size -= 1) {
      node.style.fontSize = `${size}px`;
      if (!textHitsFigure(node, figureBox)) break;
    }
  }
}

function reservePhoneGutter(root: HTMLElement, display: HTMLElement, figure: HTMLElement) {
  const viewportWidth = display.getBoundingClientRect().width;
  const gutter = splashFigureGutter(viewportWidth, figure.getBoundingClientRect().width, true);
  if (gutter <= 0) {
    clearBandFigureGutter(display);
    untrackGutter(root);
    return;
  }
  display.classList.add('display--band-figure');
  display.style.setProperty('--band-figure-gutter', `${gutter}px`);
  relaxSplashBeside(display, figure);
  trackGutterUntilLeave(root, display);
}

/**
 * Re-measure once the outcome banner has finished flying in.
 * The first pass can see the card mid-animation. Cheer and DQ both use this.
 */
export function watchSplashSettle(display: HTMLElement, place: () => void): () => void {
  const splash = display.querySelector('.display-splash__card');
  if (!(splash instanceof HTMLElement)) return () => {};
  const onSplash = () => place();
  splash.addEventListener('animationend', onSplash);
  const timer = window.setTimeout(onSplash, 750);
  return () => {
    splash.removeEventListener('animationend', onSplash);
    window.clearTimeout(timer);
  };
}

/**
 * Right end of the clock band. Feet on the band's bottom edge, rising into the
 * row above only while the body still misses every name, gym, score card, and
 * header link. A bubble sits to the figure's left. With no bubble the canvas
 * meets the right screen edge so a walk-off leaves the screen.
 * Under 600px the figure is a fixed width with no bubble, and the splash keeps
 * that width as padding so the banner wraps beside it.
 */
export function placeBandFigure(root: HTMLElement, figure: HTMLElement, bubble: HTMLElement | null): boolean {
  const display = root.closest('.display');
  const band = display?.querySelector('.display__mid');
  if (!(display instanceof HTMLElement) || !(band instanceof HTMLElement)) return false;
  const displayBox = boxOf(display);
  const bandBox = boxOf(band);
  const viewportWidth = displayBox.right - displayBox.left;
  if (isPhoneBand(viewportWidth)) {
    const phone = phoneBandFigureBox(displayBox, bandBox.bottom);
    const bandHeight = bandBox.bottom - bandBox.top;
    if (bandHeight >= 48 && phone.top >= displayBox.top - 1) {
      const rootBox = boxOf(root);
      figure.style.width = `${PHONE_BAND_FIGURE_WIDTH_PX}px`;
      figure.style.left = `${Math.round(phone.left - rootBox.left)}px`;
      figure.style.right = 'auto';
      figure.style.top = 'auto';
      figure.style.bottom = `${Math.round(rootBox.bottom - phone.bottom)}px`;
      reservePhoneGutter(root, display, figure);
      bumpPlaceCount(root);
      return true;
    }
  }
  clearBandFigureGutter(display);
  untrackGutter(root);
  const hard = hardObstacles(display);
  const soft = softObstacles(display);
  const bubbleBox = bubble?.getBoundingClientRect();
  const speechW = bubble ? Math.ceil(Math.max(180, bubbleBox?.width ?? 180) + 16) : 0;
  const speechH = bubble ? Math.ceil(Math.max(72, bubbleBox?.height ?? 72) + 8) : 0;
  const rightInset = bubble ? 8 : 0;
  const placed =
    findBandSlot(displayBox, bandBox, hard, soft, speechW, speechH, rightInset) ??
    (bubble ? findRowSlot(display, displayBox, hard, soft, speechW, speechH) : null);
  if (!placed) return false;
  const rootBox = boxOf(root);
  figure.style.width = `${Math.round(placed.box.right - placed.box.left)}px`;
  figure.style.left = `${Math.round(placed.box.left - rootBox.left)}px`;
  figure.style.right = 'auto';
  figure.style.top = 'auto';
  figure.style.bottom = `${Math.round(rootBox.bottom - placed.box.bottom)}px`;
  if (bubble) {
    bubble.style.minWidth = '180px';
    bubble.style.maxWidth = '16rem';
    bubble.style.left = 'auto';
    bubble.style.right = 'calc(100% + 0.45rem)';
    bubble.style.top = `${Math.round(placed.speechTop - placed.box.top)}px`;
    bubble.style.bottom = 'auto';
    bubble.style.transform = 'none';
  }
  bumpPlaceCount(root);
  return true;
}

function layoutBoardCheer(root: HTMLElement) {
  const figure = root.querySelector('.kids-grandmaster__figure');
  if (!(figure instanceof HTMLElement)) return;
  const bubbleNode = root.querySelector('.kids-grandmaster__bubble');
  const bubble = bubbleNode instanceof HTMLElement ? bubbleNode : null;
  placeBandFigure(root, figure, bubble);
}

function usePhoneBand(): boolean {
  const query = `(max-width: ${BAND_FIGURE_PHONE_MAX_PX}px)`;
  const [phone, setPhone] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setPhone(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [query]);
  return phone;
}

/** Query hook so a test can show one master on the TV and the controller together. */
export function grandmasterIdFromLocation(): GrandmasterId | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = new URLSearchParams(window.location.search).get('grandmaster');
    return isGrandmasterId(value) ? value : null;
  } catch {
    return null;
  }
}

/** Grandmaster slide-in. Shared by the bracket champion, the match scoreboard, and the blue-belt graduation. */
export function GrandmasterCheer({
  lines,
  board = false,
  corner = false,
  onDismiss,
  masterId = null,
}: {
  lines: readonly string[];
  board?: boolean;
  /** Bracket dock: small, in the reserved corner, not over the tree. */
  corner?: boolean;
  /** Optional close control. The overlay itself does not take taps. */
  onDismiss?: () => void;
  /** Synced pick. When omitted, this cheer chooses once and skips the master shown last. */
  masterId?: GrandmasterId | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const forced = grandmasterIdFromLocation();
  const [localPick] = useState<GrandmasterId>(() => forced ?? masterId ?? pickGrandmaster(readLastGrandmasterId()));
  const id = forced ?? masterId ?? localPick;
  const master = grandmasterById(id);
  const lastIsScore = lines.length > 2;
  const phoneBand = usePhoneBand();
  const showBubble = !(board && phoneBand);

  useEffect(() => {
    if (forced) return;
    writeLastGrandmasterId(id);
  }, [forced, id]);

  useLayoutEffect(() => {
    if (!board) return;
    const root = rootRef.current;
    if (!root) return;
    let alive = true;
    const place = () => {
      if (alive) layoutBoardCheer(root);
    };
    place();
    window.addEventListener('resize', place);
    void document.fonts?.ready.then(place);
    const display = root.closest('.display');
    const stopSplash = display instanceof HTMLElement ? watchSplashSettle(display, place) : () => {};
    return () => {
      alive = false;
      window.removeEventListener('resize', place);
      stopSplash();
      if (display instanceof HTMLElement) clearBandFigureGutter(display);
    };
  }, [board, id, lines, showBubble]);

  return (
    <div
      ref={rootRef}
      className={`kids-grandmaster kids-grandmaster--${id}${board ? ' kids-grandmaster--board' : ''}${corner ? ' kids-grandmaster--corner' : ''}${onDismiss ? ' kids-grandmaster--dismiss' : ''}`}
      data-grandmaster={id}
      role="status"
    >
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
      <figure className="kids-grandmaster__figure">
        {showBubble ? (
          <p className="kids-grandmaster__bubble">
            {lines.map((line, index) => (
              <span
                key={`${index}-${line}`}
                className={
                  index === 0
                    ? 'kids-grandmaster__cheer'
                    : lastIsScore && index === lines.length - 1
                      ? 'kids-grandmaster__score'
                      : 'kids-grandmaster__name'
                }
              >
                {line}
              </span>
            ))}
          </p>
        ) : null}
        <div className="kids-grandmaster__portrait">
          <img className="kids-grandmaster__frame" src={master.src} alt="" width={845} height={1200} />
          {master.nodSrc ? (
            <img
              className="kids-grandmaster__frame kids-grandmaster__frame--nod"
              src={master.nodSrc}
              alt=""
              width={845}
              height={1200}
            />
          ) : null}
          <span className="kids-grandmaster__face" style={boxStyle(master.face)} aria-hidden="true" />
          {master.avoid.map((box) => (
            <span
              key={`${box.left}-${box.top}-${box.width}`}
              className="kids-grandmaster__avoid"
              style={boxStyle(box)}
              aria-hidden="true"
            />
          ))}
        </div>
      </figure>
      {onDismiss ? (
        <button type="button" className="ink-btn ink-btn--save kids-grandmaster__dismiss" onClick={onDismiss}>
          Got it
        </button>
      ) : null}
    </div>
  );
}
