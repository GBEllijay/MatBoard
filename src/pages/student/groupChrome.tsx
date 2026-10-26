import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BeltRail } from '../../components/BeltRail';
import { StudentMarks, useStudentPath } from './chrome';
import { Chevron, RowIcon } from './hubArt';

function degreeStripes(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

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
      {skin === 'belt' && stripes ? <BeltRail kind="white" stripes={degreeStripes(stripes)} emptySlots /> : null}
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
