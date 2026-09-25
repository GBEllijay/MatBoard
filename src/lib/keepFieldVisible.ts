/**
 * Keep a focused text field in the visible area above the mobile keyboard.
 *
 * `scrollIntoView({ block: 'center' })` centers in each layout scrollport.
 * After focus, iOS and Android shrink `visualViewport` (the keyboard does not
 * shrink the layout viewport), so that center sits under the keyboard. It also
 * scrolls every ancestor, including the page behind a bottom sheet.
 *
 * This walks only the scrollers that contain the field — sheet panel, bracket
 * board, or the document — and scrolls by the delta between the field and the
 * visual viewport. While the keyboard is open, visualViewport resize/scroll
 * runs the same check so the caret stays on screen. Desktop and TV layouts are
 * left alone unless a keyboard-sized inset actually appears.
 */

export const KEYBOARD_INSET_MIN_PX = 150;
export const PHONE_LAYOUT_MAX_WIDTH_PX = 900;

const NON_KEYBOARD_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

const FOCUS_RETRY_MS = [70, 220, 420, 700];

export type RevealMode = 'focus' | 'viewport';
export type RevealMove = 'center' | 'into-band' | 'none';

export type Band = { top: number; bottom: number; center: number };

export function keyboardInsetPx(layoutHeight: number, visualHeight: number): number {
  return Math.max(0, layoutHeight - visualHeight);
}

/** Stay open through the keyboard animation once a real inset has been seen. */
export function keyboardIsOpen(inset: number, wasOpen: boolean): boolean {
  return inset >= (wasOpen ? 80 : KEYBOARD_INSET_MIN_PX);
}

export function shouldKeepFieldInView(input: {
  layoutHeight: number;
  visualHeight: number;
  coarsePointer: boolean;
  layoutWidth: number;
}): boolean {
  if (keyboardInsetPx(input.layoutHeight, input.visualHeight) >= KEYBOARD_INSET_MIN_PX) return true;
  // Phones open the keyboard a moment after focus. Wide TV / desktop layouts
  // wait until a real inset shows up so Display boards keep their scroll.
  return input.coarsePointer && input.layoutWidth < PHONE_LAYOUT_MAX_WIDTH_PX;
}

export function inputTypeUsesKeyboard(type: string): boolean {
  return !NON_KEYBOARD_INPUT_TYPES.has(type.toLowerCase());
}

/** Comfortable vertical band inside the visual viewport (above the keyboard). */
export function comfortBand(visualHeight: number): Band {
  const margin = Math.min(56, Math.max(8, Math.min(visualHeight * 0.1, visualHeight / 4)));
  const top = margin;
  const bottom = Math.max(top + 1, visualHeight - margin);
  return { top, bottom, center: (top + bottom) / 2 };
}

/** Intersect the comfort band with a nested scroller's on-screen box. */
export function clipComfortBand(band: Band, limitTop: number, limitBottom: number): Band {
  const top = Math.max(band.top, limitTop);
  const bottom = Math.min(band.bottom, limitBottom);
  if (bottom - top < 32) return band;
  return { top, bottom, center: (top + bottom) / 2 };
}

export function revealAction(input: {
  keyboardOpen: boolean;
  rectTop: number;
  rectBottom: number;
  rectHeight: number;
  visualHeight: number;
  mode: RevealMode;
}): RevealMove {
  if (input.rectHeight <= 0) return 'none';
  const band = comfortBand(input.visualHeight);
  const fullyIn = input.rectTop >= band.top - 1 && input.rectBottom <= band.bottom + 1;
  if (input.mode === 'viewport') return fullyIn ? 'none' : 'into-band';

  if (!input.keyboardOpen) {
    // Keyboard animation has not started. Only nudge fields sitting in the
    // lower half, where the keyboard will land. Leave the upper page put.
    const likelyCovered = input.rectBottom > input.visualHeight * 0.55;
    if (!likelyCovered) return 'none';
    return 'center';
  }

  if (fullyIn) {
    const center = input.rectTop + input.rectHeight / 2;
    const slack = (band.bottom - band.top) * 0.18;
    if (Math.abs(center - band.center) <= slack) return 'none';
  }
  return 'center';
}

