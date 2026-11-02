/**
 * One entitlement module. Hooks keep their names and read this.
 * A signed token is checked here. Hand-edited unlock flags count only until
 * the amnesty instant, and only for the keys in legacyUnlock.ts.
 */

import { CLIENT_APP_VERSION } from './appCapability.ts';
import {
  base64UrlToBytes,
  verifyToken,
  type Door,
  type EntitlementClaims,
  type PublicJwk,
} from './entitlementToken.ts';
import {
  amnestyOpen,
  COACH_RELOCK_KEY,
  LEGACY_AMNESTY_ENDS_AT,
  MEDIA_RELOCK_KEY,
  noteLegacyAccess,
  PRO_RELOCK_KEY,
  retireLegacyUnlockFlags,
  STUDENT_RELOCK_KEY,
  WHITE_RELOCK_KEY,
} from './legacyUnlock.ts';
import { dropOwnerTestDoors, ownerTestActive, subscribeOwnerTest } from './ownerTestGrant.ts';
import { noteSeatSunset } from './seatSunset.ts';

import { doorsThatOpen, impliedDoors } from './tierImplications.ts';

/** License id the server signs into an owner-test token (`sub`). */
export const OWNER_TEST_LICENSE_ID = 'owner-test';

export const ENTITLEMENT_TOKEN_KEY = 'advantage.entitlement.token';
export const ENTITLEMENT_CLOCK_KEY = 'advantage.entitlement.clock';
export const ENTITLEMENT_CONFIG_KEY = 'advantage.entitlement.config';
export const ENTITLEMENT_DEVICE_KEY = 'advantage.device.id';
/** Version 3 understands the Media Edition door. See src/lib/appCapability.ts. */
export const APP_VERSION = CLIENT_APP_VERSION;

const ACCESS_EVENT = 'advantage-access';
const listeners = new Set<() => void>();

type CachedConfig = {
  signing: boolean;
  keys: { kid: string; jwk: PublicJwk }[];
  legacyAmnestyEndsAt: string;
  minAppVersion: string;
  restoreAvailable: boolean;
  turnstileSiteKey: string | null;
  message?: string;
};

let config: CachedConfig = {
  signing: false,
  keys: [],
  legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT,
  minAppVersion: APP_VERSION,
  restoreAvailable: false,
  turnstileSiteKey: null,
};

let verified: EntitlementClaims | null = null;
let clockOverride: (() => number) | null = null;
let offline = false;
/** False until the first boot has reverified a stored token, or given up. */
let bootReady = false;

function nowMs(): number {
  return clockOverride ? clockOverride() : Date.now();
}

export function entitlementNowMs(): number {
  return nowMs();
}

/** The stored token has been checked, or there was nothing to check. */
export function entitlementReady(): boolean {
  return bootReady;
}

/**
 * True when a guard may decide. A browser with no saved pass has nothing to
 * check. A browser with a saved pass waits for bootEntitlement to verify it,
 * so a refresh or deep link does not bounce to /buy or /coming-soon first.
 */
export function entitlementSettled(): boolean {
  return bootReady || !readItem(ENTITLEMENT_TOKEN_KEY);
}

/** Network calls made during boot give up after this, and count as unreachable. */
export const BOOT_NETWORK_TIMEOUT_MS = 8000;

/** A fetch signal that aborts after `ms`. Falls back when AbortSignal.timeout is missing. */
export function bootTimeoutSignal(ms = BOOT_NETWORK_TIMEOUT_MS): AbortSignal | undefined {
  try {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') return AbortSignal.timeout(ms);
    if (typeof AbortController === 'undefined') return undefined;
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  } catch {
    return undefined;
  }
}

