import { useRef, useState } from 'react';
import { letterAtClientY, type LetterBand, type RosterIndexEntry } from '../../lib/rosterIndex';

/**
 * iOS Contacts-style A–Z strip. Tap or drag to jump. Empty letters stay
 * visible and dimmed. The bubble shows while the pointer is down.
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
  const [bubble, setBubble] = useState<{ letter: string; x: number; y: number } | null>(null);

  const bands = (): LetterBand[] => {
    const root = rootRef.current;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLButtonElement>('[data-letter]')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { letter: button.dataset.letter ?? '', top: rect.top, bottom: rect.bottom };
    });
  };

  const point = (clientY: number) => {
    const root = rootRef.current;
    const letter = letterAtClientY(bands(), clientY);
    if (!letter || !root) return;
    const rect = root.getBoundingClientRect();
    setBubble({ letter, x: rect.left, y: clientY });
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
        dragging.current = true;
        rootRef.current?.setPointerCapture?.(event.pointerId);
        point(event.clientY);
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        point(event.clientY);
      }}
      onPointerUp={() => {
        dragging.current = false;
        setBubble(null);
      }}
      onPointerCancel={() => {
        dragging.current = false;
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
