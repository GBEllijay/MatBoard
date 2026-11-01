import type { ReactNode } from 'react';

type Props = {
  title?: string;
  right?: ReactNode;
  ghost?: boolean;
  /** When set, the title is a button (Round Timer: tap "Rounds" for the fullscreen timer). */
  onTitleClick?: () => void;
  titleLabel?: string;
};

/** Top bar for manage screens. Home lives on the shared PlayExitMark, not text back. */
export function Chrome({ title, right, ghost, onTitleClick, titleLabel }: Props) {
  return (
    <header className={`chrome${ghost ? ' chrome--ghost' : ''}`} onClick={(event) => event.stopPropagation()}>
      {title && onTitleClick ? (
        <button type="button" className="chrome__brand chrome__brand--button" aria-label={titleLabel} onClick={onTitleClick}>
          {title}
        </button>
      ) : title ? (
        <span className="chrome__brand">{title}</span>
      ) : (
        <span className="chrome__lead" aria-hidden="true" />
      )}
      <div className="chrome__right">{right}</div>
    </header>
  );
}
