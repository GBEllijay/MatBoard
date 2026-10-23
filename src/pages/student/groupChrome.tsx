import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { StudentMarks, useStudentPath } from './chrome';

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

export function MenuRow({ label, note, to }: { label: string; note?: string; to: string }) {
  const path = useStudentPath();
  return (
    <Link className="s-row" to={path(to)} aria-label={label}>
      <span className="s-row__title">{label}</span>
      {note ? <small>{note}</small> : null}
    </Link>
  );
}

export function MenuList({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className="s-rows" aria-label={label}>
      {children}
    </nav>
  );
}
