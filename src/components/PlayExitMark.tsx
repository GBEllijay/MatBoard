import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useHoldPress } from '../hooks/useHoldPress';
import { exitPageFullscreen } from '../lib/fullscreen';
import {
  PLAY_EXIT_HOLD_MS,
  PLAY_EXIT_HOME,
  playExitDestination,
  playExitKeepsParentExit,
  playExitLabel,
} from '../lib/playExit';

/** Drift past this and the press is a scroll, not a hold-for-home. */
const MOVE_CANCEL_PX = 12;

type Props = {
  /** Exit play (fullscreen) then go to `to`. Omit to navigate immediately. */
  onExit?: () => void;
  /** Parent page. White tools go to `/white`; Pro/Coach tools go to `/pro` or `/coach`. */
  to?: string;
};

/**
 * Top-left Advantage mark on play and manage screens.
 * Short press keeps today's parent exit. Long press goes to the public home page.
 * Hub screens use HomeMark (a single brand link), not this control.
 * Score-box holds and folder-row drags are different targets, so they do not share this gesture.
 */
export function PlayExitMark({ onExit, to = PLAY_EXIT_HOME }: Props) {
  const navigate = useNavigate();
  const held = useRef(false);
  const skipClick = useRef(false);
  const origin = useRef({ x: 0, y: 0, id: -1 });
  const node = useRef<HTMLAnchorElement | null>(null);
  const [armed, setArmed] = useState(false);

  const goHome = () => {
    void exitPageFullscreen().finally(() => {
      navigate(playExitDestination(to, true));
    });
  };

  const handlers = useHoldPress(
    () => {},
    () => {
      held.current = true;
      if (playExitKeepsParentExit(to, true)) return;
      setArmed(true);
      const el = node.current;
      if (el) {
        try {
          el.setPointerCapture(origin.current.id);
        } catch {
          /* capture can fail if the pointer already ended */
        }
      }
      if (typeof navigator.vibrate === 'function') navigator.vibrate(12);
    },
    PLAY_EXIT_HOLD_MS,
    { capture: false },
  );

  return (
    <Link
      ref={node}
      to={to}
      draggable={false}
      className={armed ? 'play-exit is-armed' : 'play-exit'}
      aria-label={playExitLabel(to)}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.button !== 0 && event.pointerType === 'mouse') return;
        held.current = false;
        skipClick.current = false;
        setArmed(false);
        origin.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        handlers.onPointerDown(event);
      }}
      onPointerMove={(event) => {
        if (held.current || event.pointerId !== origin.current.id) return;
        const dx = event.clientX - origin.current.x;
        const dy = event.clientY - origin.current.y;
        if (Math.hypot(dx, dy) <= MOVE_CANCEL_PX) return;
        handlers.onPointerCancel();
      }}
      onPointerLeave={() => {
        if (held.current) return;
        handlers.onPointerCancel();
      }}
      onPointerUp={(event) => {
        const wasHeld = held.current;
        handlers.onPointerUp(event);
        if (!wasHeld || playExitKeepsParentExit(to, true)) return;
        held.current = false;
        setArmed(false);
        skipClick.current = true;
        event.stopPropagation();
        goHome();
      }}
      onPointerCancel={() => {
        held.current = false;
        setArmed(false);
        handlers.onPointerCancel();
      }}
      onLostPointerCapture={handlers.onLostPointerCapture}
      onContextMenu={handlers.onContextMenu}
      onDragStart={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        if (skipClick.current) {
          skipClick.current = false;
          event.preventDefault();
          return;
        }
        if (!onExit) return;
        event.preventDefault();
        onExit();
      }}
    >
      <img src="/advantage-icon.png" alt="" draggable={false} width={713} height={713} />
    </Link>
  );
}
