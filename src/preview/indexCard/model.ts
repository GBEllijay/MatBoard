/**
 * Fictional index card for one term.
 * Sample rows stay in memory. Nothing here reads or writes a journal, a rating,
 * a video, a technique tree, a D8 score, or cloud storage.
 */

import { FUNDAMENTALS_CATALOG } from '../../lib/progress/catalog.ts';
import { APPROVED_FUNDAMENTALS, AXES } from '../assessmentRadar/model.ts';
import { shownRating, type Rating } from '../termCard/model.ts';

export const INDEX_CARD_PATH = '/preview/index-card';

/** Same pill as the term-card Sample chip, with this page's words. */
export const SAMPLE_CHIP = 'Sample data';

export const SAMPLE_DISCLAIMER = 'Nothing is written to a record.';

export const SCISSOR_CATALOG_ID = 'sweep.scissor';

export type TreeKind = 'root' | 'follow' | 'defense';

export type TreeNode = {
  id: string;
  name: string;
  kind: TreeKind;
  children: TreeNode[];
};

export type JournalRow = {
  id: string;
  date: string;
  note: string;
};

export type SampleVideo = {
  id: string;
  title: string;
  href: string;
  label: string;
};

export type SampleTechnique = {
  id: string;
  name: string;
  note: string;
};

export type OtherItem = {
  id: string;
  category: 'Other';
  label: 'Needs review';
  note: string;
};

export type ScissorPlacement = {
  id: string;
  name: string;
  face: string;
  group: string;
};

/** Face label and sub-factor group from the current D8 map. Not a saved score. */
export function scissorPlacement(): ScissorPlacement {
  const row = APPROVED_FUNDAMENTALS.find((item) => item.id === SCISSOR_CATALOG_ID);
  const axis = row ? AXES.find((item) => item.id === row.axis) : undefined;
  const catalog = FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items).find((item) => item.id === SCISSOR_CATALOG_ID);
  if (!row || !axis || !catalog) throw new Error('Scissor sweep is missing from the D8 map');
  return { id: row.id, name: catalog.name, face: axis.label, group: row.subtype };
}

export const SCISSOR = scissorPlacement();

/** Untouched proficiency is the term card's neutral 3. A chosen 1–5 is kept. */
export const INITIAL_PROFICIENCY: Rating = shownRating(undefined);

export function chooseProficiency(value: number): Rating {
  return shownRating(value);
}

export const JOURNAL_ENTRIES: readonly JournalRow[] = [
  { id: 'journal-oct-28', date: 'Oct 28, 2026', note: 'Closed guard. It came up when they posted a hand.' },
  { id: 'journal-oct-14', date: 'Oct 14, 2026', note: 'Drilled it. The collar grip was shallow.' },
  { id: 'journal-sep-30', date: 'Sep 30, 2026', note: 'Tried it in a roll. They stood before the chop.' },
];

/** A link row only. The page does not embed a player. */
export const SAMPLE_VIDEO: SampleVideo = {
  id: 'video-scissor',
  title: 'Scissor sweep from closed guard',
  href: 'https://www.youtube.com/watch?v=sample-scissor-sweep',
  label: 'youtube.com/watch?v=sample-scissor-sweep',
};

export const SAMPLE_TECHNIQUE: SampleTechnique = {
  id: 'tech-collar-sleeve',
  name: 'Collar-and-sleeve scissor sweep',
  note: 'A sleeve-and-collar version of this sweep.',
};

export const OTHER_ITEM: OtherItem = {
  id: 'other-posted-hand',
  category: 'Other',
  label: 'Needs review',
  note: 'Posted the near hand and stood. Not filed under a journal line, a video, or a technique.',
};

/**
 * Follow-ups use the solid branch. Defenses and counters stay on their own kind.
 * Mount then the mount submissions matches the sample sweep chain.
 */
export const SAMPLE_TREE: TreeNode = {
  id: 'scissor',
  name: 'Scissor sweep',
  kind: 'root',
  children: [
    {
      id: 'mount',
      name: 'Mount',
      kind: 'follow',
      children: [
        { id: 'armbar-mount', name: 'Armbar from mount', kind: 'follow', children: [] },
        { id: 'cross-collar', name: 'Cross collar choke', kind: 'follow', children: [] },
        { id: 'americana', name: 'Americana', kind: 'follow', children: [] },
      ],
    },
    { id: 'posture', name: 'Posture and base', kind: 'defense', children: [] },
    { id: 'stand', name: 'Stand up', kind: 'defense', children: [] },
  ],
};

function countTree(node: TreeNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countTree(child), 0);
}

function namesIn(node: TreeNode, into: Set<string>) {
  into.add(node.name);
  for (const child of node.children) namesIn(child, into);
}

/** Next in-memory name. The first added branch is "New branch". */
export function nextBranchName(root: TreeNode): string {
  const names = new Set<string>();
  namesIn(root, names);
  if (!names.has('New branch')) return 'New branch';
  let index = 2;
  while (names.has(`New branch ${index}`)) index += 1;
  return `New branch ${index}`;
}

/**
 * Adds one named follow-up under the root, before the defense nodes.
 * A blank name leaves the tree as it was. The input tree is not mutated.
 */
export function addNamedBranch(root: TreeNode, name: string): TreeNode {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  if (!trimmed) return root;
  const node: TreeNode = {
    id: `added-${countTree(root)}`,
    name: trimmed,
    kind: 'follow',
    children: [],
  };
  const follow = root.children.filter((child) => child.kind !== 'defense');
  const defense = root.children.filter((child) => child.kind === 'defense');
  return { ...root, children: [...follow, node, ...defense] };
}
