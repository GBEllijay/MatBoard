/** Browser copy of an owner-test result. The secret never lives here. */

export const OWNER_TEST_STORAGE_KEY = 'advantage.ownerTest.v1';

export type OwnerTestDoor = 'white' | 'student' | 'coach' | 'pro' | 'seat';

export type OwnerTestGrant = {
  v: 1;
  source: 'owner-test';
  grants: OwnerTestDoor[];
  expiresAt: string;
  tier: string;
};

const listeners = new Set<() => void>();
const ACCESS_EVENT = 'advantage-access';

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): OwnerTestGrant | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<OwnerTestGrant>;
    if (value.v !== 1 || value.source !== 'owner-test') return null;
    if (typeof value.expiresAt !== 'string' || Date.parse(value.expiresAt) <= Date.now()) return null;
    if (!Array.isArray(value.grants)) return null;
    const grants = value.grants.filter((door): door is OwnerTestDoor =>
      door === 'white' || door === 'student' || door === 'coach' || door === 'pro' || door === 'seat',
    );
    return { v: 1, source: 'owner-test', grants, expiresAt: value.expiresAt, tier: typeof value.tier === 'string' ? value.tier : '' };
  } catch {
    return null;
  }
}

export function readOwnerTestGrant(): OwnerTestGrant | null {
  return parse(storage()?.getItem(OWNER_TEST_STORAGE_KEY) ?? null);
}

export function ownerTestActive(door: OwnerTestDoor): boolean {
  return readOwnerTestGrant()?.grants.includes(door) ?? false;
}

export function applyOwnerTestGrant(input: { grants?: unknown; expiresAt?: unknown; tier?: unknown }): boolean {
  const store = storage();
  if (!store) return false;
  const grants = Array.isArray(input.grants)
    ? input.grants.filter((door): door is OwnerTestDoor =>
        door === 'white' || door === 'student' || door === 'coach' || door === 'pro' || door === 'seat',
      )
    : [];
  if (!grants.length || typeof input.expiresAt !== 'string') return false;
  const grant: OwnerTestGrant = {
    v: 1,
    source: 'owner-test',
    grants,
    expiresAt: input.expiresAt,
    tier: typeof input.tier === 'string' ? input.tier : '',
  };
  try {
    store.setItem(OWNER_TEST_STORAGE_KEY, JSON.stringify(grant));
  } catch {
    return false;
  }
  notifyOwnerTest();
  return true;
}

export function clearOwnerTestGrant(): void {
  try {
    storage()?.removeItem(OWNER_TEST_STORAGE_KEY);
  } catch {
    /* private mode */
  }
  notifyOwnerTest();
}

export function subscribeOwnerTest(fn: () => void): () => void {
  listeners.add(fn);
  if (typeof window !== 'undefined') window.addEventListener(ACCESS_EVENT, fn);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener(ACCESS_EVENT, fn);
  };
}

export function notifyOwnerTest(): void {
  listeners.forEach((fn) => fn());
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACCESS_EVENT));
}