/** Positive delta increases scrollTop (field sits too low). */
export function deltaToReveal(
  rect: { top: number; bottom: number; height: number },
  band: Band,
  move: Exclude<RevealMove, 'none'>,
): number {
  if (move === 'center') return rect.top + rect.height / 2 - band.center;
  if (rect.top < band.top) return rect.top - band.top;
  if (rect.bottom > band.bottom) return rect.bottom - band.bottom;
  return 0;
}

export function clampScroll(current: number, delta: number, maxScroll: number): number {
  const max = Math.max(0, maxScroll);
  const next = current + delta;
  if (next < 0) return 0;
  if (next > max) return max;
  return next;
}

/** Positive delta increases scrollLeft (field sits to the right). Mirrors inline: 'nearest'. */
export function horizontalDelta(
  elLeft: number,
  elRight: number,
  viewLeft: number,
  viewRight: number,
  margin: number,
): number {
  if (elLeft < viewLeft + margin) return elLeft - (viewLeft + margin);
  if (elRight > viewRight - margin) return elRight - (viewRight - margin);
  return 0;
}

/**
 * Keyboard overlap in layout coordinates. Subtract `visualViewport.offsetTop`
 * so an iOS pan (the browser scrolling the visual viewport to reveal a field)
 * is not counted twice.
 */
export function layoutKeyboardOverlap(layoutHeight: number, visualHeight: number, offsetTop: number): number {
  return Math.max(0, Math.round(layoutHeight - visualHeight - offsetTop));
}

/**
 * How far a fixed sheet's `bottom` must move so its box ends at the visual
 * viewport. `naturalBottom` is the sheet's visual bottom before this lift
 * (`rect.bottom + alreadyApplied`). `layoutOverlap` is `layoutKeyboardOverlap`.
 * The smaller of the two is used, so a browser that already pinned the sheet
 * to the visual viewport is not lifted again.
 */
export function overlayBottomInset(
  naturalBottom: number,
  visualHeight: number,
  layoutOverlap: number,
  threshold = 24,
): number {
  const measured = Math.round(naturalBottom - visualHeight);
  const overlap = Math.min(Math.max(0, measured), Math.max(0, Math.round(layoutOverlap)));
  return overlap > threshold ? overlap : 0;
}

/** Extra padding so the last field in a scrollport can move above the keyboard. */
export function coveredScrollportPad(scrollportBottom: number, visualHeight: number, comfort = 20): number {
  const hidden = Math.round(scrollportBottom - visualHeight);
  if (hidden <= 8) return 0;
  return hidden + comfort;
}

type VisualMetrics = {
  layoutHeight: number;
  visualHeight: number;
  offsetTop: number;
  coarsePointer: boolean;
  layoutWidth: number;
};

type PadState = { original: number };

const adjusted = new Set<HTMLElement>();
const padState = new Map<HTMLElement, PadState>();
const bottomInset = new Map<HTMLElement, number>();
let keyboardWasOpen = false;

function noteKeyboard(metrics: VisualMetrics): boolean {
  const open = keyboardIsOpen(keyboardInsetPx(metrics.layoutHeight, metrics.visualHeight), keyboardWasOpen);
  keyboardWasOpen = open;
  return open;
}

/** Text fields that can hold the iOS keyboard, including read-only inputs. */
export function isTextEntryElement(el: HTMLElement): boolean {
  if (el.isContentEditable) return true;
  if (el instanceof HTMLTextAreaElement) return !el.disabled;
  if (!(el instanceof HTMLInputElement) || el.disabled) return false;
  return inputTypeUsesKeyboard(el.type || 'text');
}

