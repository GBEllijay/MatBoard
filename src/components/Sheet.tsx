import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { releaseTextFocus } from '../lib/keepFieldVisible';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  stacked?: boolean;
  className?: string;
  footer?: ReactNode;
};

export function Sheet({
  open,
  title,
  onClose,
  children,
  stacked = false,
  className,
  footer,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
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

  if (!mounted) return null;
  return (
    <div
      ref={rootRef}
      className={`sheet${stacked ? ' sheet--stack' : ''}${className ? ` ${className}` : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sheet-title"
    >
      <button className="sheet__backdrop" aria-label="Close options" onClick={onClose} />
      <div className="sheet__panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__head">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sheet__body">{children}</div>
        {footer ? <div className="sheet__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
