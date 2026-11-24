import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  DEFAULT_VIEWPORT,
  TOURNAMENT_VIEWPORT,
  autoFitScale,
  clampScale,
  focalScroll,
  minScaleForView,
  pinchScale,
} from '../lib/pinchZoom';

export type PinchZoomApi = {
  fitToBoard: () => void;
  focusElement: (el: HTMLElement | null, options?: { minScale?: number }) => void;
};

export type PinchZoomOptions = {
  fitKey?: string | number;
  apiRef?: RefObject<PinchZoomApi | null>;
  onZoomStateChange?: (zoomedFromFit: boolean) => void;
};

function touchDistance(a: Touch, b: Touch): number {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function viewportMeta(): HTMLMetaElement | null {
  return document.querySelector('meta[name="viewport"]');
}

function innerViewBox(scroller: HTMLElement): { w: number; h: number } {
  let padX = 0;
  let padY = 0;
  try {
    const cs = getComputedStyle(scroller);
    padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  } catch {
    /* ignore */
  }
  return {
    w: Math.max(0, scroller.clientWidth - padX),
    h: Math.max(0, scroller.clientHeight - padY),
  };
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
 * Auto-fit and pinch-zoom the bracket as a fixed diagram. On load, resize, and
 * `fitKey` changes (e.g. tree size or Clean mode toggle), scales the diagram via
 * `autoFitScale` so 2–64 competitor trees fill TV and phone boards cleanly.
 * Two-finger pinch or Ctrl/Cmd+wheel zoom remains available anytime after.
 */
export function usePinchZoom(
  scrollerRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
  options?: PinchZoomOptions,
): void {
  const fitKey = options?.fitKey ?? '';
  const onZoomStateChangeRef = useRef(options?.onZoomStateChange);
  onZoomStateChangeRef.current = options?.onZoomStateChange;
  const apiRef = options?.apiRef;

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    const spacer = content?.parentElement;
    if (!scroller || !content || !spacer) return;

    let scale = 1;
    let fit = 1;
    let minScale = 1;
    let userZoomed = false;
    let pinching = false;
    let startScale = 1;
    let startDistance = 0;
    let lastZoomedFlag = false;

    const notifyZoomFlag = () => {
      const nextFlag = userZoomed && Math.abs(scale - fit) > 0.04;
      if (nextFlag !== lastZoomedFlag) {
        lastZoomedFlag = nextFlag;
        onZoomStateChangeRef.current?.(nextFlag);
      }
    };

    const paint = () => {
      const w = content.offsetWidth;
      const h = content.offsetHeight;
      if (w < 1 || h < 1) return;
      spacer.style.width = `${Math.ceil(w * scale)}px`;
      spacer.style.height = `${Math.ceil(h * scale)}px`;
      content.style.transformOrigin = '0 0';
      content.style.transform = scale === 1 ? '' : `scale(${scale})`;
      notifyZoomFlag();
    };

    const updateBounds = () => {
      const w = content.offsetWidth;
      const h = content.offsetHeight;
      if (w < 1 || h < 1) return false;
      const view = innerViewBox(scroller);
      if (view.w < 1 || view.h < 1) return false;
      fit = autoFitScale(view.w, view.h, w, h);
      minScale = Math.min(fit, minScaleForView(view.w, view.h, w, h));
      return true;
    };

    const applyScale = (next: number) => {
      scale = clampScale(next, minScale);
      paint();
    };

    const measure = () => {
      if (pinching) return;
      if (!updateBounds()) return;
      if (!userZoomed) {
        scale = clampScale(fit, minScale);
        paint();
        scroller.scrollLeft = 0;
        scroller.scrollTop = 0;
      } else {
        applyScale(scale);
      }
    };

    const fitToBoard = () => {
      userZoomed = false;
      if (!updateBounds()) return;
      scale = clampScale(fit, minScale);
      paint();
      if (typeof scroller.scrollTo === 'function') {
        scroller.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      } else {
        scroller.scrollLeft = 0;
        scroller.scrollTop = 0;
      }
    };

    const focusElement = (el: HTMLElement | null, focusOpts?: { minScale?: number }) => {
      if (!el) return;
      const targetMin = focusOpts?.minScale ?? 0.95;
      if (scale < targetMin) {
        userZoomed = true;
        applyScale(Math.max(scale, targetMin));
      }
      const sRect = scroller.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const targetLeft = scroller.scrollLeft + (eRect.left - sRect.left) + eRect.width / 2 - scroller.clientWidth / 2;
      const targetTop = scroller.scrollTop + (eRect.top - sRect.top) + eRect.height / 2 - scroller.clientHeight / 2;
      const left = Math.max(0, targetLeft);
      const top = Math.max(0, targetTop);
      if (typeof scroller.scrollTo === 'function') {
        scroller.scrollTo({ left, top, behavior: 'smooth' });
      } else {
        scroller.scrollLeft = left;
        scroller.scrollTop = top;
      }
    };

    if (apiRef) {
      apiRef.current = { fitToBoard, focusElement };
    }

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) {
        pinching = false;
        return;
      }
      pinching = true;
      userZoomed = true;
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
      userZoomed = true;
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
      if (apiRef) apiRef.current = null;
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
  }, [scrollerRef, contentRef, fitKey, apiRef]);
}
