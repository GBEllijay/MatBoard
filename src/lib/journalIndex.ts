/**
 * Journal index: searches every field the student types (class, how it went,
 * technique names and their "What I learned" notes, partners, drills, rolls,
 * notes, how it went (with older stop-doing text), amendments). Typo-tolerant: case- and accent-insensitive,
 * and each query word may be a small edit away from a word in the entry.
 */
import type { JournalClip, JournalEntry, StudentProgressReport } from './progress/types.ts';
import { JOURNAL_DRILLS_LABEL, JOURNAL_NOTES_LABEL, JOURNAL_PARTNERS_LABEL, JOURNAL_ROLLS_LABEL } from './journalCopy.ts';
import { techniqueDrilledLabel, viewJournalEntry } from './studentEdition.ts';

export function foldText(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function words(text: string): string[] {
  return foldText(text).split(/[^a-z0-9]+/).filter(Boolean);
}

/** Edit distance with an early cap (Damerau: a swap counts as one). */
export function editDistance(a: string, b: string, cap = 3): number {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i += 1) rows.push([i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, rows[i - 2][j - 2] + 1);
      rows[i][j] = v;
    }
  }
  return rows[a.length][b.length];
}

const allowed = (length: number) => (length <= 3 ? 0 : length <= 6 ? 1 : 2);

/** True when the query word matches a word: prefix, or within the typo allowance. */
export function wordMatches(word: string, query: string): boolean {
  if (word.startsWith(query) || (query.length >= 4 && word.includes(query))) return true;
  const budget = allowed(query.length);
  if (!budget) return false;
  if (editDistance(word, query, budget) <= budget) return true;
  // A query typed as the start of a longer word ("scisor" → "scissors").
  return word.length > query.length && editDistance(word.slice(0, query.length + 1), query, budget) <= budget;
}

export function fuzzyMatches(text: string, query: string): boolean {
  const q = words(query);
  if (!q.length) return true;
  const w = words(text);
  return q.every((part) => w.some((word) => wordMatches(word, part)));
}

export type JournalField = { label: string; text: string };

export function journalFields(entry: JournalEntry): JournalField[] {
  const card = viewJournalEntry(entry);
  const fields: JournalField[] = [{ label: 'Class', text: card.className }, { label: 'How it went', text: card.howItWent }];
  card.techniques.forEach((item, index) => {
    fields.push({ label: techniqueDrilledLabel(index), text: item.name });
    if (item.note) fields.push({ label: `What I learned (${item.name})`, text: item.note });
  });
  fields.push(
    { label: JOURNAL_PARTNERS_LABEL, text: card.partners },
    { label: JOURNAL_DRILLS_LABEL, text: card.drills },
    { label: JOURNAL_ROLLS_LABEL, text: card.rolls },
    { label: JOURNAL_NOTES_LABEL, text: card.notes },
    ...entry.amendments.map((item) => ({ label: 'Added later', text: item.body })),
  );
  return fields.filter((field) => field.text.trim());
}

export type JournalHit = { entry: JournalEntry; fields: JournalField[] };

/**
 * Every query word must appear somewhere in the entry (typos allowed). Hits list
 * the fields that contain at least one query word, for the result snippet.
 */
export function searchJournalIndex(journal: readonly JournalEntry[], query: string): JournalHit[] {
  const q = words(query);
  const newest = [...journal].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  if (!q.length) return newest.map((entry) => ({ entry, fields: [] }));
  const hits: JournalHit[] = [];
  for (const entry of newest) {
    const fields = journalFields(entry);
    if (!fuzzyMatches(fields.map((field) => field.text).join(' \n '), query)) continue;
    hits.push({ entry, fields: fields.filter((field) => q.some((part) => words(field.text).some((word) => wordMatches(word, part)))) });
  }
  return hits;
}

/** Split text into plain and matched parts for <mark> highlighting. */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const q = words(query);
  if (!q.length || !text) return [{ text, match: false }];
  const out: { text: string; match: boolean }[] = [];
  const re = /[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu;
  for (const piece of text.match(re) ?? []) {
    const folded = words(piece)[0];
    const match = Boolean(folded) && q.some((part) => wordMatches(folded, part));
    const last = out[out.length - 1];
    if (last && last.match === match) last.text += piece;
    else out.push({ text: piece, match });
  }
  return out;
}

/** Technique lines (name + What I learned) across past cards matching a name. */
export function techniqueLineHits(journal: readonly JournalEntry[], query: string) {
  if (!words(query).length) return [];
  const rows: { entryId: string; date: string; name: string; note: string }[] = [];
  for (const entry of journal) {
    for (const item of viewJournalEntry(entry).techniques) {
      if (item.name.trim() && fuzzyMatches(item.name, query)) rows.push({ entryId: entry.id, date: entry.date, name: item.name, note: item.note ?? '' });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Video tie-in hook. The Video Library (report.clips) has no technique tags, so
 * this matches the clip title and note text instead. When clips get tags, match
 * them here and the search page picks it up unchanged.
 */
export function videosForTechnique(report: StudentProgressReport, name: string): JournalClip[] {
  if (!words(name).length) return [];
  return (report.clips ?? []).filter((clip) => fuzzyMatches(`${clip.description} ${clip.note}`, name));
}
