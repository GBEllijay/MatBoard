import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function Sheet({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button className="sheet__backdrop" aria-label="Close options" onClick={onClose} />
      <div className="sheet__panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet__head">
          <h2 id="sheet-title">{title}</h2>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sheet__body">{children}</div>
      </div>
    </div>
  );
}
