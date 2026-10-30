/**
 * Which paid screens a signed token may download.
 * The Pages Function uses the fresh-token check. The browser may still open a
 * cached copy while offline, inside the token's own offline window (D10).
 *
 * Seat presets match the signed invite. A Program Director keeps Media Console
 * when Pro is locked. A lesson seat keeps Lesson Cloud when Pro is locked.
 * Coach Unlimited stays shut until Pro is open. A custom seat has no preset on
 * the token, so the server cannot see its toggles and allows the seat screens.
 */

import type { EntitlementClaims } from './entitlementToken.ts';

export const PAID_CHUNK_IDS = ['pro-console', 'media-console', 'lesson-cloud', 'coach-unlimited'] as const;
export type PaidChunkId = (typeof PAID_CHUNK_IDS)[number];

export const PAID_CHUNK_COOKIE = 'advantage_paid';
export const PAID_CHUNK_CACHE = 'paid-chunks';

export const PAID_CHUNK_LABELS: Record<PaidChunkId, string> = {
  'pro-console': 'Pro Console',
  'media-console': 'Media Console',
  'lesson-cloud': 'Lesson Cloud',
  'coach-unlimited': 'Coach Unlimited',
};

/** Presets that include Gallery, Events, or Pro Shop. */
const MEDIA_PRESETS = new Set(['program-director', 'instructors']);
/** Presets that include the lesson plan or daily videos. */
const LESSON_PRESETS = new Set(['assistant-coach', 'coach', 'instructors']);

export function isPaidChunkId(value: string): value is PaidChunkId {
  return (PAID_CHUNK_IDS as readonly string[]).includes(value);
}

function seatToken(claims: EntitlementClaims): boolean {
  return claims.tier === 'seat' || claims.src === 'seat';
}

/**
 * Pro doors are open. A locked subscription, a passed grace lock, and a passed
 * cancel-at-period-end date close them. One-time and owner tokens have no
 * subscription claim, so a Pro grant stays open until the token itself expires.
 */
export function proGrantOpen(claims: EntitlementClaims, nowMs: number): boolean {
  if (!claims.grants.includes('pro')) return false;
  const subs = claims.subs;
  if (!subs) return true;
  if (subs.state === 'locked') return false;
  if (subs.lock_at) {
    const lockAt = Date.parse(subs.lock_at);
    if (Number.isFinite(lockAt) && nowMs >= lockAt) return false;
  }
  if (subs.ends_at && subs.state !== 'grace') {
    const endsAt = Date.parse(subs.ends_at);
    if (Number.isFinite(endsAt) && nowMs >= endsAt) return false;
  }
  return subs.state === 'active' || subs.state === 'grace';
}

/** Grant check only. Ignores token expiry so offline grace can reuse it. */
export function paidChunkGrant(claims: EntitlementClaims, chunk: PaidChunkId, nowMs: number): boolean {
  const pro = proGrantOpen(claims, nowMs);
  const seated = seatToken(claims);
  const preset = claims.preset ?? '';
  const mediaPreset = MEDIA_PRESETS.has(preset);
  const lessonPreset = LESSON_PRESETS.has(preset);
  const customSeat = seated && preset.length === 0;

  if (chunk === 'media-console') {
    if (seated) return mediaPreset || customSeat;
    return pro;
  }
  if (chunk === 'lesson-cloud') {
    if (seated && (lessonPreset || customSeat)) return true;
    return !seated && pro;
  }
  if (chunk === 'coach-unlimited') {
    if (!seated) return pro;
    return pro && (lessonPreset || customSeat);
  }
  if (!seated) return pro;
  if (mediaPreset || customSeat) return true;
  return pro && lessonPreset;
}

export function paidTokenFresh(claims: EntitlementClaims, nowMs: number): boolean {
  if (nowMs < claims.nbf * 1000) return false;
  return nowMs < claims.exp * 1000;
}

/** Server rule. An expired token is refused even when offline_grace is set. */
export function paidChunkAllowed(claims: EntitlementClaims, chunk: PaidChunkId, nowMs: number): boolean {
  return paidTokenFresh(claims, nowMs) && paidChunkGrant(claims, chunk, nowMs);
}

/**
 * Browser rule before asking for a chunk. A fresh token uses the server rule.
 * After exp, a cached copy may open only while offline and inside the token's
 * own offline window. A lock is never waived.
 */
export function paidChunkAllowedForClient(
  claims: EntitlementClaims,
  chunk: PaidChunkId,
  nowMs: number,
  offline: boolean,
): boolean {
  if (!paidChunkGrant(claims, chunk, nowMs)) return false;
  if (paidTokenFresh(claims, nowMs)) return true;
  if (!offline) return false;
  if (claims.fail_open_until && nowMs < claims.fail_open_until * 1000) return true;
  if (claims.offline_grace && nowMs < (claims.exp + claims.offline_grace) * 1000) return true;
  return false;
}

export type PaidLoadBlock = 'confirm' | 'failed' | 'offline' | 'pending';

/**
 * What to show before a paid chunk loads.
 * A reload verifies the saved token after the first paint. Until that finishes,
 * stay on the loading line. The confirm screen is only for a finished check
 * with no token during amnesty.
 */
export function paidImportBlock(input: {
  ready: boolean;
  claims: EntitlementClaims | null;
  amnesty: boolean;
  token: string;
  chunk: PaidChunkId;
  nowMs: number;
  offline: boolean;
}): PaidLoadBlock | null {
  if (!input.claims) {
    if (!input.ready) return 'pending';
    return input.amnesty ? 'confirm' : 'failed';
  }
  if (!paidChunkAllowedForClient(input.claims, input.chunk, input.nowMs, input.offline)) return 'failed';
  if (!input.token) return input.amnesty ? 'confirm' : 'failed';
  return null;
}

export function filesForAllowedChunks(
  claims: EntitlementClaims,
  files: Readonly<Record<string, readonly string[]>>,
  nowMs: number,
): string[] {
  const allowed = new Set<string>();
  for (const id of PAID_CHUNK_IDS) {
    if (!paidChunkAllowed(claims, id, nowMs)) continue;
    for (const file of files[id] ?? []) allowed.add(file);
  }
  return [...allowed];
}
