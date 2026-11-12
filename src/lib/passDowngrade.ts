/**
 * A lower pass never replaces a higher one on this phone.
 *
 * Owner rule (Nov 12, 2026): a higher tier unlocks everything below it, so no second
 * device is needed. An Instructor seat, or an Instructor / Pro license, already opens
 * the personal Student Edition side (tierImplications.ts: seat and Pro passes carry
 * 'student'). Claiming a free Student license or redeeming a Student code on that phone
 * must not overwrite the higher pass.
 *
 * What happens instead: the higher pass stays in advantage.entitlement.token. The
 * Student pass is kept beside it under STUDENT_SIDE_TOKEN_KEY (per Student Edition
 * profile), and the academy join and student inbox pass are saved as usual, so the
 * student identity (one Student Edition id) still works for card shares, the
 * student inbox, and Send to my instructor.
 */

import { base64UrlToBytes } from './entitlementToken.ts';
import { impliedDoors } from './tierImplications.ts';

export const STUDENT_SIDE_TOKEN_KEY = 'matboard.studentEdition.studentLicenseToken.v1';

type Payload = { src?: unknown; tier?: unknown; grants?: unknown; subs?: { state?: unknown } | null; preset?: unknown };

function payloadOf(token: string | null | undefined): Payload | null {
  const part = (token ?? '').trim().split('.')[1];
  if (!part) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Payload) : null;
  } catch {
    return null;
  }
}

function isSeat(row: Payload): boolean {
  return row.src === 'seat' || row.tier === 'seat';
}

function doors(row: Payload): Set<string> {
  const grants = Array.isArray(row.grants) ? row.grants.filter((door): door is string => typeof door === 'string') : [];
  const open = new Set<string>(impliedDoors(grants));
  if (row.tier === 'owner' || row.src === 'owner') for (const door of impliedDoors(['pro'])) open.add(door);
  return open;
}

/**
 * True when `incoming` would take something away from the pass already here:
 * the current pass is a live seat, an owner pass, or opens a door the incoming one does not.
 * A locked or unreadable current pass is not protected (a restore or refresh replaces it as before).
 */
export function wouldDowngradePass(current: string | null | undefined, incoming: string | null | undefined): boolean {
  const here = payloadOf(current);
  const next = payloadOf(incoming);
  if (!here || !next) return false;
  if (here.subs?.state === 'locked') return false;
  if (isSeat(here) && !isSeat(next)) return true;
  const mine = doors(here);
  const theirs = doors(next);
  for (const door of mine) if (!theirs.has(door)) return true;
  return false;
}

/** Keep the Student pass beside the higher one. */
export function keepStudentSideToken(storage: { setItem(key: string, value: string): void }, token: string): void {
  try {
    storage.setItem(STUDENT_SIDE_TOKEN_KEY, token.trim());
  } catch {
    /* storage full; the higher pass is unchanged either way */
  }
}

export function readStudentSideToken(storage: { getItem(key: string): string | null }): string {
  try {
    return storage.getItem(STUDENT_SIDE_TOKEN_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}
