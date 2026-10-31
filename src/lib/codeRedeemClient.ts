import { checkoutNonceHash, currentCheckoutNonce } from './checkoutNonce.ts';
import { devicePublicJwk } from './deviceKey.ts';
import { acceptServerToken, clearOwnerTestToken, clearRelocksFor, readDeviceId } from './entitlement.ts';
import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';
import { applyServerGrant } from './serverGrant.ts';

const API_CODES_REDEEM_PATH = '/api/codes/redeem';
const API_SESSION_REDEEM_PATH = '/api/session/redeem';
const API_OWNER_TEST_PATH = '/api/owner-test';

export type RedeemResult = { ok: true } | { ok: false; error: string };

export const GENERIC_CODE_ERROR = "That code didn't work.";
export const UNLOCK_CODE_NO_MATCH = "That unlock code didn't match. Type it exactly as it was given, or ask for a new one.";
export const UNLOCK_CODE_MISMATCH_ERROR = `${UNLOCK_CODE_NO_MATCH} It was not sent to checkout as a promo code.`;

/**
 * True when the text has the shape scripts/generate-unlock-codes.ts prints:
 * 18 letters and digits without 0, 1, O or I, in groups of four. Spaces, dashes and case do not matter.
 * Stripe promo codes like HALF50 do not have this shape.
 */
export function looksLikeUnlockCode(text: string): boolean {
  const compact = text.normalize('NFKC').replace(/[\s-]+/g, '').toUpperCase();
  return /^[A-HJ-NP-Z2-9]{18}$/.test(compact);
}

/** What the /buy code box should do after the server said no to a typed code. */
export function afterFailedUnlock(typed: string, error: string): { action: 'show'; error: string } | { action: 'checkout' } {
  if (error !== GENERIC_CODE_ERROR) return { action: 'show', error };
  if (looksLikeUnlockCode(typed)) return { action: 'show', error: UNLOCK_CODE_MISMATCH_ERROR };
  return { action: 'checkout' };
}

async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

/** Ask the server whether a code opens a door. The browser does not know the codes. */
export async function redeemAccessCode(code: string, email = ''): Promise<RedeemResult> {
  try {
    const publicJwk = await devicePublicJwk();
    const response = await fetch(API_CODES_REDEEM_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, email: email || undefined, deviceId: readDeviceId(), publicJwk }),
    });
    if (response.status === 429) return { ok: false, error: await readError(response, 'Too many attempts. Wait a few minutes and try again.') };
    const body = (await response.json()) as { ok?: boolean; error?: string; grants?: string[]; expiresAt?: string | null; token?: string };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "That code didn't work." };
    if (body.token) await acceptServerToken(body.token);
    if (!applyServerGrant(body) && !body.token) return { ok: false, error: "That code didn't work." };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not check that code. Check your connection and try again.' };
  }
}

export async function confirmCheckoutSession(sessionId: string): Promise<
  { ok: true; product?: string; grants: string[] } | { ok: false; error: string }
> {
  try {
    const publicJwk = await devicePublicJwk();
    const response = await fetch(API_SESSION_REDEEM_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        nonce: currentCheckoutNonce(),
        deviceId: readDeviceId(),
        publicJwk,
      }),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      entitled?: boolean;
      error?: string;
      product?: string;
      grants?: string[];
      token?: string;
    };
    if (!response.ok || !body.entitled || !body.ok) {
      return { ok: false, error: body.error || "That payment isn't confirmed." };
    }
    const grants = Array.isArray(body.grants) ? body.grants.filter((door) => typeof door === 'string') : [];
    if (body.token) {
      // applyServerGrant clears the Lock marks on the flag path. The token path must too.
      if (await acceptServerToken(body.token)) clearRelocksFor(grants);
    } else applyServerGrant({ grants });
    return { ok: true, product: body.product, grants };
  } catch {
    return { ok: false, error: 'Could not confirm that payment. Check your connection and try again.' };
  }
}

export async function withCheckoutNonce(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return { ...body, nonceHash: await checkoutNonceHash() };
}

/** Clear test unlock: the session record and, when the owner test issued it, the stored token. */
export function clearOwnerTestUnlock(): void {
  clearOwnerTestGrant();
  clearOwnerTestToken();
}

/**
 * The Owner test box takes the owner test secret. If someone types an owner or alpha
 * unlock code there instead, try it as an unlock code so the wrong box is not a dead end.
 */
export async function submitOwnerTestOrCode(input: { secret: string; tier: string; days: number }): Promise<RedeemResult & { via?: 'owner-test' | 'code' }> {
  const tested = await submitOwnerTest(input);
  if (tested.ok) return { ok: true, via: 'owner-test' };
  if (tested.error !== GENERIC_CODE_ERROR || !looksLikeUnlockCode(input.secret)) return tested;
  const redeemed = await redeemAccessCode(input.secret);
  if (redeemed.ok) return { ok: true, via: 'code' };
  return redeemed.error === GENERIC_CODE_ERROR ? { ok: false, error: UNLOCK_CODE_NO_MATCH } : redeemed;
}

export async function submitOwnerTest(input: {
  secret: string;
  tier: string;
  days: number;
  action?: 'grant' | 'clear';
}): Promise<RedeemResult> {
  if (input.action === 'clear' && !input.secret.trim()) {
    clearOwnerTestUnlock();
    return { ok: true };
  }
  try {
    const response = await fetch(API_OWNER_TEST_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        secret: input.secret,
        tier: input.tier,
        days: input.days,
        deviceId: readDeviceId(),
        action: input.action === 'clear' ? 'clear' : undefined,
      }),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      error?: string;
      cleared?: boolean;
      grants?: string[];
      expiresAt?: string;
      tier?: string;
      token?: string;
    };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "That code didn't work." };
    if (body.cleared || input.action === 'clear') {
      clearOwnerTestUnlock();
      return { ok: true };
    }
    if (body.token) await acceptServerToken(body.token);
    if (!applyOwnerTestGrant(body) && !body.token) return { ok: false, error: "That code didn't work." };
    // A new owner test reopens the doors an earlier Lock button closed on this browser.
    clearRelocksFor(Array.isArray(body.grants) ? body.grants.filter((door) => typeof door === 'string') : []);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}
