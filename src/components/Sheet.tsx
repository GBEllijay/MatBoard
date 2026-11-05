import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { releaseTextFocus } from '../lib/keepFieldVisible';
import { lockPageScroll, unlockPageScroll } from '../lib/pageScrollLock';
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
};

export function Sheet({
  open,
  title,
  onClose,
  children,
  stacked = false,
  className,
  footer,
  portal = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Stay mounted for one commit after close so iOS receives blur before the
  // focused input is removed. Unmounting a focused field leaves the keyboard up.
  const [mounted, setMounted] = useState(open);

  useLayoutEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    releaseTextFocus(rootRef.current);
    setMounted(false);
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

  const closeFromPointer = (event: { button?: number; pointerId?: number; currentTarget: EventTarget | null }) => {
    if (event.button != null && event.button !== 0) return;
    const node = event.currentTarget;
    if (
      node instanceof HTMLElement &&
      event.pointerId != null &&
      typeof node.hasPointerCapture === 'function' &&
      node.hasPointerCapture(event.pointerId)
    ) {
      node.releasePointerCapture(event.pointerId);
    }
    onClose();
  };

  if (!mounted) return null;
  const sheet = (
    <div
      ref={rootRef}
      className={`sheet${stacked ? ' sheet--stack' : ''}${className ? ` ${className}` : ''}`}
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
