/**
 * The coach's OWN device-to-device backup for Coach Clipboard cards.
 *
 * Private coach notes ARE in here, so they move with the coach to a new device.
 * They are never in the roster CSV, a sync or share payload, the student's card or
 * journal, or any student-facing file. Those paths build their output field by
 * field and never read ROSTER_CARD_PRIVATE_KEY.
 *
 * Today the full-device file is the Pro lock screen's Download my data
 * (lockedDataSnapshot), which copies these keys as they are. The roster has no
 * other full backup yet. When one ships, it calls these two functions.
 */

import { ROSTER_CARD_KEY, ROSTER_CARD_PRIVATE_KEY } from './rosterCardStore.ts';
import { COACH_INBOX_KEY } from './studentToCoach.ts';

type MemoryStore = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

export const COACH_CARD_BACKUP_KEYS = [ROSTER_CARD_KEY, ROSTER_CARD_PRIVATE_KEY, COACH_INBOX_KEY] as const;

export type CoachCardBackup = { kind: 'advantage-coach-card-backup'; version: 1; data: Record<string, string> };

export function coachCardBackup(storage: Pick<MemoryStore, 'getItem'>): CoachCardBackup {
  const data: Record<string, string> = {};
  for (const key of COACH_CARD_BACKUP_KEYS) {
    const value = storage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return { kind: 'advantage-coach-card-backup', version: 1, data };
}

/** Restore only the known card keys. Anything else in the file is ignored. */
export function restoreCoachCardBackup(storage: MemoryStore, backup: unknown): number {
  if (!backup || typeof backup !== 'object') return 0;
  const row = backup as Partial<CoachCardBackup>;
  if (row.kind !== 'advantage-coach-card-backup' || row.version !== 1 || !row.data || typeof row.data !== 'object') return 0;
  let count = 0;
  for (const key of COACH_CARD_BACKUP_KEYS) {
    const value = (row.data as Record<string, unknown>)[key];
    if (typeof value !== 'string') continue;
    try {
      JSON.parse(value);
    } catch {
      continue;
    }
    storage.setItem(key, value);
    count += 1;
  }
  return count;
}