/** Blur the focused text field when it sits inside `root`. */
export function releaseTextFocus(root: ParentNode | null): void {
  if (!root) return;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return;
  if (!root.contains(active)) return;
  if (!isTextEntryElement(active)) return;
  active.blur();
}

function isKeyboardField(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return !target.disabled && !target.readOnly;
  if (target instanceof HTMLInputElement) {
    if (target.disabled || target.readOnly) return false;
    if (target.inputMode === 'none') return false;
    return inputTypeUsesKeyboard(target.type);
  }
  return false;
}

function readMetrics(): VisualMetrics {
  const viewport = window.visualViewport;
  const coarsePointer =
    window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches;
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
  return {
    layoutHeight,
    visualHeight: viewport?.height ?? layoutHeight,
    offsetTop: viewport?.offsetTop ?? 0,
    layoutWidth: window.innerWidth,
    coarsePointer,
  };
}

function findSheet(el: HTMLElement): HTMLElement | null {
  const sheet = el.closest('.sheet');
  return sheet instanceof HTMLElement ? sheet : null;
}

function isScrollContainer(el: HTMLElement): boolean {
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
}

function isDocumentScroller(el: HTMLElement): boolean {
  return el === document.scrollingElement || el === document.documentElement || el === document.body;
}

function scrollableAncestors(el: HTMLElement, sheet: HTMLElement | null): HTMLElement[] {
  const list: HTMLElement[] = [];
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    if (isScrollContainer(node)) list.push(node);
    if (sheet && node === sheet) break;
    node = node.parentElement;
  }
  if (!sheet) {
    const root = document.scrollingElement;
    if (root instanceof HTMLElement && !list.includes(root)) list.push(root);
  }
  return list;
}

function setPad(el: HTMLElement, extra: number): void {
  let state = padState.get(el);
  if (!state) {
    const computed = Number.parseFloat(getComputedStyle(el).paddingBottom);
    state = { original: Number.isFinite(computed) ? computed : 0 };
    padState.set(el, state);
    adjusted.add(el);
  }
  const next = extra <= 0 ? '' : `${Math.round(state.original + extra)}px`;
  if (el.style.paddingBottom !== next) el.style.paddingBottom = next;
}

function fitSheet(sheet: HTMLElement, metrics: VisualMetrics): void {
  const applied = bottomInset.get(sheet) ?? 0;
  const rect = sheet.getBoundingClientRect();
  const layoutOverlap = layoutKeyboardOverlap(metrics.layoutHeight, metrics.visualHeight, metrics.offsetTop);
  const inset = overlayBottomInset(rect.bottom + applied, metrics.visualHeight, layoutOverlap);
  bottomInset.set(sheet, inset);
  adjusted.add(sheet);
  const nextBottom = inset > 0 ? `${inset}px` : '';
  if (sheet.style.bottom !== nextBottom) sheet.style.bottom = nextBottom;

  const panel = sheet.querySelector(':scope > .sheet__panel');
  if (panel instanceof HTMLElement) {
    const available = Math.max(120, Math.round(metrics.visualHeight - 8));
    const nextMax = `${available}px`;
    if (panel.style.maxHeight !== nextMax) panel.style.maxHeight = nextMax;
    adjusted.add(panel);
  }
}

function resetSheet(sheet: HTMLElement): void {
  sheet.style.bottom = '';
  bottomInset.delete(sheet);
  const panel = sheet.querySelector(':scope > .sheet__panel');
  if (panel instanceof HTMLElement) panel.style.maxHeight = '';
}

export function clearKeyboardAdjustments(): void {
  for (const el of adjusted) {
    el.style.paddingBottom = '';
    el.style.bottom = '';
    el.style.maxHeight = '';
  }
  adjusted.clear();
  padState.clear();
  bottomInset.clear();
  keyboardWasOpen = false;
}

