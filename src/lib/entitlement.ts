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

function relocked(door: Door): boolean {
  if (door === 'pro') return readItem(PRO_RELOCK_KEY) === '1';
  if (door === 'coach') return readItem(COACH_RELOCK_KEY) === '1';
  if (door === 'white') return readItem(WHITE_RELOCK_KEY) === '1';
  if (door === 'media') {
    const mark = readItem(MEDIA_RELOCK_KEY);
    // A Lock Pro from before Media existed set only the Pro marks. Treat that browser as
    // Media-locked too until something reopens Media (which writes '0').
    if (mark === null) return readItem(PRO_RELOCK_KEY) === '1';
    return mark === '1';
  }
  return readItem(STUDENT_RELOCK_KEY) === '1';
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
  // Tier rule from tierImplications.ts: Pro opens Coach, Student and White; Coach opens White.
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

/** License id the server signs into an owner-test token (`sub`). */
export const OWNER_TEST_LICENSE_ID = 'owner-test';

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
 * Lock is symmetric with unlock: Lock Pro closes Pro, Coach, Student Edition, White and
 * Media; Lock Coach closes Coach and White.
 * The relock marks win over the stored pass, owner-test doors, and legacy flags in doorOpen.
 *
 * keepOtherwiseOpen (used by Lock Media): an implied door stays open when another tier
 * that is still open, and is not being locked, also opens it. So Lock Media with Coach or
 * Pro still on closes only Media; Lock Media alone closes Media and its White.
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
    const response = await fetch('/api/config', { headers: { accept: 'application/json' } });
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
    await loadPublicConfig();
    retireLegacyUnlockFlags(nowMs(), config.legacyAmnestyEndsAt);
    await reverifyStored();
    noteClock(nowMs());
    if (verified) {
      const claims = verified;
      const token = readItem(ENTITLEMENT_TOKEN_KEY) ?? '';
      void import('./paidChunkCache.ts')
        .then((mod) => mod.syncPaidChunkCache(claims, token))
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
    bootReady = true;
    notifyEntitlement();
  })();
}

export function markEntitlementOffline(value: boolean): void {
  offline = value;
}
