/**
 * Optional 1–5 session quality, rated by the student. Wording follows the belt:
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

export type QualitySummary = { average: number; count: number; label: string } | null;

/** Average of the last 10 rated sessions, worded on the current belt's scale. */
export function qualitySummary(journal: readonly JournalEntry[], stage: QualityStage): QualitySummary {
  const rated = journal
    .filter((entry) => entry.quality)
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .slice(-10);
  if (!rated.length) return null;
  const average = rated.reduce((sum, entry) => sum + (entry.quality ?? 0), 0) / rated.length;
  const label = QUALITY_SCALES[stage].labels[Math.max(0, Math.min(4, Math.round(average) - 1))];
  return { average: Math.round(average * 10) / 10, count: rated.length, label };
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
