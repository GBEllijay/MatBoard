/**
 * Apple sign-in for the gym’s iCloud. Full-page redirect to Apple’s CloudKit
 * page, then back to this site. A popup is not used. No password is collected
 * here, and there is no client secret.
 */

import { isAppleSignInUrl } from './appleCloudKitPublic.ts';
import {
  fetchICloudSignInUrl,
  iCloudSignInAction,
  iCloudSignInFailureCopy,
  ICLOUD_SIGN_IN_FAILED,
  loadICloudConfig,
  markICloudReturn,
  readICloudWebAuthToken,
  type ICloudAuthCode,
} from './iCloud.ts';

export type ICloudTokenOutcome =
  | { ok: true; token: string; accountLabel: string | null }
  | { ok: false; code: ICloudAuthCode; detail: string | null };

function redirectTarget(reason: unknown): string | null {
  if (!reason || typeof reason !== 'object') return null;
  const url = (reason as { redirectURL?: unknown }).redirectURL;
  return typeof url === 'string' && isAppleSignInUrl(url) ? url : null;
}

/** Leave this page for Apple. The callback stores the web auth token. */
export function beginICloudSignIn(redirectURL: string): void {
  if (typeof window === 'undefined' || !isAppleSignInUrl(redirectURL)) return;
  markICloudReturn(`${window.location.pathname}${window.location.search}`);
  window.location.assign(redirectURL);
}

/** Use a saved Apple session, or send the browser to Apple. */
export async function requestICloudConsent(): Promise<ICloudTokenOutcome> {
  const config = await loadICloudConfig();
  const existing = readICloudWebAuthToken();
  const action = iCloudSignInAction({ configured: Boolean(config), hasToken: Boolean(existing) });
  if (action === 'unavailable' || !config) return { ok: false, code: 'missing-config', detail: null };
  if (typeof window === 'undefined') {
    return { ok: false, code: 'failed', detail: 'iCloud sign-in needs a browser.' };
  }
  if (action === 'session' && existing) {
    return { ok: true, token: existing, accountLabel: null };
  }
  try {
    const redirectURL = await fetchICloudSignInUrl(config);
    beginICloudSignIn(redirectURL);
    return { ok: false, code: 'redirecting', detail: null };
  } catch (reason) {
    const redirectURL = redirectTarget(reason);
    if (redirectURL) {
      beginICloudSignIn(redirectURL);
      return { ok: false, code: 'redirecting', detail: null };
    }
    const detail = reason instanceof Error ? reason.message : null;
    return { ok: false, code: 'failed', detail: detail || ICLOUD_SIGN_IN_FAILED };
  }
}

export function iCloudConsentFailure(outcome: Extract<ICloudTokenOutcome, { ok: false }>): string {
  return iCloudSignInFailureCopy(outcome);
}
