import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { releaseTextFocus } from '../lib/keepFieldVisible';
import { lockPageScroll, unlockPageScroll } from '../lib/pageScrollLock';
import { armOptionsCloseGuard, swallowLeftoverClick } from '../lib/optionsReopenGuard';
import { popSheetLayer, pushSheetLayer } from '../lib/sheetLayer';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  stacked?: boolean;
  className?: string;
  footer?: ReactNode;
  /** Mount on document.body so a transformed or overflow parent cannot trap the sheet. */
  portal?: boolean;
  /**
   * Keep the title row and Close pinned at the top while only the body scrolls,
   * so Close never scrolls out of reach on a short phone or in landscape.
   */
  pinClose?: boolean;
};

/** Open sheets, oldest first. Escape closes only the newest one. */
const escapeStack: symbol[] = [];

export function Sheet({
  open,
  title,
  onClose,
  children,
  stacked = false,
  className,
  footer,
  portal = false,
  pinClose = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Stay mounted for one commit after close so iOS receives blur before the
  // focused input is removed. Unmounting a focused field leaves the keyboard up.
  const [mounted, setMounted] = useState(open);
  const wasOpenRef = useRef(open);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      wasOpenRef.current = true;
      return;
    }
    releaseTextFocus(rootRef.current);
    setMounted(false);
    if (wasOpenRef.current) armOptionsCloseGuard();
    wasOpenRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const doc = rootRef.current?.ownerDocument ?? document;
    pushSheetLayer();
    lockPageScroll(doc);
    return () => {
      popSheetLayer();
      unlockPageScroll(doc);
    };
  }, [open]);

  // Escape is a way out on every sheet (keyboard, TV remote, Bluetooth keyboard).
  useEffect(() => {
    if (!open) return;
    const token = Symbol('sheet');
    escapeStack.push(token);
    const win = rootRef.current?.ownerDocument.defaultView ?? window;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (escapeStack[escapeStack.length - 1] !== token) return;
      event.preventDefault();
      onCloseRef.current();
    };
    // Window, bubble phase: a popup inside the sheet (skin picker) handles its own Escape first.
    win.addEventListener('keydown', onKey);
    return () => {
      win.removeEventListener('keydown', onKey);
      const at = escapeStack.indexOf(token);
      if (at >= 0) escapeStack.splice(at, 1);
    };
  }, [open]);

  const closeFromPointer = (event: { button?: number; pointerId?: number; currentTarget: EventTarget | null }) => {
    if (event.button != null && event.button !== 0) return;
    armOptionsCloseGuard();
    const node = event.currentTarget;
    if (
      node instanceof HTMLElement &&
      event.pointerId != null &&
      typeof node.hasPointerCapture === 'function' &&
      node.hasPointerCapture(event.pointerId)
    ) {
      node.releasePointerCapture(event.pointerId);
    }
    // Close shuts on pointerup, so the phone's click lands on the page behind
    // a moment later (the timer reopens Options, a board opens the Controller).
    if (event.pointerId != null) swallowLeftoverClick();
    onClose();
  };

  if (!mounted) return null;
  const sheet = (
    <div
      ref={rootRef}
      className={`sheet${stacked ? ' sheet--stack' : ''}${pinClose ? ' sheet--pin-close' : ''}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button className="sheet__backdrop" aria-label="Close options" onClick={() => closeFromPointer({ currentTarget: null })} />
      <div className="sheet__panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="btn btn--ghost sheet__close"
            onPointerUp={(event) => {
              closeFromPointer(event);
            }}
            onClick={(event) => {
              event.preventDefault();
              closeFromPointer(event);
            }}
          >
            Close
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );

  if (portal && typeof document !== 'undefined') return createPortal(sheet, document.body);
  return sheet;
}
