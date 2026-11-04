/**
 * Wins on the student character sheet: how many matches the student won across
 * their recorded Results, and how they won (from each match's recorded method).
 */
import type { StudentCompetition } from './progress/types.ts';

export const WIN_METHOD_ORDER = ['sub', 'points', 'advantage', 'decision', 'dq', 'other'] as const;
export type WinMethodKey = (typeof WIN_METHOD_ORDER)[number];
export const WIN_METHOD_SHORT: Record<WinMethodKey, string> = { sub: 'Sub', points: 'Pts', advantage: 'Adv', decision: 'Dec', dq: 'DQ', other: 'Other' };
export const WIN_METHOD_LONG: Record<WinMethodKey, string> = { sub: 'Submission', points: 'Points', advantage: 'Advantage', decision: 'Decision', dq: 'DQ', other: 'Method not recorded' };

export type WinsSummary = { wins: number; byMethod: { key: WinMethodKey; count: number }[] };

function methodKey(method: string): WinMethodKey {
  const m = method.trim().toLowerCase();
  if (m === 'sub' || m === 'submission') return 'sub';
  if (m === 'points' || m === 'pts') return 'points';
  if (m === 'advantage' || m === 'adv') return 'advantage';
  if (m === 'decision' || m === 'ref' || m === 'referee') return 'decision';
  if (m === 'dq') return 'dq';
  return 'other';
}

export function winsSummary(competition: Pick<StudentCompetition, 'results'> | undefined | null): WinsSummary {
  const counts = new Map<WinMethodKey, number>();
  let wins = 0;
  for (const result of competition?.results ?? []) {
    for (const match of result.matches) {
      if (match.result !== 'win') continue;
      wins += 1;
      const key = methodKey(match.method ?? '');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const byMethod = WIN_METHOD_ORDER.filter((k) => counts.get(k)).map((key) => ({ key, count: counts.get(key)! }));
  return { wins, byMethod };
}

/** "Sub 3 · Pts 2 · Adv 1". Empty when there are no wins. */
export function winsBreakdownLine(summary: WinsSummary): string {
  return summary.byMethod.map((m) => `${WIN_METHOD_SHORT[m.key]} ${m.count}`).join(' · ');
}
