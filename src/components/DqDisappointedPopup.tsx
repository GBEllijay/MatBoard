import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  DQ_DISAPPOINTED_SAFETY_MS,
  DQ_DISAPPOINTED_STILL,
  DQ_DISAPPOINTED_STILL_MS,
  DQ_DISAPPOINTED_VIDEO,
  readDqDisappointedMedia,
} from '../lib/dqDisappointed';

/** Sit on the disqualified athlete's row, clear of every score card. */
function layoutDqFigure(root: HTMLElement, side: 'blue' | 'white') {
  const display = root.closest('.display');
  const figure = root.querySelector('.dq-disappointed__figure');
  if (!(display instanceof HTMLElement) || !(figure instanceof HTMLElement)) return;
  const bout = display.querySelector(side === 'blue' ? '.bout--blue' : '.bout--white');
  if (!(bout instanceof HTMLElement)) return;
  const d = display.getBoundingClientRect();
  const b = bout.getBoundingClientRect();
  const scores = [...bout.querySelectorAll('.score')].filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (!scores.length) return;
  const rects = scores.map((node) => node.getBoundingClientRect());
  const scoreLeft = Math.min(...rects.map((rect) => rect.left));
  const scoreTop = Math.min(...rects.map((rect) => rect.top));
  const stacked = scoreLeft < b.left + 64;
  const pad = 8;
  const safeLeft = b.left + pad;
  const safeRight = (stacked ? b.right : scoreLeft) - pad;
  const safeTop = b.top + pad;
  const safeBottom = (stacked ? scoreTop : b.bottom) - pad;
  const safeW = Math.max(72, safeRight - safeLeft);
  const safeH = Math.max(72, safeBottom - safeTop);
  let figH = Math.min(safeH, 340);
  let figW = figH * (845 / 1200);
  if (figW > safeW) {
    figW = safeW;
    figH = figW * (1200 / 845);
  }
  figure.style.width = `${Math.round(figW)}px`;
  figure.style.left = `${Math.round(safeLeft - d.left)}px`;
  figure.style.right = 'auto';
  figure.style.bottom = `${Math.round(d.bottom - safeBottom)}px`;
}

/**
 * One walk-off when a DQ is recorded. Taps pass through to the board.
 * Reduced motion, Safari, and iOS show the still instead of a video box.
 */
export function DqDisappointedPopup({
  side,
  onFinished,
}: {
  side: 'blue' | 'white';
  onFinished: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<'still' | 'video'>(() => readDqDisappointedMedia());
  const [broken, setBroken] = useState(false);
  const still = media === 'still' || broken;

  useEffect(() => {
    const sync = () => setMedia(readDqDisappointedMedia());
    sync();
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const ms = still ? DQ_DISAPPOINTED_STILL_MS : DQ_DISAPPOINTED_SAFETY_MS;
    const timer = window.setTimeout(onFinished, ms);
    return () => window.clearTimeout(timer);
  }, [still, onFinished]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const place = () => layoutDqFigure(root, side);
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [side, still]);

  return (
    <div ref={rootRef} className={`dq-disappointed dq-disappointed--${side}`} role="status" aria-label="DQ reaction">
      <div className="dq-disappointed__figure">
        {still ? (
          <img src={DQ_DISAPPOINTED_STILL} alt="" width={845} height={1200} />
        ) : (
          <video
            src={DQ_DISAPPOINTED_VIDEO}
            autoPlay
            muted
            playsInline
            preload="auto"
            width={845}
            height={1200}
            onEnded={onFinished}
            onError={() => setBroken(true)}
          />
        )}
      </div>
    </div>
  );
}
