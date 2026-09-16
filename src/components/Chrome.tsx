import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

type Props = {
  title?: string;
  right?: ReactNode;
  ghost?: boolean;
};

export function Chrome({ title = 'MatBoard', right, ghost }: Props) {
  return (
    <header className={`chrome${ghost ? ' chrome--ghost' : ''}`} onClick={(event) => event.stopPropagation()}>
      <Link to="/" className="chrome__home" aria-label="Home">
        <span aria-hidden="true">←</span>
        {title ? <span className="chrome__brand">{title}</span> : null}
      </Link>
      <div className="chrome__right">{right}</div>
    </header>
  );
}
