import { useEffect, type RefObject } from 'react';
import {
  DEFAULT_VIEWPORT,
  TOURNAMENT_VIEWPORT,
  clampScale,
  minScaleForView,
  pinchScale,
} from '../lib/pinchZoom';

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function viewportMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="viewport"]');
}

/** Allow Safari pinch-out below 1 while this page is mounted. */
export function useAllowZoomOut(): void {
  useEffect(() => {
    const meta = viewportMeta();
    if (!meta) return;
    const prev = meta.getAttribute('content') ?? DEFAULT_VIEWPORT;
    meta.setAttribute('content', TOURNAMENT_VIEWPORT);
    return () => {
      meta.setAttribute('content', prev);
    };
  }, []);
}

/**
 * Pinch the bracket itself (CSS zoom) so a 16-person tree can shrink to fit.
 * One-finger pan stays native overflow scroll.
 */
export function usePinchZoom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;

    let scale = 1;
    let minScale = 1;
    let startScale = 1;
    let startDistance = 0;
    let pinching = false;

    const naturalSize = () => {
      const prev = content.style.zoom;
      content.style.zoom = '1';
      const size = { w: content.offsetWidth, h: content.offsetHeight };
      content.style.zoom = prev;
      return size;
    };

    const measure = () => {
      const { w, h } = naturalSize();
      minScale = minScaleForView(scroller.clientWidth, scroller.clientHeight, w, h);
      scale = clampScale(scale, minScale);
      content.style.zoom = String(scale);
    };

    const applyFromPinch = (distance: number) => {
      scale = clampScale(pinchScale(startScale, startDistance, distance), minScale);
      content.style.zoom = String(scale);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinching = false;
        return;
      }
      pinching = true;
      startDistance = touchDistance(event.touches[0], event.touches[1]);
      startScale = scale;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!pinching || event.touches.length !== 2) return;
      event.preventDefault();
      applyFromPinch(touchDistance(event.touches[0], event.touches[1]));
    };

    const onTouchEnd = () => {
      if (pinching && scroller) {
        pinching = false;
        measure();
      }
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const next = scale * (event.deltaY < 0 ? 1.08 : 0.92);
      scale = clampScale(next, minScale);
      content.style.zoom = String(scale);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchEnd);
    scroller.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
      scroller.removeEventListener('wheel', onWheel);
      content.style.zoom = '';
    };
  }, [scrollerRef, contentRef]);
}
