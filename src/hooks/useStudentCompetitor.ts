import { useSyncExternalStore } from 'react';
import { readStudentCompetitor, subscribeStudentCompetitor, writeStudentCompetitor } from '../lib/studentCompetitorFlag';

export function useStudentCompetitor(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribeStudentCompetitor, () => readStudentCompetitor(), () => true);
  return [on, writeStudentCompetitor];
}
