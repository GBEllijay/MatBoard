/**
 * Preview-only student examples. Nothing here reads or writes a student file.
 */

export const PREVIEW_ANCESTRY_PATH = '/preview/student-ancestry';
export const PREVIEW_HOURS_PATH = '/preview/student-hours';
export const PREVIEW_NOTE =
  'Example only. Not a saved student record. Changes stay on this screen and are not written to the phone.';

export type Teacher = {
  id: string;
  name: string;
  /** Who taught this person. Blank when the example has no further teacher. */
  taughtBy: string | null;
};

export type TrainedWith = {
  id: string;
  name: string;
  startedOn: string;
  endedOn: string;
  stillTraining: boolean;
};

/** Who-taught-whom. Not the list of instructors the example student trained with. */
export const EXAMPLE_TEACHERS: readonly Teacher[] = [
  { id: 'west', name: 'Teacher West (example)', taughtBy: null },
  { id: 'north', name: 'Teacher North (example)', taughtBy: 'west' },
  { id: 'east', name: 'Teacher East (example)', taughtBy: null },
  { id: 'lane', name: 'Coach Lane (example)', taughtBy: 'north' },
  { id: 'ellis', name: 'Coach Ellis (example)', taughtBy: 'east' },
];

/** Direct teachers of the example student. The student is not a teacher node. */
export const EXAMPLE_DIRECT_TEACHERS = ['lane', 'ellis'] as const;

export const EXAMPLE_TRAINED_WITH: readonly TrainedWith[] = [
  { id: 'lane', name: 'Coach Lane (example)', startedOn: '', endedOn: '', stillTraining: true },
  { id: 'ellis', name: 'Coach Ellis (example)', startedOn: '2018-03-01', endedOn: '2020-11-01', stillTraining: false },
  { id: 'quinn', name: 'Coach Quinn (example)', startedOn: '', endedOn: '', stillTraining: false },
];

export function teacherById(teachers: readonly Teacher[], id: string): Teacher | undefined {
  return teachers.find((teacher) => teacher.id === id);
}

/** One branch from a direct teacher up to the earliest named teacher. Names only. */
export function ancestryBranch(teachers: readonly Teacher[], startId: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let current = teacherById(teachers, startId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.push(current.name);
    current = current.taughtBy ? teacherById(teachers, current.taughtBy) : undefined;
  }
  return names;
}

/** Tree lines. Dates never appear here, including when the trained-with list has dates. */
export function ancestryTreeLines(teachers: readonly Teacher[], directIds: readonly string[]): string[] {
  return directIds.map((id) => ancestryBranch(teachers, id).join(' → '));
}

export function trainedWithLine(row: TrainedWith): string {
  const parts: string[] = [];
  if (row.startedOn.trim()) parts.push(`started ${row.startedOn.trim()}`);
  if (row.stillTraining) parts.push('still training');
  else if (row.endedOn.trim()) parts.push(`ended ${row.endedOn.trim()}`);
  if (!parts.length) return row.name;
  return `${row.name} · ${parts.join(' · ')}`;
}

export function datesAreBlank(rows: readonly TrainedWith[]): boolean {
  return rows.every((row) => !row.startedOn.trim() && !row.endedOn.trim());
}

export const BELT_INTERVALS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
export type BeltInterval = (typeof BELT_INTERVALS)[number];

export const BELT_INTERVAL_LABEL: Record<BeltInterval, string> = {
  white: 'White',
  blue: 'Blue',
  purple: 'Purple',
  brown: 'Brown',
  black: 'Black',
};

/** Example journal total. Not editable. Not a lifetime claim. */
export const EXAMPLE_LOGGED_HOURS = 18.5;

export const EXAMPLE_ESTIMATES: Record<BeltInterval, string> = {
  white: '40',
  blue: '25',
  purple: '',
  brown: '',
  black: '',
};

/** Blank is unset. Anything other than a plain number is ignored. */
export function parseEstimate(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !/^\d+(\.\d+)?$/.test(trimmed)) return null;
  return Number(trimmed);
}

export function estimatedHours(estimates: Record<BeltInterval, string>): number {
  return BELT_INTERVALS.reduce((sum, belt) => sum + (parseEstimate(estimates[belt]) ?? 0), 0);
}

export function combinedHours(loggedHours: number, estimates: Record<BeltInterval, string>): number {
  return loggedHours + estimatedHours(estimates);
}

export function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}
