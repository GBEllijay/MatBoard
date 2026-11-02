import { useEffect, useState } from 'react';
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
export function DqDisappointedPopup({ onFinished }: { onFinished: () => void }) {
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

  return (
    <div className="dq-disappointed" role="status" aria-label="DQ reaction">
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