function scrollInlineNearest(scroller: HTMLElement, el: HTMLElement): void {
  const elRect = el.getBoundingClientRect();
  const view = isDocumentScroller(scroller) ? null : scroller.getBoundingClientRect();
  const viewLeft = view ? view.left : 0;
  const viewRight = view ? view.right : (window.visualViewport?.width ?? window.innerWidth);
  const delta = horizontalDelta(elRect.left, elRect.right, viewLeft, viewRight, 12);
  if (Math.abs(delta) < 2) return;
  const max = scroller.scrollWidth - scroller.clientWidth;
  const next = clampScroll(scroller.scrollLeft, delta, max);
  if (Math.abs(next - scroller.scrollLeft) >= 1) scroller.scrollLeft = next;
}

function scrollField(
  scroller: HTMLElement,
  el: HTMLElement,
  visualHeight: number,
  move: Exclude<RevealMove, 'none'>,
  allowPad: boolean,
): void {
  const documentScroller = isDocumentScroller(scroller);
  if (allowPad && !documentScroller) {
    setPad(scroller, coveredScrollportPad(scroller.getBoundingClientRect().bottom, visualHeight));
  }
  const limit = documentScroller ? null : scroller.getBoundingClientRect();
  const band = limit
    ? clipComfortBand(comfortBand(visualHeight), limit.top + 8, limit.bottom - 8)
    : comfortBand(visualHeight);
  const rect = el.getBoundingClientRect();
  const delta = deltaToReveal(rect, band, move);
  if (Math.abs(delta) >= 2) {
    const max = scroller.scrollHeight - scroller.clientHeight;
    const next = clampScroll(scroller.scrollTop, delta, max);
    if (Math.abs(next - scroller.scrollTop) >= 1) scroller.scrollTop = next;
  }
  scrollInlineNearest(scroller, el);
}

function keepFieldVisible(el: HTMLElement, mode: RevealMode, metrics: VisualMetrics): void {
  const open = noteKeyboard(metrics);
  const sheet = findSheet(el);

  if (sheet) {
    if (open) fitSheet(sheet, metrics);
    else resetSheet(sheet);
    setPad(document.body, 0);
    if (document.scrollingElement instanceof HTMLElement) setPad(document.scrollingElement, 0);
  }

  const scrollers = scrollableAncestors(el, sheet);
  if (!open) {
    for (const scroller of scrollers) {
      if (!isDocumentScroller(scroller)) setPad(scroller, 0);
    }
    setPad(document.body, 0);
    if (document.scrollingElement instanceof HTMLElement) setPad(document.scrollingElement, 0);
  }

  const first = el.getBoundingClientRect();
  const move = revealAction({
    keyboardOpen: open,
    rectTop: first.top,
    rectBottom: first.bottom,
    rectHeight: first.height,
    visualHeight: metrics.visualHeight,
    mode,
  });

  if (move === 'none') {
    for (const scroller of scrollers) scrollInlineNearest(scroller, el);
  } else {
    for (let pass = 0; pass < 2; pass += 1) {
      const live = el.getBoundingClientRect();
      const step =
        pass === 0
          ? move
          : revealAction({
              keyboardOpen: open,
              rectTop: live.top,
              rectBottom: live.bottom,
              rectHeight: live.height,
              visualHeight: metrics.visualHeight,
              mode: 'viewport',
            });
      if (step === 'none') break;
      for (const scroller of scrollers) {
        scrollField(scroller, el, metrics.visualHeight, step, open);
      }
    }
  }

  if (open) {
    const roomScroller = sheet
      ? scrollers.find((scroller) => !isDocumentScroller(scroller))
      : document.scrollingElement;
    if (roomScroller instanceof HTMLElement) {
      const live = el.getBoundingClientRect();
      const band = comfortBand(metrics.visualHeight);
      const outside = live.top < band.top || live.bottom > band.bottom;
      if (mode === 'focus' || outside) {
        const floor = sheet ? 0 : keyboardInsetPx(metrics.layoutHeight, metrics.visualHeight);
        ensureCenterRoom(roomScroller, el, metrics.visualHeight, floor);
        scrollField(roomScroller, el, metrics.visualHeight, mode === 'focus' ? 'center' : 'into-band', false);
      }
    }
  }
}

