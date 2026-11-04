/**
 * Per-student technique index. Built from the technique names this student has
 * typed on their own journal cards (so it lives in their file, travels with
 * backups and needs no new storage key). Deduped case-insensitively, newest
 * spelling wins. Fundamentals and age-illegal techniques are never listed here:
 * fundamentals have their own section, age-illegal ones stay hidden.
 */
import type { StudentProgressReport } from './progress/types.ts';
import { ageIllegalTechniques } from './studentBenchmarks.ts';
import { fundamentalsBoard, viewJournalEntry, type FundamentalsCategoryView } from './studentEdition.ts';

export const techniqueKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();

function fundamentalKeys(board: readonly FundamentalsCategoryView[]): Set<string> {
  const keys = new Set<string>();
  for (const category of board) for (const item of category.items) {
    keys.add(techniqueKey(item.label));
    keys.add(techniqueKey(item.name));
  }
  return keys;
}

/** "My techniques": typed names from journal cards, deduped, A→Z. */
export function myTechniques(report: StudentProgressReport, board = fundamentalsBoard(report)): string[] {
  const skip = fundamentalKeys(board);
  for (const row of ageIllegalTechniques(report)) skip.add(techniqueKey(row.name));
  const byKey = new Map<string, { name: string; at: number }>();
  for (const entry of report.journal) {
    for (const item of viewJournalEntry(entry).techniques) {
      const name = item.name.trim().replace(/\s+/g, ' ');
      const key = techniqueKey(name);
      if (!key || skip.has(key)) continue;
      const at = entry.updatedAt ?? entry.createdAt;
      const seen = byKey.get(key);
      if (!seen || at >= seen.at) byKey.set(key, { name, at });
    }
  }
  return [...byKey.values()].map((row) => row.name).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

const matches = (text: string, query: string) => !query || techniqueKey(text).includes(query);

/** Pick dialog view: fundamentals and My techniques, both filtered by the search box. */
export function techniquePicker(report: StudentProgressReport, search: string) {
  const query = techniqueKey(search);
  const board = fundamentalsBoard(report);
  const mine = myTechniques(report, board).filter((name) => matches(name, query));
  const categories = board
    .map((category) => ({ ...category, items: category.items.filter((item) => matches(item.label, query) || matches(item.name, query)) }))
    .filter((category) => category.items.length);
  return { categories, mine };
}

/** Suggestions for a technique box: fundamentals first, then My techniques, deduped. */
export function techniqueSuggestions(report: StudentProgressReport, typed = '', limit = 50): string[] {
  const query = techniqueKey(typed);
  const board = fundamentalsBoard(report);
  const out = new Map<string, string>();
  for (const category of board) for (const item of category.items) out.set(techniqueKey(item.label), item.label);
  for (const name of myTechniques(report, board)) if (!out.has(techniqueKey(name))) out.set(techniqueKey(name), name);
  return [...out.values()].filter((name) => matches(name, query) && techniqueKey(name) !== query).slice(0, limit);
}
