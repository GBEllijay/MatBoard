import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { placeBandFigure } from './GrandmasterCheer';
import {
  DQ_DISAPPOINTED_SAFETY_MS,
  DQ_DISAPPOINTED_STILL,
  DQ_DISAPPOINTED_STILL_MS,
  DQ_DISAPPOINTED_VIDEO,
  readDqDisappointedMedia,
} from '../lib/dqDisappointed';

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
    const figure = root.querySelector('.dq-disappointed__figure');
    if (!(figure instanceof HTMLElement)) return;
    let alive = true;
    const place = () => {
      if (alive) placeBandFigure(root, figure, null);
    };
    place();
    window.addEventListener('resize', place);
    void document.fonts?.ready.then(place);
    return () => {
      alive = false;
      window.removeEventListener('resize', place);
    };
  }, [still]);

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
