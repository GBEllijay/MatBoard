import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { classifyCoachSwipe, coachSwipeTarget, swipeGestureBlocked, swipeStartsInBrowserEdge } from '../lib/coachSwipe';

/**
 * Horizontal swipe between Coach tools on this page.
 * Listeners are passive so vertical scroll, text editing, and pinch stay native.
 */
export function useCoachPageSwipe(): void {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  const navigateRef = useRef(navigate);
  pathRef.current = pathname;
  navigateRef.current = navigate;

  useEffect(() => {
    let tracking = false;
    let startX = 0;
    let startY = 0;

    const start = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0];
      if (swipeStartsInBrowserEdge(touch.clientX, window.innerWidth) || swipeGestureBlocked(event.target)) {
        tracking = false;
        return;
      }
      startX = touch.clientX;
      startY = touch.clientY;
      tracking = true;
    };

    const move = (event: TouchEvent) => {
      if (event.touches.length !== 1) tracking = false;
    };

    const end = (event: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const direction = classifyCoachSwipe(touch.clientX - startX, touch.clientY - startY);
      if (!direction) return;
      const target = coachSwipeTarget(pathRef.current, direction);
      if (target) navigateRef.current(target);
    };

    const cancel = () => {
      tracking = false;
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: true });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
    };
  }, []);
}
