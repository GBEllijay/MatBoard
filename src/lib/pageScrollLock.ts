/**
 * Page scroll lock for open sheets.
 * The first sheet saves body and html overflow and touch-action, then locks.
 * Nested sheets (the card, then Edit from the belt) share that one saved snapshot.
 * The last Close restores it, including when Edit closes the card.
 */

type InlineScroll = {
  overflow: string;
  overflowX: string;
  overflowY: string;
  touchAction: string;
  overscrollBehavior: string;
};

const EMPTY: InlineScroll = {
  overflow: '',
  overflowX: '',
  overflowY: '',
  touchAction: '',
  overscrollBehavior: '',
};

let depth = 0;
let saved: { html: InlineScroll; body: InlineScroll } | null = null;

function read(el: HTMLElement): InlineScroll {
  return {
    overflow: el.style.overflow,
    overflowX: el.style.overflowX,
    overflowY: el.style.overflowY,
    touchAction: el.style.touchAction,
    overscrollBehavior: el.style.overscrollBehavior,
  };
}

function write(el: HTMLElement, style: InlineScroll): void {
  el.style.overflow = style.overflow;
  el.style.overflowX = style.overflowX;
  el.style.overflowY = style.overflowY;
  el.style.touchAction = style.touchAction;
  el.style.overscrollBehavior = style.overscrollBehavior;
}

function applyLock(el: HTMLElement): void {
  el.style.overflow = 'hidden';
  el.style.touchAction = 'none';
}

export function pageScrollLockDepth(): number {
  return depth;
}

export function lockPageScroll(doc: Document | null | undefined = typeof document === 'undefined' ? undefined : document): void {
  const html = doc?.documentElement;
  const body = doc?.body;
  if (!(html instanceof HTMLElement) || !(body instanceof HTMLElement)) return;
  if (depth === 0) {
    saved = { html: read(html), body: read(body) };
    applyLock(html);
    applyLock(body);
  }
  depth += 1;
}

export function unlockPageScroll(doc: Document | null | undefined = typeof document === 'undefined' ? undefined : document): void {
  if (depth === 0) return;
  depth -= 1;
  if (depth > 0) return;
  const html = doc?.documentElement;
  const body = doc?.body;
  const prior = saved;
  saved = null;
  if (html instanceof HTMLElement) write(html, prior?.html ?? EMPTY);
  if (body instanceof HTMLElement) write(body, prior?.body ?? EMPTY);
}

/** True when body or html still has the sheet lock inline. */
export function pageScrollIsLocked(doc: Document | null | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  const html = doc?.documentElement;
  const body = doc?.body;
  const locked = (el: HTMLElement | null | undefined) =>
    el instanceof HTMLElement && (el.style.overflow === 'hidden' || el.style.touchAction === 'none');
  return locked(html) || locked(body);
}

/** Test isolation. Production Close uses unlockPageScroll. */
export function resetPageScrollLockForTests(doc?: Document | null): void {
  depth = 0;
  saved = null;
  const html = doc?.documentElement;
  const body = doc?.body;
  if (html instanceof HTMLElement) write(html, EMPTY);
  if (body instanceof HTMLElement) write(body, EMPTY);
}
