import { rememberAccountReference } from './accountReference.ts';
import { appVersionHeaders } from './appCapability.ts';
import { signRefreshProof } from './deviceProof.ts';
import { ensureDeviceKey, devicePublicJwk } from './deviceKey.ts';
import {
  acceptServerToken,
  bootTimeoutSignal,
  clearEntitlementToken,
  currentAccessEpoch,
  ENTITLEMENT_TOKEN_KEY,
  markEntitlementOffline,
  readDeviceId,
} from './entitlement.ts';

function readStoredToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Ask the server for a fresh token. A failure leaves the current token in place.
 * A newer pass saved while this request was in flight (owner test, alpha-pro
 * code, checkout) is left alone. The late response must not clear it or put
 * the previous seat token back.
 */
export async function refreshEntitlement(): Promise<boolean> {
  const sent = readStoredToken();
  const epoch = currentAccessEpoch();
  if (!sent) return false;
  const body: Record<string, unknown> = { token: sent, deviceId: readDeviceId() };
  try {
    const pair = await ensureDeviceKey();
    const publicJwk = await devicePublicJwk();
    if (pair && publicJwk) {
      const timestamp = Math.floor(Date.now() / 1000);
      body.publicJwk = publicJwk;
      body.timestamp = timestamp;
      body.proof = await signRefreshProof(pair.privateKey, readDeviceId(), timestamp);
    }
    const response = await fetch('/api/token/refresh', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...appVersionHeaders() },
      body: JSON.stringify(body),
      signal: bootTimeoutSignal(),
    });
    const parsed = (await response.json()) as { ok?: boolean; token?: string; revoked?: boolean; accountId?: string };
    if (currentAccessEpoch() !== epoch || readStoredToken() !== sent) return false;
    if (parsed.revoked) {
      clearEntitlementToken();
      return false;
    }
    if (!response.ok || !parsed.token) {
      markEntitlementOffline(true);
      return false;
    }
    if (currentAccessEpoch() !== epoch || readStoredToken() !== sent) return false;
    markEntitlementOffline(false);
    if (parsed.accountId) rememberAccountReference(parsed.accountId);
    return acceptServerToken(parsed.token);
  } catch {
    markEntitlementOffline(true);
    return false;
  }
}
