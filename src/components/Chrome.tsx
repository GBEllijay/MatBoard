import type { ReactNode } from 'react';

type Props = {
  title?: string;
  right?: ReactNode;
  ghost?: boolean;
};

/** Top bar for manage screens. Home lives on the shared PlayExitMark, not text back. */
export function Chrome({ title, right, ghost }: Props) {
  return (
    <header className={`chrome${ghost ? ' chrome--ghost' : ''}`} onClick={(event) => event.stopPropagation()}>
      {title ? <span className="chrome__brand">{title}</span> : <span className="chrome__lead" aria-hidden="true" />}
      <div className="chrome__right">{right}</div>
    </header>
  );
}
