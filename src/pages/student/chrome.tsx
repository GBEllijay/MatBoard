import { useCallback, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { SubmenuMarks } from '../../components/TierHomeMark';
import { submenuBackTarget } from '../../lib/submenuNav';
import type { StudentProgressReport } from '../../lib/progress/types';
import { loadStudentReport, saveStudentReport } from '../../lib/studentEdition';

export function useStudentPath() {
  const [params] = useSearchParams();
  const preview = params.get('student') === '1';
  return (path: string) => {
    if (!preview) return path;
    const hashAt = path.indexOf('#');
    const hash = hashAt >= 0 ? path.slice(hashAt) : '';
    const before = hashAt >= 0 ? path.slice(0, hashAt) : path;
    const [pathname, search = ''] = before.split('?');
    const next = new URLSearchParams(search);
    next.set('student', '1');
    return `${pathname}?${next.toString()}${hash}`;
  };
}

export function useStudentFile() {
  const [report, setReport] = useState(() => loadStudentReport(localStorage));
  const commit = useCallback((next: StudentProgressReport) => {
    const saved = saveStudentReport(localStorage, next);
    setReport(saved);
    return saved;
  }, []);
  return { report, commit };
}

export function StudentMarks() {
  const { pathname, search } = useLocation();
  const back = submenuBackTarget({ pathname, search });
  const home = new URLSearchParams(search).get('student') === '1' ? '/?student=1' : '/';
  if (!back) return null;
  return <SubmenuMarks to={back} homeTo={home} />;
}

export function BeltDoodle() {
  return (
    <svg className="student-belt" viewBox="0 0 140 70" aria-hidden="true">
      <path
        d="M8 36c18-16 28-16 40-4 6 6 8 8 14 2 8-8 14-10 22-4 10 8 8 16-2 18-8 2-12-2-16-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M78 28c10 2 22 10 34 8 8-1 16 4 18 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M62 40c8 10 18 14 28 8 4-2 6-8 2-12-6-6-16-2-22 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function LeatherHeader({ title = 'Jiu-Jitsu Journal' }: { title?: string }) {
  return (
    <header className="student-leather">
      <h1>{title}</h1>
    </header>
  );
}
