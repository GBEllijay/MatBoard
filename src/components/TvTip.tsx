import { useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { dismissTvTip, tvTipDismissed, tvTipHiddenOnWhiteBoard } from '../lib/tvTip';

type Props = {
  onFullscreen?: () => void;
};

/** One-time desktop/TV hint. CSS hides it on phones; dismiss persists in localStorage. */
export function TvTip({ onFullscreen }: Props) {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const [open, setOpen] = useState(() => !tvTipDismissed());
  const hiddenOnWhite = tvTipHiddenOnWhiteBoard(pathname, searchParams.get('from'));

  if (!open || hiddenOnWhite) return null;

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
