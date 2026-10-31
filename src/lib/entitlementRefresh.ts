import { appVersionHeaders } from './appCapability.ts';
import { signRefreshProof } from './deviceProof.ts';
import { ensureDeviceKey, devicePublicJwk } from './deviceKey.ts';
import { acceptServerToken, clearEntitlementToken, ENTITLEMENT_TOKEN_KEY, markEntitlementOffline, readDeviceId } from './entitlement.ts';

/** Ask the server for a fresh token. A failure leaves the current token in place. */
export async function refreshEntitlement(): Promise<boolean> {
  let token = '';
  try {
    token = localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return false;
  }
  if (!token) return false;
  const body: Record<string, unknown> = { token, deviceId: readDeviceId() };
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
    });
    const parsed = (await response.json()) as { ok?: boolean; token?: string; revoked?: boolean };
    if (parsed.revoked) {
      clearEntitlementToken();
      return false;
    }
    if (!response.ok || !parsed.token) {
      markEntitlementOffline(true);
      return false;
    }
    markEntitlementOffline(false);
    return acceptServerToken(parsed.token);
  } catch {
    markEntitlementOffline(true);
    return false;
  }
}