export function setEntitlementReadyForTests(ready: boolean): void {
  bootReady = ready;
}

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readItem(key: string): string | null {
  try {
    return store()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeItem(key: string, value: string): void {
  try {
    store()?.setItem(key, value);
  } catch {
    /* quota or private mode */
  }
}

function removeItem(key: string): void {
  try {
    store()?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function setEntitlementClockForTests(fn: (() => number) | null): void {
  clockOverride = fn;
}

export function setEntitlementConfigForTests(next: Partial<CachedConfig> | null): void {
  if (!next) {
    config = {
      signing: false,
      keys: [],
      legacyAmnestyEndsAt: LEGACY_AMNESTY_ENDS_AT,
      minAppVersion: APP_VERSION,
      restoreAvailable: false,
      turnstileSiteKey: null,
    };
    return;
  }
  config = { ...config, ...next };
}

export function subscribeEntitlement(fn: () => void): () => void {
  listeners.add(fn);
  const offTest = subscribeOwnerTest(fn);
  if (typeof window !== 'undefined') window.addEventListener(ACCESS_EVENT, fn);
  return () => {
    listeners.delete(fn);
    offTest();
    if (typeof window !== 'undefined') window.removeEventListener(ACCESS_EVENT, fn);
  };
}

export function notifyEntitlement(): void {
  listeners.forEach((fn) => fn());
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ACCESS_EVENT));
}

function noteClock(ms: number): void {
  const previous = Number(readItem(ENTITLEMENT_CLOCK_KEY) ?? '0');
  if (ms > previous) writeItem(ENTITLEMENT_CLOCK_KEY, String(ms));
}

export function clockRolledBack(ms = nowMs()): boolean {
  const previous = Number(readItem(ENTITLEMENT_CLOCK_KEY) ?? '0');
  return previous > 0 && ms + 5 * 60 * 1000 < previous;
}

function relockMark(door: Door): boolean {
  if (door === 'pro') return readItem(PRO_RELOCK_KEY) === '1';
  if (door === 'coach') return readItem(COACH_RELOCK_KEY) === '1';
  if (door === 'white') return readItem(WHITE_RELOCK_KEY) === '1';
  if (door === 'media') return readItem(MEDIA_RELOCK_KEY) === '1';
  return readItem(STUDENT_RELOCK_KEY) === '1';
}

function seatTokenActive(): boolean {
  return Boolean(verified && tokenUsable(verified, nowMs()) && (verified.tier === 'seat' || verified.src === 'seat'));
}

/**
 * Owner test, or a signed owner pass, is open for a door at Media or above.
 * A seat token is not an owner pass. Pro's own relock does not count as closed here:
 * the caller uses this only to ignore the pre-Media Lock Pro fallback.
 */
function ownerPassActive(): boolean {
  if (ownerTestActive('pro') || ownerTestActive('coach') || ownerTestActive('media')) return true;
  if (!verified || !tokenUsable(verified, nowMs())) return false;
  if (verified.tier === 'seat' || verified.src === 'seat') return false;
  const owner = verified.src === 'owner' || verified.tier === 'owner' || verified.sub === OWNER_TEST_LICENSE_ID;
  if (!owner) return false;
  return impliedDoors(verified.grants).some((door) => door === 'pro' || door === 'coach' || door === 'media');
}

/** True when this door is open only because the signed token is a seat. */
function seatExplainsDoor(door: Door): boolean {
  if (!seatTokenActive()) return false;
  const sources = doorsThatOpen(door);
  if (sources.some((source) => ownerTestActive(source) || legacyFlag(source))) return false;
  return true;
}

/**
 * A strictly higher door is open on its own. Seat tokens do not count: a seat follows
 * its invite preset for Media Console and must not reopen the Media door.
 */
function higherDoorOpen(door: Door): boolean {
  return doorsThatOpen(door).some((source) => source !== door && doorOpen(source) && !seatExplainsDoor(source));
}

function relocked(door: Door): boolean {
  // Lock Pro and Lock Coach still close that door. A higher tier does not reopen them.
  if (door === 'pro' || door === 'coach') return relockMark(door);
  if (door === 'media') {
    const mark = readItem(MEDIA_RELOCK_KEY);
    // A Lock Pro from before Media existed set only the Pro mark. Keep Media shut until a
    // grant writes '0', unless an owner pass is open (that pass includes Media).
    if (mark === null && readItem(PRO_RELOCK_KEY) === '1') return !ownerPassActive();
    if (mark === '1' && higherDoorOpen(door)) return false;
    return mark === '1';
  }
  // Student and White: the same stale-relock rule. An open higher tier reopens them.
  // With no higher door open, Lock Student, Lock White, and Lock Media still hold.
  if (relockMark(door) && higherDoorOpen(door)) return false;
  return relockMark(door);
}

function legacyFlag(door: Door): boolean {
  if (!amnestyOpen(nowMs(), config.legacyAmnestyEndsAt)) return false;
  // Media Edition is newer than the old on-device switches. It has no legacy flag.
  if (door === 'media') return false;
  if (door === 'white') {
    if (readItem('advantage.whiteUnlocked') !== '1') return false;
    const expiry = readItem('advantage.whiteExpiresAt');
    if (!expiry) return true;
    const ends = Date.parse(expiry);
    return Number.isFinite(ends) && ends > nowMs();
  }
  if (door === 'coach') return readItem('advantage.coachUnlocked') === '1';
  if (door === 'pro') return readItem('advantage.proUnlocked') === '1';
  if (readItem('advantage.studentEditionUnlocked') === '1') return true;
  return readItem('advantage.studentUnlocked') === '1';
}

function subscriptionPaused(claims: EntitlementClaims, ms: number): boolean {
  if (!claims.subs) return false;
  if (claims.subs.state === 'locked') return true;
  if (claims.subs.state === 'grace' && claims.subs.lock_at && ms >= Date.parse(claims.subs.lock_at)) return true;
  if (claims.subs.ends_at && ms >= Date.parse(claims.subs.ends_at) && claims.subs.state !== 'grace') return true;
  return false;
}

/** Pro is paused. One-time doors on the same token stay open. */
export function proAccessPaused(): boolean {
  return Boolean(verified && subscriptionPaused(verified, nowMs()));
}

export function proGraceNotice(): { lockAt: string; seat: boolean; endsAt: string } | null {
  if (!verified?.subs || verified.subs.state !== 'grace') return null;
  if (subscriptionPaused(verified, nowMs())) return null;
  return {
    lockAt: verified.subs.lock_at ?? '',
    endsAt: verified.subs.ends_at ?? '',
    seat: verified.tier === 'seat' || verified.src === 'seat',
  };
}

export function proEndsNotice(): { endsAt: string } | null {
  if (!verified?.subs?.ends_at || verified.subs.state === 'locked') return null;
  if (subscriptionPaused(verified, nowMs())) return null;
  return { endsAt: verified.subs.ends_at };
}

function tokenUsable(claims: EntitlementClaims, ms: number): boolean {
  if (clockRolledBack(ms)) return false;
  if (ms < claims.nbf * 1000) return false;
  if (ms < claims.exp * 1000) return true;
  const unreachable = offline || (typeof navigator !== 'undefined' && navigator.onLine === false);
  if (!unreachable) return false;
  if (claims.fail_open_until && ms < claims.fail_open_until * 1000) return true;
  if (claims.offline_grace && ms < (claims.exp + claims.offline_grace) * 1000) return true;
  return false;
}

function tokenGrants(door: Door): boolean {
  if (!verified) return false;
  if (!tokenUsable(verified, nowMs())) return false;
  const paused = subscriptionPaused(verified, nowMs());
  if (paused && door === 'pro') return false;
  if (paused && verified.subs?.state === 'locked') return verified.grants.includes(door);
  if (paused && (door === 'student' || door === 'coach')) return false;
  // Tier rule from tierImplications.ts (owner 2026-11-01): every tier opens every tier below it (White < Student < Media < Coach < Pro).
  if (paused && door === 'white') return verified.grants.includes('white') && !verified.grants.includes('pro');
  if (paused && door === 'media') return verified.grants.includes('media') && !verified.grants.includes('pro');
  // Seats follow their invite preset for Media Console (paidChunkAccess.ts), not a Media door.
  if (door === 'media' && (verified.tier === 'seat' || verified.src === 'seat')) return false;
  return impliedDoors(verified.grants).includes(door);
}

/** Doors that are open on this device right now. */
export function amnestyStillOpen(): boolean {
  return amnestyOpen(nowMs(), config.legacyAmnestyEndsAt);
}

export function doorOpen(door: Door): boolean {
  if (relocked(door)) return false;
  if (tokenGrants(door)) return true;
  const sources = doorsThatOpen(door);
  if (sources.some((source) => ownerTestActive(source))) return true;
  return sources.some((source) => legacyFlag(source));
}

export function entitlementSnapshot(): {
  claims: EntitlementClaims | null;
  amnesty: boolean;
  signing: boolean;
  restoreAvailable: boolean;
  message?: string;
  updateRequired: boolean;
} {
  return {
    claims: verified,
    amnesty: amnestyOpen(nowMs(), config.legacyAmnestyEndsAt),
    signing: config.signing,
    restoreAvailable: config.restoreAvailable,
    message: config.message,
    updateRequired: config.minAppVersion.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0,
  };
}

export function readDeviceId(): string {
  const existing = readItem(ENTITLEMENT_DEVICE_KEY);
  if (existing) return existing;
  const created = crypto.randomUUID();
  writeItem(ENTITLEMENT_DEVICE_KEY, created);
  return created;
}

export async function acceptServerToken(token: string): Promise<boolean> {
  if (!config.keys.length) await loadPublicConfig();
  const claims = await verifyToken(token, config.keys);
  if (!claims) return false;
  verified = claims;
  writeItem(ENTITLEMENT_TOKEN_KEY, token);
  noteClock(nowMs());
  if (claims.did) writeItem(ENTITLEMENT_DEVICE_KEY, claims.did);
  notifyEntitlement();
  void import('./paidChunkCache.ts')
    .then((mod) => mod.syncPaidChunkCache(claims, token))
    .catch(() => undefined);
  return true;
}

export function clearEntitlementToken(): void {
  verified = null;
  removeItem(ENTITLEMENT_TOKEN_KEY);
  notifyEntitlement();
  void import('./paidChunkCache.ts')
    .then((mod) => mod.clearPaidChunkCache())
    .catch(() => undefined);
}

function storedTokenSubject(): string | null {
  const token = readItem(ENTITLEMENT_TOKEN_KEY);
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const claims = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as { sub?: unknown };
    return typeof claims.sub === 'string' ? claims.sub : null;
  } catch {
    return null;
  }
}

/**
 * Clear test unlock. Removes the stored token only when the owner test issued
 * it. A paid, code, or seat token on this browser stays.
 */
export function clearOwnerTestToken(): boolean {
  const fromOwnerTest = verified ? verified.sub === OWNER_TEST_LICENSE_ID : storedTokenSubject() === OWNER_TEST_LICENSE_ID;
  if (!fromOwnerTest) return false;
  clearEntitlementToken();
  return true;
}

/**
 * A fresh server grant (owner test or a confirmed checkout token) clears the
 * testing Lock marks for the doors it opens, using the tier table in
 * tierImplications.ts (Pro clears Pro, Coach, Student Edition and White). Other marks stay.
 */
const RELOCK_KEY_FOR: Readonly<Record<Door, string>> = {
  white: WHITE_RELOCK_KEY,
  student: STUDENT_RELOCK_KEY,
  coach: COACH_RELOCK_KEY,
  pro: PRO_RELOCK_KEY,
  media: MEDIA_RELOCK_KEY,
};

/** A new grant reopens every door it implies (tierImplications.ts) that a Lock button closed here. */
export function clearRelocksFor(grants: readonly string[]): void {
  const doors = impliedDoors(grants);
  if (!doors.length) return;
  doors.forEach((door) => {
    // '0' (not removed) so the pre-Media Lock Pro fallback in relocked() stops applying.
    if (door === 'media') writeItem(MEDIA_RELOCK_KEY, '0');
    else removeItem(RELOCK_KEY_FOR[door]);
  });
  notifyEntitlement();
}

/**
 * Lock writes the marks. Lock Pro closes Pro and every door below it. Lock Coach closes
 * the Coach door (a higher Pro door does not reopen Coach). White, Student, and Media
 * marks do not stay shut while a higher door is open; doorOpen applies the ladder.
 *
 * keepOtherwiseOpen (used by Lock Media): don't mark Student or White when Coach or Pro
 * is still open. The Media mark is still written. It holds only when no higher door is open,
 * so Lock Media locks someone who owns only Media.
 */
export function relockImplied(door: Door, options: { keepOtherwiseOpen?: boolean } = {}): Door[] {
  const implied = impliedDoors([door]);
  const doors = options.keepOtherwiseOpen
    ? implied.filter(
        (closed) =>
          closed === door ||
          !doorsThatOpen(closed).some((source) => !implied.includes(source) && doorOpen(source)),
      )
    : implied;
  doors.forEach((closed) => writeItem(RELOCK_KEY_FOR[closed], '1'));
  // The owner-test seat is part of Pro and Coach previews.
  dropOwnerTestDoors(door === 'pro' || door === 'coach' ? [...doors, 'seat'] : doors);
  notifyEntitlement();
  return doors;
}

export async function loadPublicConfig(): Promise<void> {
  try {
    const response = await fetch('/api/config', { headers: { accept: 'application/json' }, signal: bootTimeoutSignal() });
    if (!response.ok) return;
    const body = (await response.json()) as {
      signing?: boolean;
      keys?: { kid?: string; jwk?: PublicJwk }[];
      legacyAmnestyEndsAt?: string;
      minAppVersion?: string;
      restoreAvailable?: boolean;
      turnstileSiteKey?: string | null;
      seatSunsetEndsAt?: string;
      message?: string;
    };
    const keys = Array.isArray(body.keys)
      ? body.keys.filter((key): key is { kid: string; jwk: PublicJwk } => {
          const jwk = key.jwk;
          return Boolean(key.kid && jwk && jwk.kty === 'EC' && jwk.crv === 'P-256' && jwk.x && jwk.y);
        })
      : [];
    config = {
      signing: Boolean(body.signing && keys.length),
      keys,
      legacyAmnestyEndsAt: typeof body.legacyAmnestyEndsAt === 'string' ? body.legacyAmnestyEndsAt : LEGACY_AMNESTY_ENDS_AT,
      minAppVersion: typeof body.minAppVersion === 'string' ? body.minAppVersion : APP_VERSION,
      restoreAvailable: Boolean(body.restoreAvailable),
      turnstileSiteKey: typeof body.turnstileSiteKey === 'string' ? body.turnstileSiteKey : null,
      message: typeof body.message === 'string' ? body.message : undefined,
    };
    if (typeof body.seatSunsetEndsAt === 'string') noteSeatSunset(body.seatSunsetEndsAt);
    writeItem(
      ENTITLEMENT_CONFIG_KEY,
      JSON.stringify({ keys, legacyAmnestyEndsAt: config.legacyAmnestyEndsAt, seatSunsetEndsAt: body.seatSunsetEndsAt }),
    );
  } catch {
    offline = true;
    const cached = readItem(ENTITLEMENT_CONFIG_KEY);
    if (!cached) return;
    try {
      const parsed = JSON.parse(cached) as { keys?: CachedConfig['keys']; legacyAmnestyEndsAt?: string; seatSunsetEndsAt?: string };
      if (Array.isArray(parsed.keys)) config = { ...config, keys: parsed.keys, signing: parsed.keys.length > 0 };
      if (typeof parsed.legacyAmnestyEndsAt === 'string') config.legacyAmnestyEndsAt = parsed.legacyAmnestyEndsAt;
      if (typeof parsed.seatSunsetEndsAt === 'string') noteSeatSunset(parsed.seatSunsetEndsAt);
    } catch {
      /* ignore a damaged cache */
    }
  }
}

async function reverifyStored(): Promise<void> {
  const token = readItem(ENTITLEMENT_TOKEN_KEY);
  if (!token) {
    verified = null;
    return;
  }
  if (!config.keys.length) {
    verified = null;
    return;
  }
  verified = await verifyToken(token, config.keys);
  if (!verified) removeItem(ENTITLEMENT_TOKEN_KEY);
}

export function bootEntitlement(): void {
  noteLegacyAccess();
  retireLegacyUnlockFlags(nowMs(), config.legacyAmnestyEndsAt);
  void (async () => {
    // Guards wait on bootReady (entitlementSettled), so it must flip even when
    // a step throws. A failed check leaves `verified` as it was (null on boot).
    try {
      await loadPublicConfig();
      retireLegacyUnlockFlags(nowMs(), config.legacyAmnestyEndsAt);
      await reverifyStored();
      noteClock(nowMs());
      if (verified) {
        const claims = verified;
        const token = readItem(ENTITLEMENT_TOKEN_KEY) ?? '';
        void import('./paidChunkCache.ts')
          .then((mod) => {
            // Owner test or a code can land while this import is still loading.
            if ((readItem(ENTITLEMENT_TOKEN_KEY) ?? '') !== token) return;
            return mod.syncPaidChunkCache(claims, token);
          })
          .catch(() => undefined);
      }
      if (verified && nowMs() >= verified.refresh_after * 1000) {
        try {
          const { refreshEntitlement } = await import('./entitlementRefresh.ts');
          await refreshEntitlement();
        } catch {
          offline = true;
        }
      }
    } catch {
      /* keep whatever was verified; guards decide on that */
    } finally {
      bootReady = true;
      notifyEntitlement();
    }
  })();
}

export function markEntitlementOffline(value: boolean): void {
  offline = value;
}
