/**
 * Seed a bracket from competitors who are checked in today.
 * Check-in is selection only. This module does not write the roster.
 */

import { clipName, competitorCards, type Student } from './rosterStore.ts';
import type { RankingFile, RankingRow } from './rankingStore.ts';
import { clampCompetitorCount } from './tournamentStore.ts';

export type SeededCompetitor = {
  id: string;
  name: string;
  /** Ranking place. Null when this checked-in competitor is not on the ranking list. */
  place: number | null;
};

/** Same key RosterNameField uses for an exact roster name: trimmed, then case-insensitive. */
export function rosterNameKey(name: string): string {
  return clipName(name).toLowerCase();
}

export function checkedInCompetitors(students: readonly Student[]): Student[] {
  return competitorCards(students as Student[]).filter((student) => student.checkedIn && rosterNameKey(student.name));
}

/** Blank divisions sort last. Everyone else is division, then name. Comparison ignores case. */
function compareDivisionThenName(a: Student, b: Student): number {
  const divisionA = a.division.trim();
  const divisionB = b.division.trim();
  if (!divisionA !== !divisionB) return divisionA ? -1 : 1;
  const byDivision = divisionA.localeCompare(divisionB, undefined, { sensitivity: 'base' });
  if (byDivision) return byDivision;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

/**
 * Ranked checked-in competitors in ranking place order, then unranked checked-in
 * competitors by division and then by name. A blank division goes last. A tied
 * place keeps the ranking file's row order. With no ranking rows, the whole
 * list uses that division order. A ranking name that is not checked in is
 * skipped. Each roster card is used once.
 */
export function orderCheckedInByRanking(
  students: readonly Student[],
  rows: readonly RankingRow[] | null | undefined,
): SeededCompetitor[] {
  const checked = checkedInCompetitors(students);
  const queues = new Map<string, Student[]>();
  for (const student of checked) {
    const key = rosterNameKey(student.name);
    const queue = queues.get(key);
    if (queue) queue.push(student);
    else queues.set(key, [student]);
  }

  const used = new Set<string>();
  const ranked: SeededCompetitor[] = [];
  const orderedRows = (rows ?? [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rosterNameKey(row.name))
    .sort((a, b) => a.row.place - b.row.place || a.index - b.index);

  for (const { row } of orderedRows) {
    const queue = queues.get(rosterNameKey(row.name));
    const next = queue?.shift();
    if (!next || used.has(next.id)) continue;
    used.add(next.id);
    ranked.push({ id: next.id, name: next.name, place: row.place });
  }

  const unranked = checked
    .filter((student) => !used.has(student.id))
    .sort(compareDivisionThenName)
    .map((student) => ({ id: student.id, name: student.name, place: null as number | null }));
  return [...ranked, ...unranked];
}

/**
 * One file is obvious. Otherwise a unique trim/case match on the bracket title
 * (file name, then file division), then a unique match when every checked-in
 * division is the same. Mixed or repeated matches stay for the user to pick.
 */
export function obviousRankingFile(
  files: readonly RankingFile[],
  hint: { title?: string; divisions?: readonly string[] },
): RankingFile | null {
  if (files.length === 1) return files[0];
  const title = (hint.title ?? '').trim().toLowerCase();
  if (title) {
    const byName = files.filter((file) => file.name.trim().toLowerCase() === title);
    if (byName.length === 1) return byName[0];
    const byDivision = files.filter((file) => file.division.trim().toLowerCase() === title);
    if (byDivision.length === 1) return byDivision[0];
  }
  const divisions = [...new Set((hint.divisions ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean))];
  if (divisions.length === 1) {
    const match = files.filter(
      (file) => file.division.trim().toLowerCase() === divisions[0] || file.name.trim().toLowerCase() === divisions[0],
    );
    if (match.length === 1) return match[0];
  }
  return null;
}

/** Existing board sizes. One checked-in competitor still opens the smallest bracket, 2. */
export function seededBracketSize(seedCount: number, max: number): number {
  return clampCompetitorCount(seedCount, max);
}

export function namesForBracket(seeds: readonly SeededCompetitor[], max: number): string[] {
  if (!seeds.length) return [];
  return seeds.slice(0, seededBracketSize(seeds.length, max)).map((seed) => seed.name);
}
