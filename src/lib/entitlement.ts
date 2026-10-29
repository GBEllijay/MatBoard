/**
 * One entitlement module. Hooks keep their names and read this.
 * A signed token is checked here. Hand-edited unlock flags count only until
 * the amnesty instant, and only for the keys in legacyUnlock.ts.
 */

import {
  verifyToken,
  type Door,
  type EntitlementClaims,
  type PublicJwk,
} from './entitlementToken.ts';
import {
  amnestyOpen,
  COACH_RELOCK_KEY,
  LEGACY_AMNESTY_ENDS_AT,
  noteLegacyAccess,
  PRO_RELOCK_KEY,
  retireLegacyUnlockFlags,
  STUDENT_RELOCK_KEY,
  WHITE_RELOCK_KEY,
} from './legacyUnlock.ts';
import { ownerTestActive, subscribeOwnerTest } from './ownerTestGrant.ts';
import { noteSeatSunset } from './seatSunset.ts';

export const ENTITLEMENT_TOKEN_KEY = 'advantage.entitlement.token';
export const ENTITLEMENT_CLOCK_KEY = 'advantage.entitlement.clock';
export const ENTITLEMENT_CONFIG_KEY = 'advantage.entitlement.config';
export const ENTITLEMENT_DEVICE_KEY = 'advantage.device.id';
export const APP_VERSION = '2';

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

function nowMs(): number {
  return clockOverride ? clockOverride() : Date.now();
}

export function entitlementNowMs(): number {
  return nowMs();
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
  return readItem(STUDENT_RELOCK_KEY) === '1';
}

function legacyFlag(door: Door): boolean {
  if (!amnestyOpen(nowMs(), config.legacyAmnestyEndsAt)) return false;
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
  if (door === 'student' && (verified.grants.includes('student') || verified.grants.includes('pro'))) return true;
  if (door === 'coach' && verified.grants.includes('pro')) return true;
  return verified.grants.includes(door);
}

/** Doors that are open on this device right now. */
export function amnestyStillOpen(): boolean {
  return amnestyOpen(nowMs(), config.legacyAmnestyEndsAt);
}

export function doorOpen(door: Door): boolean {
  if (relocked(door)) return false;
  if (tokenGrants(door)) return true;
  if (ownerTestActive(door)) return true;
  if (door === 'student' && ownerTestActive('pro')) return true;
  return legacyFlag(door);
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
    notifyEntitlement();
  })();
}

export function markEntitlementOffline(value: boolean): void {
  offline = value;
}