/** Grow padding when the field still cannot reach the comfort band. */
function ensureCenterRoom(scroller: HTMLElement, el: HTMLElement, visualHeight: number, floor: number): void {
  const limit = isDocumentScroller(scroller) ? null : scroller.getBoundingClientRect();
  const band = limit
    ? clipComfortBand(comfortBand(visualHeight), limit.top + 8, limit.bottom - 8)
    : comfortBand(visualHeight);
  const rect = el.getBoundingClientRect();
  const delta = deltaToReveal(rect, band, 'center');
  if (delta <= 2 && rect.bottom <= band.bottom + 1 && rect.top >= band.top - 1) return;
  const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const room = max - scroller.scrollTop;
  const deficit = Math.max(0, delta - room);
  if (deficit <= 2 && floor <= 0) return;
  const state = padState.get(scroller);
  const parsed = Number.parseFloat(scroller.style.paddingBottom);
  const currentExtra = state && Number.isFinite(parsed) ? Math.max(0, parsed - state.original) : 0;
  const next = Math.min(visualHeight + floor + 80, Math.max(floor, currentExtra + deficit + 8));
  if (next > 0) setPad(scroller, next);
}

export function installKeepFocusedFieldVisible(): () => void {
  let active: HTMLElement | null = null;
  let running = false;
  const timers = new Set<number>();

  const clearTimers = () => {
    for (const id of timers) window.clearTimeout(id);
    timers.clear();
  };

  const run = (mode: RevealMode) => {
    if (running || !active || !active.isConnected) return;
    const metrics = readMetrics();
    if (!shouldKeepFieldInView(metrics)) {
      clearKeyboardAdjustments();
      return;
    }
    running = true;
    try {
      keepFieldVisible(active, mode, metrics);
    } finally {
      running = false;
    }
  };

  const onFocusIn = (event: FocusEvent) => {
    if (!isKeyboardField(event.target)) return;
    active = event.target;
    clearTimers();
    run('focus');
    for (const delay of FOCUS_RETRY_MS) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        run('focus');
      }, delay);
      timers.add(id);
    }
  };

  const onFocusOut = () => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (active && document.activeElement !== active && !isKeyboardField(document.activeElement)) {
        active = null;
        clearTimers();
        clearKeyboardAdjustments();
      }
    }, 60);
    timers.add(id);
  };

  const onViewport = () => {
    if (!active || document.activeElement !== active) return;
    const metrics = readMetrics();
    const inset = keyboardInsetPx(metrics.layoutHeight, metrics.visualHeight);
    if (!keyboardIsOpen(inset, keyboardWasOpen)) {
      clearKeyboardAdjustments();
      return;
    }
    run('viewport');
  };

  const onOrientation = () => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    const board = active.closest('.tournament');
    if (!(board instanceof HTMLElement)) return;
    releaseTextFocus(board);
    clearKeyboardAdjustments();
  };

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', onViewport);
  window.visualViewport?.addEventListener('scroll', onViewport);
  window.addEventListener('resize', onViewport);
  window.addEventListener('orientationchange', onOrientation);
  screen.orientation?.addEventListener('change', onOrientation);

  return () => {
    clearTimers();
    active = null;
    clearKeyboardAdjustments();
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    window.visualViewport?.removeEventListener('resize', onViewport);
    window.visualViewport?.removeEventListener('scroll', onViewport);
    window.removeEventListener('resize', onViewport);
    window.removeEventListener('orientationchange', onOrientation);
    screen.orientation?.removeEventListener('change', onOrientation);
  };
}
