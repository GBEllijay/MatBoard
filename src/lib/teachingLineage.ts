/**
 * Student teaching lines. One head instructor, then one teacher above each known person.
 * Suggestions stay off the file until the student confirms them.
 */
import { PROGRESS_LINEAGE_MAX, PROGRESS_NOTE_MAX, type TeachingLineage, type TeachingTree } from './progress/types.ts';

export const TEACHING_REVIEWED_ON = '2026-11-08';

export const TEACHING_DISCLAIMER =
  'A suggestion is a sourced candidate, not a certification and not an official record. Advantage is not affiliated with or endorsed by the people or academies named here. A gym’s history may differ. Being on the same team is not treated as proof of who taught whom.';

export type TeachingSuggestion = {
  id: string;
  person: string;
  nextTeacher: string;
  relation: 'primary-teacher';
  urls: readonly string[];
  reviewedOn: typeof TEACHING_REVIEWED_ON;
  summary: string;
};

const FABIO_URL = 'https://fabiogurgel.com.br/our-history-in-30-chapters/';
const ALLIANCE_URL = 'https://www.allianceofficial.com/en/about-alliance/';
const FABIO_PROFILE_URL = 'https://www.bjjheroes.com/bjj-fighters/fabio-gurgel-wiki';
const ROMERO_PROFILE_URL = 'https://www.bjjheroes.com/bjj-fighters/romero-jacare-cavalcanti';

/** Two checked continuations. Nothing above Rolls is offered. */
export const TEACHING_SUGGESTIONS: readonly TeachingSuggestion[] = [
  {
    id: 'fabio-to-romero',
    person: 'Fábio Gurgel',
    nextTeacher: "Romero 'Jacaré' Cavalcanti",
    relation: 'primary-teacher',
    urls: [FABIO_URL, ALLIANCE_URL, FABIO_PROFILE_URL],
    reviewedOn: TEACHING_REVIEWED_ON,
    summary:
      'Fábio Gurgel’s own Alliance history says Master Jacaré awarded him his black belt in 1989 and calls Jacaré his master. Alliance’s about page says he was the first black belt of Mestre Romero Jacaré. A fighter profile says Romero Cavalcanti gave him his blue belt and his black belt on 23 October 1989. Founding a team together is not the evidence for this suggestion.',
  },
  {
    id: 'romero-to-rolls',
    person: "Romero 'Jacaré' Cavalcanti",
    nextTeacher: 'Rolls Gracie',
    relation: 'primary-teacher',
    urls: [FABIO_URL, ROMERO_PROFILE_URL],
    reviewedOn: TEACHING_REVIEWED_ON,
    summary:
      'Fábio Gurgel’s history says Rolls Gracie awarded Jacaré his black belt and died in 1982. A fighter profile says Romero Cavalcanti returned to training with Rolls in late 1974 and received his black belt from Rolls in 1982. That profile also names earlier coaches and later training with other people, so this suggestion stops at Rolls.',
  },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function teachingNameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matchesPerson(name: string, person: string): boolean {
  const key = teachingNameKey(name);
  if (person.startsWith('Fábio')) return key.includes('fabio') && key.includes('gurgel');
  if (person.startsWith('Romero')) return key.includes('cavalcanti') && (key.includes('romero') || key.includes('jacare'));
  if (person.startsWith('Rolls')) return key.includes('rolls') && key.includes('gracie');
  return false;
}

export function blankTeachingTree(id: string): TeachingTree {
  return {
    id,
    headName: '',
    school: '',
    startedOn: '',
    endedOn: '',
    stillTraining: false,
    upward: [],
    confirmed: [],
    dismissed: [],
  };
}

export function chainNames(tree: TeachingTree): string[] {
  const head = tree.headName.trim();
  if (!head) return [];
  const names = [head];
  for (const teacher of tree.upward) {
    const name = teacher.trim();
    if (!name) break;
    names.push(name);
  }
  return names;
}

export function teachingChain(tree: TeachingTree): string {
  return ['You', ...chainNames(tree)].join(' → ');
}

export function teachingTimeline(tree: TeachingTree): string {
  const parts: string[] = [];
  if (tree.school.trim()) parts.push(tree.school.trim());
  if (tree.startedOn) parts.push(`started ${tree.startedOn}`);
  if (tree.stillTraining) parts.push('still training');
  else if (tree.endedOn) parts.push(`ended ${tree.endedOn}`);
  return parts.join(' · ');
}

function catalogMatch(tree: TeachingTree): TeachingSuggestion | null {
  const names = chainNames(tree);
  const last = names[names.length - 1];
  if (!last) return null;
  const match = TEACHING_SUGGESTIONS.find((item) => matchesPerson(last, item.person));
  if (!match || names.some((name) => matchesPerson(name, match.nextTeacher))) return null;
  return match;
}

/** The one next teacher for the last name on this line, or nothing. */
export function suggestionForTree(tree: TeachingTree): TeachingSuggestion | null {
  const match = catalogMatch(tree);
  if (!match || tree.dismissed.includes(match.id)) return null;
  return match;
}

/** True when the last name is not in the small checked set. */
export function unknownContinuation(tree: TeachingTree): boolean {
  return chainNames(tree).length > 0 && catalogMatch(tree) === null;
}

export function confirmSuggestion(tree: TeachingTree, suggestion: TeachingSuggestion): TeachingTree {
  const current = suggestionForTree(tree);
  if (!current || current.id !== suggestion.id) return tree;
  const upward = [...tree.upward, suggestion.nextTeacher];
  const index = upward.length;
  return { ...tree, upward, confirmed: [...tree.confirmed, index] };
}

export function declineSuggestion(tree: TeachingTree, suggestion: TeachingSuggestion): TeachingTree {
  if (tree.dismissed.includes(suggestion.id)) return tree;
  return { ...tree, dismissed: [...tree.dismissed, suggestion.id] };
}

export function addTeacherAbove(tree: TeachingTree): TeachingTree {
  return { ...tree, upward: [...tree.upward, ''] };
}

export function renameTeacher(tree: TeachingTree, index: number, name: string): TeachingTree {
  if (index === 0) return { ...tree, headName: name, confirmed: tree.confirmed.filter((slot) => slot !== 0) };
  const slot = index - 1;
  if (slot < 0 || slot >= tree.upward.length) return tree;
  const upward = tree.upward.map((line, at) => (at === slot ? name : line));
  return { ...tree, upward, confirmed: tree.confirmed.filter((kept) => kept !== index) };
}

function clip(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, PROGRESS_NOTE_MAX) : '';
}

