/**
 * Restore-purchase request from the buy pages and /restore.
 * A signed-in session (the same entitlement pass Sign out discards) is sent
 * to the server; the destination address is chosen server-side.
 */
import { ENTITLEMENT_TOKEN_KEY, entitlementSnapshot, subscribeEntitlement } from './entitlement.ts';
import { maskEmail } from './maskEmail.ts';
import { readRestoreSessionEmail, rememberRestoreSessionEmail } from './restoreSessionEmail.ts';
import { isWhiteRestoreEmail, type WhiteRestoreResult } from './whiteUnlock.ts';

export type RestoreRequestResult =
  | { ok: true; message: string; challengeId: string; emailHint: string }
  | { ok: false; error: string; needsEmail?: boolean };

/** True when this browser has a verified entitlement pass. That is the signed-in session. */
export function restoreSessionOpen(): boolean {
  return Boolean(entitlementSnapshot().claims);
}

export function subscribeRestoreSession(fn: () => void): () => void {
  return subscribeEntitlement(fn);
}

export function readSessionToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function sessionEmailHint(): string {
  return maskEmail(readRestoreSessionEmail());
}

export async function requestRestoreCode(input: {
  email?: string;
  turnstileToken?: string;
  sessionToken?: string;
}): Promise<RestoreRequestResult> {
  const sessionToken = input.sessionToken?.trim() ?? '';
  const email = input.email?.trim() ?? '';
  if (!sessionToken && !isWhiteRestoreEmail(email)) {
    return { ok: false, error: 'Enter the email from your purchase.' };
  }
  try {
    const response = await fetch('/api/restore/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(email && isWhiteRestoreEmail(email) ? { email } : {}),
        turnstileToken: input.turnstileToken || undefined,
        ...(sessionToken ? { sessionToken } : {}),
      }),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      message?: string;
      error?: string;
      challengeId?: unknown;
      emailHint?: unknown;
      needsEmail?: unknown;
    };
    if (!response.ok || !body.ok) {
      return {
        ok: false,
        error: body.error || 'Restore is not available yet.',
        ...(body.needsEmail === true ? { needsEmail: true } : {}),
      };
    }
    if (email && isWhiteRestoreEmail(email)) rememberRestoreSessionEmail(email);
    return {
      ok: true,
      message: body.message || "If that address has a purchase, we've emailed a code.",
      challengeId: typeof body.challengeId === 'string' ? body.challengeId : '',
      emailHint: typeof body.emailHint === 'string' ? body.emailHint : '',
    };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

/** Signed-in Restore purchase: send the pass, and a stored email only for hash fallback. */
export async function startSignedInRestore(): Promise<RestoreRequestResult> {
  const sessionToken = readSessionToken();
  if (!sessionToken) return { ok: false, error: 'That session is not valid.' };
  const email = readRestoreSessionEmail();
  return requestRestoreCode({ sessionToken, email: email || undefined });
}

export type { WhiteRestoreResult };
