/**
 * Same-URL history entry for a full-screen overlay.
 * Browser Back and the iOS swipe-back close the overlay.
 * Escape does too, unless the key is pressed in a text field.
 * A second arm for the same id (React Strict Mode) keeps the one entry.
 */
import { lockPageScroll, unlockPageScroll } from './pageScrollLock.ts';

const MARK = 'advantageOverlay';

type Hist = Record<string, unknown> & { [MARK]?: string };

const sessions = new Map<string, number>();

function pageHistory(): History | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.history ?? null;
  } catch {
    return null;
  }
}

export function overlayHistoryId(state: unknown = pageHistory()?.state ?? null): string | null {
  if (!state || typeof state !== 'object') return null;
  const id = (state as Hist)[MARK];
  return typeof id === 'string' ? id : null;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  if (el.isContentEditable) return true;
  return Boolean(el.closest('input, textarea, select, [contenteditable="true"]'));
}

export type OverlayExitOptions = {
  /** Lock page scroll while the overlay is up, and release it on the way out. */
  lockScroll?: boolean;
  /** Listen for Escape. Covers that already handle Escape pass false. */
  escape?: boolean;
};

/**
 * Push a history entry and listen for Back and Escape.
 * Call the returned function when the overlay closes another way.
 * It pops the entry unless Back already did.
 */
export function armOverlayExit(id: string, onClose: () => void, options: OverlayExitOptions = {}): () => void {
  const escape = options.escape !== false;
  const token = (sessions.get(id) ?? 0) + 1;
  sessions.set(id, token);
  const doc = typeof document === 'undefined' ? null : document;
  if (options.lockScroll) lockPageScroll(doc);

  const nav = pageHistory();
  if (nav && typeof nav.pushState === 'function' && overlayHistoryId() !== id) {
    try {
      const base = nav.state && typeof nav.state === 'object' ? { ...(nav.state as Hist) } : {};
      nav.pushState({ ...base, [MARK]: id }, '');
    } catch {
      /* Safari can refuse pushState. Escape still closes. */
    }
  }

  let done = false;
  const release = (pop: boolean) => {
    if (done) return;
    done = true;
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('keydown', onKey);
    if (options.lockScroll) unlockPageScroll(doc);
    if (!pop) return;
    queueMicrotask(() => {
      if (sessions.get(id) !== token) return;
      if (overlayHistoryId() !== id) return;
      try {
        pageHistory()?.back();
      } catch {
        /* ignore */
      }
    });
  };

  const onPop = () => {
    if (overlayHistoryId() === id) return;
    release(false);
    onClose();
  };

  const onKey = (event: KeyboardEvent) => {
    if (!escape) return;
    if (event.key !== 'Escape' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
    event.preventDefault();
    release(true);
    onClose();
  };

  window.addEventListener('popstate', onPop);
  if (escape) window.addEventListener('keydown', onKey);

  return () => release(true);
}

/** Test isolation. Production close goes through the function armOverlayExit returns. */
export function resetOverlayExitForTests(): void {
  sessions.clear();
}
