/**
 * Email + password sign-in, browser side. Server: src/server/loginAccount.ts.
 *
 * The session lives in an HttpOnly cookie the page cannot read. This module only
 * keeps a display hint (the masked email) so menus can say "Account" instead of
 * "Sign in" before /api/login/me answers.
 */

import { appVersionHeaders } from './appCapability.ts';
import { devicePublicJwk } from './deviceKey.ts';
import { acceptServerToken, entitlementNowMs, entitlementSnapshot, readDeviceId } from './entitlement.ts';
import { base64UrlToBytes } from './entitlementToken.ts';
import { loginPassWouldDowngrade } from './passDowngrade.ts';
import { rememberAccountReference } from './accountReference.ts';
import { joinCloudAcademy } from './academyMembership.ts';
import { saveCoachVia } from './instructorAssessmentClient.ts';
import { installAcceptedSeat, normalizeInstructorPresetId, type InstructorPermissions } from './instructorSeats.ts';
import { ownerPassOutranksSeat } from './ownerPassRank.ts';
import { acceptRestoredToken } from './restoreAccept.ts';
import { applyClaimedStudentLicense } from './studentLicenseClient.ts';
import { writeExtraProfileSlots } from './studentProfiles.ts';

export const LOGIN_HINT_KEY = 'advantage.login.v1';
export const LOGIN_EVENT = 'advantage-login-changed';
export const ACCOUNT_PATH = '/account';

export type InviteGrant = {
  kind: 'student-code' | 'seat';
  gym: string;
  gymName: string;
  issuer: string | null;
  preset: string | null;
  editions: string[];
  features: Partial<Record<keyof InstructorPermissions, boolean>>;
  redeemedAt: string | null;
  active: boolean;
};

export type AccountRole = 'owner' | 'instructor' | 'student' | 'member';

export type AccountProfile = {
  email: string;
  /** From who signed in. An owner is also an instructor for inbox purposes. */
  role?: AccountRole | null;
  roles?: AccountRole[];
  editions: string[];
  tier: string | null;
  license: { grants: { product: string; source: string; status: string; endsAt: string | null }[]; ownerAcademy: boolean; accountId: string | null } | null;
  cloud: { entitled: boolean; edition: string | null; lapsedAt: string | null; owner?: boolean } | null;
  invites: InviteGrant[];
};

export type LoginPayload = {
  ok: true;
  signedIn: true;
  email: string;
  sessionExpiresAt: string;
  profile: AccountProfile;
  deviceId?: string;
  pass?: {
    token: string | null;
    grants: string[];
    accountId?: string;
    extraProfileSlots?: number;
    student?: { gymId: string; studentPass: string | null; grants: string[] };
  };
  seat?: {
    token: string;
    seatId: string;
    gymId: string;
    preset: string | null;
    email: string | null;
    permissions: Partial<InstructorPermissions>;
    permissionsSource?: 'stored' | 'preset' | 'none';
  };
  academy?: { gym: string; gymName: string; viaInstructorId: string | null; coachConnect: string | null };
  warning?: string;
};

export type LoginResult = { ok: true; payload: LoginPayload } | { ok: false; error: string; status: number; setup?: boolean };

export type MeResult = { signedIn: false; available: boolean } | { signedIn: true; payload: LoginPayload };

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLoginHint(): string | null {
  try {
    return storage()?.getItem(LOGIN_HINT_KEY) || null;
  } catch {
    return null;
  }
}

function writeLoginHint(value: string | null): void {
  try {
    const store = storage();
    if (!store) return;
    if (value) store.setItem(LOGIN_HINT_KEY, value);
    else store.removeItem(LOGIN_HINT_KEY);
  } catch {
    /* hint only */
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(LOGIN_EVENT));
}

async function post(path: string, body: Record<string, unknown>, fetchImpl: typeof fetch): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetchImpl(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...appVersionHeaders() },
    body: JSON.stringify(body),
  });
  let parsed: Record<string, unknown> = {};
  try {
    parsed = (await response.json()) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  return { status: response.status, body: parsed };
}

async function deviceFields(): Promise<Record<string, unknown>> {
  let publicJwk: unknown = undefined;
  try {
    publicJwk = await devicePublicJwk();
  } catch {
    publicJwk = undefined;
  }
  return { deviceId: readDeviceId(), publicJwk };
}

