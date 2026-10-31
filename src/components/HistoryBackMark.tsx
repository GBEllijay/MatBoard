import { Link, useNavigate } from 'react-router-dom';
import { historyBackStep } from '../lib/historyBack';

type Props = {
  /** Where back goes when there is no earlier in-app page (direct visit). */
  fallback: string;
};

/**
 * Top-left Advantage mark that goes back one page in history.
 * Same look and corner as PlayExitMark (.play-exit). Center HomeMark stays the Home link.
 * The href is the fallback so it still works without JS and on middle-click.
 */
export function HistoryBackMark({ fallback }: Props) {
  const navigate = useNavigate();
  return (
    <Link
      to={fallback}
      className="play-exit play-exit--history"
      aria-label="Back"
      draggable={false}
      data-fallback={fallback}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const step = historyBackStep(window.history.state);
        if (step === null) return; // Link navigates to the fallback.
        event.preventDefault();
        navigate(step);
      }}
    >
      <img src="/advantage-icon.png" alt="" draggable={false} width={713} height={713} />
    </Link>
  );
}
