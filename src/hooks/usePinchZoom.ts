import { useLayoutEffect, type RefObject } from 'react';
import {
  DEFAULT_VIEWPORT,
  TOURNAMENT_VIEWPORT,
  clampScale,
  focalScroll,
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

/**
 * Lock Safari page zoom while the bracket is open. Pinching scales the diagram
 * with a transform. Viewport zoom changes `visualViewport` and reflows the tree.
 */
export function useLockViewportZoom(): void {
  useLayoutEffect(() => {
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
 * Pinch-zoom the bracket as a fixed diagram. The tree's column tracks stay put;
 * only `transform: scale` changes, and the spacer matches that visual size so
 * pan is native overflow scroll.
 */
export function usePinchZoom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
): void {
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    const spacer = content?.parentElement;
    if (!scroller || !content || !spacer) return;

    let scale = 1;
    let minScale = 1;
    let pinching = false;
    let startScale = 1;
    let startDistance = 0;

    const paint = () => {
      const w = content.offsetWidth;
      const h = content.offsetHeight;
      if (w < 1 || h < 1) return;
      spacer.style.width = `${Math.ceil(w * scale)}px`;
      spacer.style.height = `${Math.ceil(h * scale)}px`;
      content.style.transformOrigin = '0 0';
      content.style.transform = scale === 1 ? '' : `scale(${scale})`;
    };

    const updateMin = () => {
      const w = content.offsetWidth;
      const h = content.offsetHeight;
      if (w < 1 || h < 1) return;
      minScale = minScaleForView(scroller.clientWidth, scroller.clientHeight, w, h);
    };

    const applyScale = (next: number) => {
      scale = clampScale(next, minScale);
      paint();
    };

    const measure = () => {
      if (pinching) return;
      updateMin();
      applyScale(scale);
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
      const rect = scroller.getBoundingClientRect();
      const clientX = (event.touches[0].clientX + event.touches[1].clientX) / 2;
      const clientY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
      const offsetX = clientX - rect.left;
      const offsetY = clientY - rect.top;
      const prevScale = scale;
      const prevLeft = scroller.scrollLeft;
      const prevTop = scroller.scrollTop;
      const distance = touchDistance(event.touches[0], event.touches[1]);
      applyScale(pinchScale(startScale, startDistance, distance));
      scroller.scrollLeft = focalScroll(prevLeft, offsetX, prevScale, scale);
      scroller.scrollTop = focalScroll(prevTop, offsetY, prevScale, scale);
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length >= 2) return;
      if (!pinching) return;
      pinching = false;
      measure();
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = scroller.getBoundingClientRect();
      const prevScale = scale;
      const prevLeft = scroller.scrollLeft;
      const prevTop = scroller.scrollTop;
      applyScale(scale * (event.deltaY < 0 ? 1.08 : 0.92));
      scroller.scrollLeft = focalScroll(prevLeft, event.clientX - rect.left, prevScale, scale);
      scroller.scrollTop = focalScroll(prevTop, event.clientY - rect.top, prevScale, scale);
    };

    const onGesture = (event: Event) => {
      event.preventDefault();
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    ro.observe(content);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    scroller.addEventListener('touchstart', onTouchStart, { passive: true });
    scroller.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    scroller.addEventListener('touchend', onTouchEnd);
    scroller.addEventListener('touchcancel', onTouchEnd);
    scroller.addEventListener('wheel', onWheel, { passive: false });
    scroller.addEventListener('gesturestart', onGesture, { passive: false });
    scroller.addEventListener('gesturechange', onGesture, { passive: false });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      scroller.removeEventListener('touchstart', onTouchStart);
      scroller.removeEventListener('touchmove', onTouchMove, true);
      scroller.removeEventListener('touchend', onTouchEnd);
      scroller.removeEventListener('touchcancel', onTouchEnd);
      scroller.removeEventListener('wheel', onWheel);
      scroller.removeEventListener('gesturestart', onGesture);
      scroller.removeEventListener('gesturechange', onGesture);
      content.style.transform = '';
      content.style.transformOrigin = '';
      spacer.style.width = '';
      spacer.style.height = '';
    };
  }, [scrollerRef, contentRef]);
}
