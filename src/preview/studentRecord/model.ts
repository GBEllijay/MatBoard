/**
 * Preview-only student examples. Nothing here reads or writes a student file.
 */

export const PREVIEW_ANCESTRY_PATH = '/preview/student-ancestry';
export const PREVIEW_HOURS_PATH = '/preview/student-hours';
export const PREVIEW_NOTE =
  'Example only. Not a saved student record. Changes stay on this screen and are not written to the phone.';

export const EXAMPLE_STUDENT = 'You (example student)';

/** One head instructor, then that person's teachers upward. Depth is whatever is known. */
export type LineageTree = {
  id: string;
  headName: string;
  startedOn: string;
  endedOn: string;
  stillTraining: boolean;
  /** Teachers above the head instructor. The first is their teacher. Empty means unknown. */
  upward: string[];
};

export type AncestryPreview = {
  visible: boolean;
  trees: LineageTree[];
};

/** Two head instructors at once. Their dates overlap. Neither chain is required to go further. */
export const EXAMPLE_TREES: readonly LineageTree[] = [
  {
    id: 'lane',
    headName: 'Coach Lane (example)',
    startedOn: '2022-02-01',
    endedOn: '',
    stillTraining: true,
    upward: ['Teacher North (example)', 'Teacher West (example)'],
  },
  {
    id: 'ellis',
    headName: 'Coach Ellis (example)',
    startedOn: '2023-06-01',
    endedOn: '',
    stillTraining: true,
    upward: ['Teacher East (example)'],
  },
];

export function exampleAncestry(): AncestryPreview {
  return { visible: true, trees: EXAMPLE_TREES.map((tree) => ({ ...tree, upward: [...tree.upward] })) };
}

/** You, then the head instructor, then each known teacher above them. */
export function chainLine(studentLabel: string, tree: LineageTree): string {
  const names = [studentLabel, tree.headName.trim() || 'Head instructor'];
  for (const teacher of tree.upward) {
    const name = teacher.trim();
    if (name) names.push(name);
  }
  return names.join(' → ');
}

/** Dates sit beside the head instructor. A blank timeline adds nothing to the chain. */
export function timelineLine(tree: LineageTree): string {
  const parts: string[] = [];
  if (tree.startedOn.trim()) parts.push(`started ${tree.startedOn.trim()}`);
  if (tree.stillTraining) parts.push('still training');
  else if (tree.endedOn.trim()) parts.push(`ended ${tree.endedOn.trim()}`);
  return parts.join(' · ');
}

export function timelinesOverlap(left: LineageTree, right: LineageTree): boolean {
  if (left.stillTraining && right.stillTraining) return true;
  const start = (tree: LineageTree) => tree.startedOn.trim() || '0000-01-01';
  const end = (tree: LineageTree) => (tree.stillTraining || !tree.endedOn.trim() ? '9999-12-31' : tree.endedOn.trim());
  return start(left) <= end(right) && start(right) <= end(left);
}

export function addHeadTree(trees: readonly LineageTree[]): LineageTree[] {
  return [
    ...trees.map((tree) => ({ ...tree, upward: [...tree.upward] })),
    { id: `tree-${trees.length + 1}`, headName: '', startedOn: '', endedOn: '', stillTraining: true, upward: [] },
  ];
}

export function addUpwardTeacher(tree: LineageTree): LineageTree {
  return { ...tree, upward: [...tree.upward, ''] };
}

/** Hiding lineage keeps every name and date. */
export function setLineageVisible(state: AncestryPreview, visible: boolean): AncestryPreview {
  return {
    visible,
    trees: state.trees.map((tree) => ({ ...tree, upward: [...tree.upward] })),
  };
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
