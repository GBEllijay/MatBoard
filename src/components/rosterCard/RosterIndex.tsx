import { useLayoutEffect, useRef, useState } from 'react';
import { letterInStrip, measureStickyHeaderBottom, rosterIndexTopPx, type RosterIndexEntry } from '../../lib/rosterIndex';

/**
 * iOS Contacts-style A–Z strip. Drag only moves the bubble.
 * The list jumps once, instantly, to the letter under the finger at release.
 */
export function RosterIndex({
  letters,
  onJump,
}: {
  letters: readonly RosterIndexEntry[];
  onJump: (letter: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const armed = useRef<string | null>(null);
  const [bubble, setBubble] = useState<{ letter: string; x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const view = root.ownerDocument.defaultView ?? window;
    let frame = 0;
    let schedule = () => {};
    const Observer = typeof view.ResizeObserver === 'function' ? view.ResizeObserver : null;
    const resize = Observer ? new Observer(() => schedule()) : null;
    let watched: Element | null = null;
    const watchHeader = () => {
      const header = view.document.querySelector('.seat-session');
      if (!resize || header === watched) return;
      if (watched) resize.unobserve(watched);
      if (header) resize.observe(header);
      watched = header;
    };
    const measure = () => {
      const previous = root.style.getPropertyValue('--roster-index-top');
      root.style.removeProperty('--roster-index-top');
      const fallback = root.getBoundingClientRect().top;
      if (previous) root.style.setProperty('--roster-index-top', previous);
      const next = rosterIndexTopPx(measureStickyHeaderBottom(view.document), fallback);
      if (next == null) root.style.removeProperty('--roster-index-top');
      else if (previous !== next) root.style.setProperty('--roster-index-top', next);
      watchHeader();
    };
    schedule = () => {
      view.cancelAnimationFrame(frame);
      frame = view.requestAnimationFrame(measure);
    };
    resize?.observe(view.document.documentElement);
    measure();
    const Mutation = typeof view.MutationObserver === 'function' ? view.MutationObserver : null;
    const mutations = Mutation ? new Mutation(schedule) : null;
    mutations?.observe(view.document.body, { childList: true, subtree: true });
    view.addEventListener('resize', schedule);
    view.addEventListener('scroll', schedule);
    return () => {
      view.cancelAnimationFrame(frame);
      resize?.disconnect();
      mutations?.disconnect();
      view.removeEventListener('resize', schedule);
      view.removeEventListener('scroll', schedule);
    };
  }, [letters.length]);

  const letterAt = (clientY: number): string | null => {
    const root = rootRef.current;
    if (!root) return null;
    const rect = root.getBoundingClientRect();
    return letterInStrip(
      letters.map((row) => row.letter),
      rect.top,
      rect.bottom,
      clientY,
    );
  };

  const show = (clientY: number) => {
    const root = rootRef.current;
    const letter = letterAt(clientY);
    if (!letter || !root) return;
    armed.current = letter;
    const rect = root.getBoundingClientRect();
    setBubble({ letter, x: rect.left, y: clientY });
  };

  const release = () => {
    const letter = armed.current;
    dragging.current = false;
    armed.current = null;
    setBubble(null);
    if (!letter) return;
    const row = letters.find((item) => item.letter === letter);
    if (row && row.count > 0) onJump(letter);
  };

  return (
    <div
      className="roster-index"
      data-testid="roster-index"
      ref={rootRef}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        dragging.current = true;
        rootRef.current?.setPointerCapture?.(event.pointerId);
        show(event.clientY);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        show(event.clientY);
      }}
      onPointerUp={() => {
        release();
      }}
      onPointerCancel={() => {
        dragging.current = false;
        armed.current = null;
        setBubble(null);
      }}
    >
      {bubble ? (
        <div
          className="roster-index__bubble"
          data-testid="roster-index-bubble"
          style={{ top: bubble.y, left: bubble.x }}
          aria-hidden="true"
        >
          {bubble.letter}
        </div>
      ) : null}
      {letters.map((row) => (
        <button
          key={row.letter}
          type="button"
          data-letter={row.letter}
          data-empty={row.count === 0 ? 'true' : 'false'}
          aria-disabled={row.count === 0}
          aria-label={row.count ? `Jump to ${row.letter}` : `${row.letter}, no students`}
          className={row.count ? 'roster-index__letter' : 'roster-index__letter is-empty'}
          onClick={() => {
            if (row.count) onJump(row.letter);
          }}
        >
          {row.letter}
        </button>
      ))}
    </div>
  );
}
