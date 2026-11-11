/**
 * Paid extra Student profiles. One row per Checkout session, on the account id.
 * The first profile is free and is not a row. Switching does not write a row.
 */

import type { D1Database } from './d1.ts';

export async function countExtraProfileSlots(db: D1Database, accountId: string): Promise<number> {
  if (!accountId) return 0;
  try {
    const row = await db
      .prepare(`SELECT COUNT(*) AS total FROM profile_slots WHERE account_id = ?`)
      .bind(accountId)
      .first<{ total: number }>();
    return Number(row?.total ?? 0);
  } catch {
    return 0;
  }
}

/** Insert the session once. A repeat webhook keeps the original row and returns the account total. */
export async function recordExtraProfileSlot(
  db: D1Database,
  input: { accountId: string; sessionId: string; now: Date },
): Promise<number> {
  if (!input.accountId || !input.sessionId) return 0;
  await db
    .prepare(`INSERT OR IGNORE INTO profile_slots (session_id, account_id, created_at) VALUES (?, ?, ?)`)
    .bind(input.sessionId, input.accountId, input.now.toISOString())
    .run();
  return countExtraProfileSlots(db, input.accountId);
}
