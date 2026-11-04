/**
 * "How it went" wording by belt (prompt + legacy rating labels). The 1–5 rating
 * is retired: saved ratings migrate to free text. Wording follows the belt:
 * white is survival and learning, blue/purple technique and game building,
 * brown/black refinement and leading, kids get simple words.
 */
import type { JournalEntry } from './progress/types.ts';

export type QualityStage = 'white' | 'builder' | 'refiner' | 'kids';
export type QualityScale = { prompt: string; labels: [string, string, string, string, string] };

export const QUALITY_SCALES: Record<QualityStage, QualityScale> = {
  white: { prompt: 'How did today go? Surviving counts.', labels: ['Just survived', 'Hung in there', 'Learned something', 'Something clicked', 'Breakthrough'] },
  builder: { prompt: 'How did your game feel?', labels: ['Off day', 'Rusty', 'Solid flow', 'Game working', 'Dialed in'] },
  refiner: { prompt: 'How was the session for refining and leading?', labels: ['Off day', 'Kept it steady', 'Refined details', 'Sharp and teaching', 'Led the mat'] },
  kids: { prompt: 'How was class?', labels: ['Tough day', 'Okay', 'Good', 'Great', 'Awesome!'] },
};

export function qualityStage(belt: string, kids: boolean): QualityStage {
  if (kids) return 'kids';
  if (belt === 'white') return 'white';
  if (belt === 'blue' || belt === 'purple') return 'builder';
  return 'refiner';
}

/** Legacy 1–5 rating → its belt-worded text, e.g. 3 on white → "Learned something". */
export function qualityText(quality: number, stage: QualityStage): string {
  const n = Math.round(quality);
  return n >= 1 && n <= 5 ? QUALITY_SCALES[stage].labels[n - 1] : '';
}

const HOW_PREFIX = 'How it went:';

/** Read the free-text "How it went" note from a card body. */
export function howItWentOf(entry: Pick<JournalEntry, 'body'>): string {
  const lines = entry.body.split('\n');
  const notesAt = lines.findIndex((row) => row.startsWith('Notes:'));
  const head = notesAt >= 0 ? lines.slice(0, notesAt) : lines;
  return (head.find((row) => row.startsWith(HOW_PREFIX)) ?? '').slice(HOW_PREFIX.length).trim();
}

/**
 * One-time migration: a saved rating becomes "How it went" text so nothing is
 * lost, and the structured rating is dropped. An existing note wins.
 */
export function migrateQualityToNote(entry: JournalEntry, stage: QualityStage): JournalEntry {
  if (entry.quality === undefined) return entry;
  const { quality, ...rest } = entry;
  if (howItWentOf(entry)) return rest;
  const text = qualityText(quality, stage);
  if (!text) return rest;
  const lines = entry.body.split('\n');
  const notesAt = lines.findIndex((row) => row.startsWith('Notes:'));
  const at = notesAt >= 0 ? notesAt : lines.length;
  lines.splice(at, 0, `${HOW_PREFIX} ${text}`);
  return { ...rest, body: lines.join('\n') };
}

/** Latest "How it went" note (newest card first), shown on the report instead of a rating. */
export function latestHowItWent(journal: readonly JournalEntry[]): { text: string; date: string; count: number } | null {
  const noted = journal
    .map((entry) => ({ entry, text: howItWentOf(entry) }))
    .filter((row) => row.text)
    .sort((a, b) => (a.entry.date === b.entry.date ? b.entry.createdAt - a.entry.createdAt : a.entry.date < b.entry.date ? 1 : -1));
  if (!noted.length) return null;
  return { text: noted[0].text, date: noted[0].entry.date, count: noted.length };
}

export type BodyStatus = {
  current: { kind: 'injury' | 'hiatus'; text: string; date: string } | null;
  history: { id: string; kind: 'injury' | 'hiatus'; text: string; date: string }[];
};

function hiatusText(h: NonNullable<JournalEntry['hiatus']>): string {
  return `${h.reason === 'medical' ? 'Medical break' : 'Break'} · ${h.start}${h.end ? ` to ${h.end}` : ' · ongoing'}`;
}

/** Injury and break status, pulled from journal cards. Private to the student. */
export function bodyStatus(journal: readonly JournalEntry[], today: string): BodyStatus {
  const history: BodyStatus['history'] = [];
  for (const entry of journal) {
    if (entry.injury) history.push({ id: `${entry.id}-i`, kind: 'injury', text: `Injury · ${entry.injury.area || 'unspecified'}${entry.injury.note ? ` — ${entry.injury.note}` : ''}`, date: entry.date });
    if (entry.hiatus) history.push({ id: `${entry.id}-h`, kind: 'hiatus', text: hiatusText(entry.hiatus), date: entry.hiatus.start || entry.date });
  }
  history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const breakNow = journal.find((e) => e.hiatus && (e.hiatus.start || e.date) <= today && (!e.hiatus.end || e.hiatus.end >= today));
  let current: BodyStatus['current'] = breakNow?.hiatus ? { kind: 'hiatus', text: hiatusText(breakNow.hiatus), date: breakNow.date } : null;
  if (!current) {
    // An injury card from the last 14 days shows as current.
    const injuries = history.filter((row) => row.kind === 'injury');
    const latest = injuries[0];
    if (latest && daysBetween(latest.date, today) <= 14) current = { kind: 'injury', text: latest.text, date: latest.date };
  }
  return { current, history };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}