async function loginCall(path: string, body: Record<string, unknown>, fallback: string, fetchImpl: typeof fetch): Promise<LoginResult> {
  try {
    const { status, body: answer } = await post(path, { ...body, ...(await deviceFields()) }, fetchImpl);
    if (status >= 400 || answer.ok !== true || answer.signedIn !== true) {
      return {
        ok: false,
        status,
        error: typeof answer.error === 'string' ? answer.error : fallback,
        ...(answer.setup === true ? { setup: true } : {}),
      };
    }
    const payload = answer as unknown as LoginPayload;
    await applyLoginPayload(payload);
    return { ok: true, payload };
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

export function signInWithPassword(email: string, password: string, fetchImpl: typeof fetch = fetch): Promise<LoginResult> {
  return loginCall('/api/login/signin', { email, password }, "That email and password don't match.", fetchImpl);
}

/** First sign-in with the invite code an instructor made for this email. Sets the password. */
export function firstSignInWithInvite(email: string, code: string, password: string, fetchImpl: typeof fetch = fetch): Promise<LoginResult> {
  return loginCall('/api/login/invite', { email, code, password }, "That email and invite code don't match an open invite.", fetchImpl);
}

/** First password for a purchaser, or Forgot password: the restore email code, then a new password. */
export function setPasswordWithEmailCode(
  input: { email: string; challengeId: string; code: string; password: string },
  fetchImpl: typeof fetch = fetch,
): Promise<LoginResult> {
  return loginCall('/api/login/code', input, "That email and code don't match.", fetchImpl);
}

/** Profile for the cookie session. `refreshDevice` also signs this device's passes again. */
export async function fetchAccount(refreshDevice: boolean, fetchImpl: typeof fetch = fetch): Promise<MeResult> {
  try {
    const response = refreshDevice
      ? await post('/api/login/me', await deviceFields(), fetchImpl)
      : await (async () => {
          const r = await fetchImpl('/api/login/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
          let parsed: Record<string, unknown> = {};
          try {
            parsed = (await r.json()) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          return { status: r.status, body: parsed };
        })();
    if (response.body.signedIn !== true) {
      if (readLoginHint()) writeLoginHint(null);
      return { signedIn: false, available: response.body.available !== false && response.status < 500 };
    }
    const payload = response.body as unknown as LoginPayload;
    if (refreshDevice) await applyLoginPayload(payload);
    else writeLoginHint(payload.email);
    return { signedIn: true, payload };
  } catch {
    return { signedIn: false, available: false };
  }
}

/** Ends the server session. Called by Sign out; local data stays (signOut.ts). */
export async function endAccountSession(fetchImpl: typeof fetch = fetch): Promise<void> {
  writeLoginHint(null);
  try {
    await post('/api/login/signout', {}, fetchImpl);
  } catch {
    /* the cookie expires on its own; this browser's pass is already gone */
  }
}

function decodePass(token: string): Record<string, unknown> | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Put everything a sign-in restored onto this device, in one step:
 * the license pass (or the Student license with its gym and inbox pass), the instructor
 * seat with the owner's exact switches, and the academy join with the coach connect code.
 */
export async function applyLoginPayload(payload: LoginPayload, store: Storage | null = storage()): Promise<void> {
  writeLoginHint(payload.email);
  const pass = payload.pass;
  if (pass?.accountId) rememberAccountReference(pass.accountId);
  if (store && typeof pass?.extraProfileSlots === 'number') writeExtraProfileSlots(store, pass.extraProfileSlots);
  if (pass?.token && pass.student && store) {
    await applyClaimedStudentLicense(
      {
        ok: true,
        token: pass.token,
        grants: pass.student.grants,
        gymId: pass.student.gymId,
        deviceId: payload.deviceId ?? '',
        cloud: Boolean(pass.student.studentPass),
        ...(pass.student.studentPass ? { studentPass: pass.student.studentPass } : {}),
      },
      payload.academy?.gymName ?? '',
      store,
    );
  } else if (pass?.token) {
    // Never swap a stronger live pass on this browser for a weaker sign-in pass.
    const here = entitlementSnapshot().claims;
    if (!loginPassWouldDowngrade(here, decodePass(pass.token), Math.floor(entitlementNowMs() / 1000))) {
      await acceptRestoredToken(pass.token);
    }
  }
  const seat = payload.seat;
  if (seat?.token) {
    installAcceptedSeat({
      id: seat.seatId,
      email: seat.email || 'instructor',
      presetId: normalizeInstructorPresetId(seat.preset),
      inviteToken: `login:${seat.seatId}`,
      permissions: seat.permissions,
    });
    // Same rule as accepting an invite link: a seat never replaces an owner or Pro pass.
    if (!ownerPassOutranksSeat(entitlementSnapshot().claims)) await acceptServerToken(seat.token);
  }
  const academy = payload.academy;
  if (academy && store) {
    joinCloudAcademy(store, { license: academy.gym, gymName: academy.gymName });
    if (academy.coachConnect) {
      saveCoachVia(store, { gym: academy.gym, gymName: academy.gymName, viaInstructorId: academy.viaInstructorId, proof: academy.coachConnect });
    }
  }
}
