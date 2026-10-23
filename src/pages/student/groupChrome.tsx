import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StudentMarks, useStudentPath } from './chrome';
import { Chevron, RowIcon, WhiteBelt } from './hubArt';

export function GroupFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="student student-frame student--arena s-group">
      <StudentMarks />
      <div className="arena-scroll">
        <div className="s-group__column">
          <header className="s-group__head">
            <p className="s-kicker">Student Edition</p>
            <h1>{title}</h1>
          </header>
          {children}
        </div>
      </div>
    </main>
  );
}

export function MenuRow({
  label,
  note,
  to,
  skin,
  stripes,
  node,
}: {
  label: string;
  note?: string;
  to: string;
  skin: 'leather' | 'belt' | 'bracket' | 'binder' | 'ghost';
  stripes?: number;
  node?: 'on' | 'off';
}) {
  const path = useStudentPath();
  return (
    <Link className={`s-row s-row--${skin}`} to={path(to)} aria-label={label} data-stripes={stripes}>
      {skin === 'binder' ? (
        <>
          <span className="s-binder__spine" aria-hidden="true" />
          <span className="s-binder__hole" aria-hidden="true" />
          <span className="s-binder__ring" aria-hidden="true" />
        </>
      ) : null}
      {node ? <span className={`s-node${node === 'on' ? ' s-node--on' : ''}`} aria-hidden="true" /> : null}
      <RowIcon label={label} />
      <span className="s-row__text">
        <span className="s-row__title">{label}</span>
        {note ? <small>{note}</small> : null}
      </span>
      {stripes ? <WhiteBelt filled={stripes} /> : null}
      <Chevron />
    </Link>
  );
}

export function MenuList({ label, children, bracket = false }: { label: string; children: ReactNode; bracket?: boolean }) {
  return (
    <nav className={bracket ? 's-rows s-bracket-list' : 's-rows'} aria-label={label}>
      {children}
    </nav>
  );
}
