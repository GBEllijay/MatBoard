/**
 * Microsoft sign-in for OneDrive. Loaded only when a gym owner connects,
 * and again when Microsoft sends the browser back.
 *
 * This is a full-page redirect (auth code + PKCE). A popup is blocked in the
 * installed app and after the MSAL library loads, so the tap never reached
 * Microsoft. No client secret.
 */

import {
  MSAL_INTERACTION_STATUS_KEY,
  classifyOneDriveAuthDetail,
  clearOneDriveResumeFlag,
  loadMicrosoftClientId,
  markOneDriveResume,
  oneDriveRedirectPending,
  oneDriveRedirectUri,
  oneDriveSignInAction,
  oneDriveSignInFailureCopy,
  ONEDRIVE_AUTHORITY,
  ONEDRIVE_SCOPES,
  ONEDRIVE_SETUP_NEEDED,
  readOneDriveSession,
  writeOneDriveResumeError,
  writeOneDriveSession,
  type OneDriveAuthCode,
  type OneDriveSession,
} from './oneDrive.ts';

export type OneDriveTokenOutcome =
  | { ok: true; token: string; accountLabel: string | null }
  | { ok: false; code: OneDriveAuthCode; detail: string | null };

type MsalResult = {
  accessToken?: string;
  expiresOn?: Date | null;
  account?: { username?: string } | null;
};

type MsalApp = {
  initialize: () => Promise<void>;
  loginRedirect: (request: { scopes: string[]; prompt?: string }) => Promise<void>;
  handleRedirectPromise: () => Promise<MsalResult | null>;
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

function sessionFromResult(result: MsalResult): OneDriveSession | null {
  if (!result.accessToken) return null;
  const expiresAt = result.expiresOn?.getTime() ?? Date.now() + 45 * 60 * 1000;
  return {
    token: result.accessToken,
    expiresAt,
    accountLabel: result.account?.username ?? null,
  };
}

async function msalApp(clientId: string): Promise<MsalApp> {
  if (clientPromise && clientFor === clientId) return clientPromise;
  clientFor = clientId;
  clientPromise = (async () => {
    const { PublicClientApplication } = await import('@azure/msal-browser');
    const redirectUri = oneDriveRedirectUri(window.location.origin);
    const app = new PublicClientApplication({
      auth: {
        clientId,
        authority: ONEDRIVE_AUTHORITY,
        redirectUri,
        navigateToLoginRequestUrl: true,
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

/**
 * Run before the app paints when this load is a return from Microsoft.
 * The first hop may only store the response and go back to the page that
 * started sign-in. The next load exchanges the code and saves the token.
 */
export async function settleOneDriveRedirect(): Promise<void> {
  if (typeof window === 'undefined' || !oneDriveRedirectPending()) return;
  const clientId = await loadMicrosoftClientId();
  if (!clientId) {
    try {
      sessionStorage.removeItem(MSAL_INTERACTION_STATUS_KEY);
    } catch {
      /* a missing id still has to stop the redirect loop */
    }
    writeOneDriveResumeError(ONEDRIVE_SETUP_NEEDED);
    return;
  }
  try {
    const app = await msalApp(clientId);
    const result = await app.handleRedirectPromise();
    const session = result ? sessionFromResult(result) : null;
    if (session) {
      writeOneDriveSession(session);
      markOneDriveResume();
    }
  } catch (reason) {
    const detail = authDetail(reason);
    writeOneDriveResumeError(oneDriveSignInFailureCopy({ code: classifyOneDriveAuthDetail(detail), detail }));
  }
}

/** Send the browser to Microsoft. A saved session skips the redirect. */
export async function requestOneDriveConsent(): Promise<OneDriveTokenOutcome> {
  const clientId = await loadMicrosoftClientId();
  const existing = readOneDriveSession();
  const action = oneDriveSignInAction({ clientId, hasSession: Boolean(existing) });
  if (action === 'unavailable' || !clientId) return { ok: false, code: 'missing-client', detail: null };
  if (typeof window === 'undefined') {
    return { ok: false, code: 'failed', detail: 'OneDrive sign-in needs a browser.' };
  }
  if (action === 'session' && existing) {
    return { ok: true, token: existing.token, accountLabel: existing.accountLabel };
  }
  const redirectUri = oneDriveRedirectUri(window.location.origin);
  if (!redirectUri) {
    return { ok: false, code: 'failed', detail: 'OneDrive sign-in needs a website address.' };
  }
  try {
    markOneDriveResume();
    const app = await msalApp(clientId);
    await app.loginRedirect({
      scopes: [...ONEDRIVE_SCOPES],
      prompt: 'select_account',
    });
    return { ok: false, code: 'redirecting', detail: null };
  } catch (reason) {
    clearOneDriveResumeFlag();
    const detail = authDetail(reason);
    return { ok: false, code: classifyOneDriveAuthDetail(detail), detail };
  }
}

/** Drop the local Microsoft session. Does not revoke the gym's OneDrive grant. */
export async function clearOneDriveMsalCache(): Promise<void> {
  writeOneDriveSession(null);
  clearOneDriveResumeFlag();
  const clientId = await loadMicrosoftClientId();
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
