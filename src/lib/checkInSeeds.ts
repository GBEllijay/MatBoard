/**
 * Seed a bracket from everyone who is checked in today: Competitor Roster cards and
 * Student Roster cards. A Student Roster card linked to a competitor card is one person.
 * Check-in is selection only. This module does not write the roster.
 */

import { clipName, isStudentRosterCard, type Student } from './rosterStore.ts';
import { competitorCardLinks } from './rosterCardStore.ts';
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

/**
 * Student Roster card id -> competitor card id, for every pair that is one person:
 * the card's Add to Competitor Roster link (`links`, from the roster card store), or a
 * competitor marked "Same person as a roster student" (one shared Student Edition id).
 */
export function checkInPairs(
  students: readonly Student[],
  links: ReadonlyMap<string, string> = competitorCardLinks(),
): Map<string, string> {
  const byId = new Map(students.map((student) => [student.id, student]));
  const pairs = new Map<string, string>();
  const pairedCompetitors = new Set<string>();
  for (const [studentId, competitorId] of links) {
    const student = byId.get(studentId);
    const competitor = byId.get(competitorId);
    if (!student || !competitor || !isStudentRosterCard(student) || isStudentRosterCard(competitor)) continue;
    if (pairedCompetitors.has(competitorId)) continue;
    pairs.set(studentId, competitorId);
    pairedCompetitors.add(competitorId);
  }
  const byLinkedId = new Map<string, { students: Student[]; competitors: Student[] }>();
  for (const student of students) {
    const linked = student.linkedStudentId?.trim();
    if (!linked || student.guestId) continue;
    const group = byLinkedId.get(linked) ?? { students: [], competitors: [] };
    (isStudentRosterCard(student) ? group.students : group.competitors).push(student);
    byLinkedId.set(linked, group);
  }
  for (const group of byLinkedId.values()) {
    // Only an unambiguous one-to-one match is the same person.
    if (group.students.length !== 1 || group.competitors.length !== 1) continue;
    const [student] = group.students;
    const [competitor] = group.competitors;
    if (pairs.has(student.id) || pairedCompetitors.has(competitor.id)) continue;
    pairs.set(student.id, competitor.id);
    pairedCompetitors.add(competitor.id);
  }
  return pairs;
}

/** The other card of the same person (Student Roster <-> Competitor Roster), if any. */
export function checkInPartnerId(
  students: readonly Student[],
  id: string,
  links: ReadonlyMap<string, string> = competitorCardLinks(),
): string | undefined {
  for (const [studentId, competitorId] of checkInPairs(students, links)) {
    if (studentId === id) return competitorId;
    if (competitorId === id) return studentId;
  }
  return undefined;
}

/**
 * Everyone checked in, once per person. A linked pair is listed by its competitor card
 * (checked in when either card is). An unlinked Student Roster student uses its own card.
 * Never writes the roster.
 */
export function checkedInPeople(
  students: readonly Student[],
  links: ReadonlyMap<string, string> = competitorCardLinks(),
): Student[] {
  const pairs = checkInPairs(students, links);
  const studentOf = new Map<string, string>();
  for (const [studentId, competitorId] of pairs) studentOf.set(competitorId, studentId);
  const byId = new Map(students.map((student) => [student.id, student]));
  const out: Student[] = [];
  for (const student of students) {
    if (!rosterNameKey(student.name)) continue;
    if (isStudentRosterCard(student)) {
      if (pairs.has(student.id)) continue;
      if (student.checkedIn) out.push(student);
      continue;
    }
    if (student.checkedIn) {
      out.push(student);
      continue;
    }
    const partnerId = studentOf.get(student.id);
    if (partnerId && byId.get(partnerId)?.checkedIn) out.push({ ...student, checkedIn: true });
  }
  return out;
}

/** Kept name for existing callers: now everyone checked in, not only the Competitor Roster. */
export function checkedInCompetitors(students: readonly Student[]): Student[] {
  return checkedInPeople(students);
}

/**
 * The bracket title is the division filter. Roster division holds the age group
 * and the weight class (CSV "weight class" maps to that field). There is no
 * separate age or weight control on the bracket. A title filters only when it
 * exactly matches a checked-in division. A nickname that matches nobody does
 * not drop the list.
 */
export function bracketDivisionFilter(title: string, students: readonly Student[]): string | null {
  const wanted = title.trim().toLowerCase();
  if (!wanted) return null;
  const hit = checkedInCompetitors(students).some((student) => student.division.trim().toLowerCase() === wanted);
  return hit ? title.trim() : null;
}

export function competitorsForBracketFill(
  students: readonly Student[],
  title: string,
): { filter: string | null; competitors: Student[] } {
  const checked = checkedInCompetitors(students);
  const filter = bracketDivisionFilter(title, students);
  if (!filter) return { filter: null, competitors: checked };
  const wanted = filter.toLowerCase();
  return {
    filter,
    competitors: checked.filter((student) => student.division.trim().toLowerCase() === wanted),
  };
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
