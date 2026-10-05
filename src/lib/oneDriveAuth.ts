/**
 * Microsoft sign-in for OneDrive. Loaded only when a gym owner connects.
 * Uses MSAL browser (auth code + PKCE). No client secret.
 */

import {
  classifyOneDriveAuthDetail,
  microsoftClientId,
  ONEDRIVE_AUTHORITY,
  ONEDRIVE_SCOPES,
  type OneDriveAuthCode,
} from './oneDrive.ts';

export type OneDriveTokenOutcome =
  | { ok: true; token: string; accountLabel: string | null }
  | { ok: false; code: OneDriveAuthCode; detail: string | null };

type MsalApp = {
  initialize: () => Promise<void>;
  loginPopup: (request: { scopes: string[]; prompt?: string }) => Promise<{
    accessToken?: string;
    account?: { username?: string } | null;
  }>;
  clearCache: () => Promise<void>;
};

let clientPromise: Promise<MsalApp> | null = null;
let clientFor = '';

function authDetail(reason: unknown): string | null {
  if (!reason || typeof reason !== 'object') {
    return reason instanceof Error ? reason.message : null;
  }
  const row = reason as { errorCode?: string; errorMessage?: string; message?: string };
  const parts = [row.errorCode, row.errorMessage, row.message].filter((part): part is string => Boolean(part));
  return parts.join(' ') || null;
}

async function msalApp(clientId: string): Promise<MsalApp> {
  if (clientPromise && clientFor === clientId) return clientPromise;
  clientFor = clientId;
  clientPromise = (async () => {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const redirectUri = window.location.origin;
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: ONEDRIVE_AUTHORITY,
        redirectUri,
        navigateToLoginRequestUrl: false,
      },
      cache: {
        cacheLocation: 'sessionStorage',
      },
    });
    await app.initialize();
    return app;
  })();
  try {
    return await clientPromise;
  } catch (reason) {
    clientPromise = null;
    clientFor = '';
    throw reason;
  }
}

/** Popup sign-in. Returns a Graph access token for the signed-in account. */
export async function requestOneDriveConsent(): Promise<OneDriveTokenOutcome> {
  const clientId = microsoftClientId();
  if (!clientId) return { ok: false, code: 'missing-client', detail: null };
  if (typeof window === 'undefined') {
    return { ok: false, code: 'failed', detail: 'OneDrive sign-in needs a browser.' };
  }
  try {
    const app = await msalApp(clientId);
    const result = await app.loginPopup({
      scopes: [...ONEDRIVE_SCOPES],
      prompt: 'select_account',
    });
    if (!result.accessToken) return { ok: false, code: 'failed', detail: null };
    return {
      ok: true,
      token: result.accessToken,
      accountLabel: result.account?.username ?? null,
    };
  } catch (reason) {
    const detail = authDetail(reason);
    return { ok: false, code: classifyOneDriveAuthDetail(detail), detail };
  }
}

/** Drop the local Microsoft session. Does not revoke the gym's OneDrive grant. */
export async function clearOneDriveMsalCache(): Promise<void> {
  const clientId = microsoftClientId();
  if (!clientId || typeof window === 'undefined' || !clientPromise) return;
  try {
    const app = await clientPromise;
    await app.clearCache();
  } catch {
    /* local binding clear still disconnects this phone */
  } finally {
    clientPromise = null;
    clientFor = '';
  }
}
