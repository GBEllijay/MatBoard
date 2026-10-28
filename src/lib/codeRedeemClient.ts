import { applyOwnerTestGrant, clearOwnerTestGrant } from './ownerTestGrant.ts';

const API_CODES_REDEEM_PATH = '/api/codes/redeem';
const API_CHECKOUT_CONFIRM_PATH = '/api/checkout-confirm';
const API_OWNER_TEST_PATH = '/api/owner-test';
import { applyServerGrant } from './serverGrant.ts';

export type RedeemResult = { ok: true } | { ok: false; error: string };

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
    const response = await fetch(API_CODES_REDEEM_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, email: email || undefined }),
    });
    if (response.status === 429) return { ok: false, error: await readError(response, 'Too many attempts. Wait a few minutes and try again.') };
    const body = (await response.json()) as { ok?: boolean; error?: string; grants?: string[]; expiresAt?: string | null };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "That code didn't work." };
    if (!applyServerGrant(body)) return { ok: false, error: "That code didn't work." };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not check that code. Check your connection and try again.' };
  }
}

export async function confirmCheckoutSession(sessionId: string): Promise<
  { ok: true; product?: string; grants: string[] } | { ok: false; error: string }
> {
  try {
    const response = await fetch(API_CHECKOUT_CONFIRM_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const body = (await response.json()) as { ok?: boolean; entitled?: boolean; error?: string; product?: string; grants?: string[] };
    if (!response.ok || !body.entitled || !body.ok) {
      return { ok: false, error: body.error || "That payment isn't confirmed." };
    }
    const grants = Array.isArray(body.grants) ? body.grants.filter((door) => typeof door === 'string') : [];
    applyServerGrant({ grants });
    return { ok: true, product: body.product, grants };
  } catch {
    return { ok: false, error: 'Could not confirm that payment. Check your connection and try again.' };
  }
}

export async function submitOwnerTest(input: {
  secret: string;
  tier: string;
  days: number;
  action?: 'grant' | 'clear';
}): Promise<RedeemResult> {
  if (input.action === 'clear' && !input.secret.trim()) {
    clearOwnerTestGrant();
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
    };
    if (!response.ok || !body.ok) return { ok: false, error: body.error || "That code didn't work." };
    if (body.cleared || input.action === 'clear') {
      clearOwnerTestGrant();
      return { ok: true };
    }
    if (!applyOwnerTestGrant(body)) return { ok: false, error: "That code didn't work." };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}
