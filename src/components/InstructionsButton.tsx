import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  /** Stable id for aria-controls. */
  controlsId: string;
  /** Sheet rows left-align the control. Hub footers follow the parent text alignment. */
  align?: 'center' | 'stretch';
};

/**
 * Tap (and hover on a fine pointer) reveals how-to copy. The copy stays
 * closed until then, so it is not a permanent bottom wall.
 */
export function InstructionsButton({ children, controlsId, align = 'center' }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);
  const [hover, setHover] = useState(false);
  const open = pinned || hover;

  useEffect(() => {
    if (!pinned) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [pinned]);

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    setHover(true);
  };

  return (
    <div
      className={`instructions${align === 'stretch' ? ' instructions--stretch' : ''}`}
      ref={rootRef}
      onPointerEnter={onPointerEnter}
      onPointerLeave={() => setHover(false)}
    >
      <button
        type="button"
        className="instructions__btn"
        aria-expanded={open}
        aria-controls={controlsId}
        onClick={() => {
          setHover(false);
          setPinned((value) => !value);
        }}
      >
        Instructions
      </button>
      <div
        id={controlsId}
        className="instructions__panel"
        role="region"
        aria-label="Instructions"
        hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}