function cleanDate(value: unknown): string {
  if (typeof value !== 'string' || !DATE_RE.test(value.trim())) return '';
  return value.trim();
}

function cleanTree(value: unknown, index: number): TeachingTree | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<TeachingTree>;
  const id = clip(row.id).trim() || `tree-${index + 1}`;
  const upward = Array.isArray(row.upward) ? row.upward.slice(0, PROGRESS_LINEAGE_MAX).map((name) => clip(name)) : [];
  const confirmed = Array.isArray(row.confirmed)
    ? row.confirmed.filter((slot) => Number.isInteger(slot) && slot >= 0 && slot <= upward.length)
    : [];
  const dismissed = Array.isArray(row.dismissed)
    ? row.dismissed.filter((item) => typeof item === 'string').map((item) => item.slice(0, 80)).slice(0, 8)
    : [];
  return {
    id,
    headName: clip(row.headName),
    school: clip(row.school),
    startedOn: cleanDate(row.startedOn),
    endedOn: cleanDate(row.endedOn),
    stillTraining: row.stillTraining === true,
    upward,
    confirmed,
    dismissed,
  };
}

export function sanitizeTeaching(value: unknown): TeachingLineage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Partial<TeachingLineage>;
  if (!Array.isArray(row.trees)) return undefined;
  const trees = row.trees.slice(0, 8).map((tree, index) => cleanTree(tree, index)).filter((tree): tree is TeachingTree => tree !== null);
  return { visible: row.visible !== false, trees };
}

export function teachingFromLineage(names: readonly string[]): TeachingLineage {
  const clean = names.map((name) => name.trim()).filter(Boolean).slice(0, PROGRESS_LINEAGE_MAX);
  if (!clean.length) return { visible: true, trees: [] };
  return {
    visible: true,
    trees: [{ ...blankTeachingTree('saved-line'), headName: clean[0] ?? '', upward: clean.slice(1) }],
  };
}

export function firstLineNames(teaching: TeachingLineage): string[] {
  const tree = teaching.trees[0];
  return tree ? chainNames(tree) : [];
}

export function addHeadTree(teaching: TeachingLineage): TeachingLineage {
  return { ...teaching, trees: [...teaching.trees, blankTeachingTree(`tree-${teaching.trees.length + 1}`)] };
}

export function setTeachingVisible(teaching: TeachingLineage, visible: boolean): TeachingLineage {
  return { ...teaching, visible, trees: teaching.trees.map((tree) => ({ ...tree, upward: [...tree.upward] })) };
}
