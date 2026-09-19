import { useEffect, useState } from 'react';
import { dismissTvTip, tvStationQuery, tvTipDismissed } from '../lib/tvTip';

type Props = {
  onFullscreen?: () => void;
};

/** One-time desktop/TV hint. Hidden after dismiss, and never shown on phones. */
export function TvTip({ onFullscreen }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (tvTipDismissed()) return;
    const mq = window.matchMedia(tvStationQuery());
    const sync = () => setOpen(mq.matches && !tvTipDismissed());
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  if (!open) return null;

  const close = () => {
    dismissTvTip();
    setOpen(false);
  };

  return (
    <div className="tv-tip" role="status">
      <span>Plug this computer into the TV · Press F for fullscreen</span>
      <div className="tv-tip__actions">
        {onFullscreen ? (
          <button
            type="button"
            className="tv-tip__go"
            onClick={(event) => {
              event.stopPropagation();
              onFullscreen();
              close();
            }}
          >
            Fullscreen
          </button>
        ) : null}
        <button
          type="button"
          className="tv-tip__dismiss"
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
