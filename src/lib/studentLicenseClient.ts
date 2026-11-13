/**
 * Browser calls for a free Student license. The claim code and the email
 * stay in the request body. Nothing here writes them to a log.
 */

import { keepStudentSideToken, wouldDowngradePass } from './passDowngrade.ts';
import { joinCloudAcademy } from './academyMembership.ts';
import { acceptServerToken, readDeviceId } from './entitlement.ts';
import { ENTITLEMENT_TOKEN_KEY } from './entitlement.ts';
import { readStoredEntitlementToken, saveInboxPass } from './studentInboxClient.ts';
import { applyServerGrant } from './serverGrant.ts';

export type StudentLicenseRow = {
  status: string;
  createdAt: string;
  claimed: boolean;
  code?: string;
  invite?: string;
};

export type HalfOffPointer = { code: string; usesLeft: number; maxUses: number; percentOff?: number | null };

export type StudentLicenseList = {
  ok: true;
  role: 'owner' | 'seat';
  left: number;
  cap: number;
  claims: StudentLicenseRow[];
  halfOff?: HalfOffPointer | null;
};

export type StudentLicenseFailure = { ok: false; error: string; setup?: boolean };

export type StudentLicenseClaimResult = {
  ok: true;
  token: string;
  grants: string[];
  gymId: string;
  deviceId: string;
  cloud: boolean;
  studentPass?: string;
};

function readToken(): string {
  try {
    return localStorage.getItem(ENTITLEMENT_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

async function postJson(path: string, body: unknown, fetcher: typeof fetch): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetcher(path, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  let parsed: unknown = {};
  try {
    parsed = await response.json();
  } catch {
    parsed = {};
  }
  const record = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return { status: response.status, body: record };
}

function failure(body: Record<string, unknown>, fallback: string): StudentLicenseFailure {
  return {
    ok: false,
    error: typeof body.error === 'string' && body.error ? body.error : fallback,
    ...(body.setup === true ? { setup: true } : {}),
  };
}

export async function listStudentLicenses(fetcher: typeof fetch = fetch): Promise<StudentLicenseList | StudentLicenseFailure> {
  const token = readToken();
  if (!token) return { ok: false, error: 'Sign in on this device to see free Student licenses.' };
  try {
    const { status, body } = await postJson('/api/student-licenses/list', { token }, fetcher);
    if (status >= 400 || body.ok !== true) return failure(body, 'Free Student licenses could not be loaded.');
    return body as unknown as StudentLicenseList;
  } catch {
    return { ok: false, error: 'Free Student licenses could not be loaded.' };
  }
}

export async function issueStudentLicense(
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; code: string; invite?: string; left: number; cap: number } | StudentLicenseFailure> {
  const token = readToken();
  if (!token) return { ok: false, error: 'Sign in on this device to issue a free Student license.' };
  try {
    const { status, body } = await postJson('/api/student-licenses/issue', { token }, fetcher);
    if (status >= 400 || body.ok !== true || typeof body.code !== 'string') {
      return failure(body, 'Could not issue a free Student license.');
    }
    return {
      ok: true,
      code: body.code,
      ...(typeof body.invite === 'string' ? { invite: body.invite } : {}),
      left: Number(body.left ?? 0),
      cap: Number(body.cap ?? 5),
    };
  } catch {
    return { ok: false, error: 'Could not issue a free Student license.' };
  }
}

export async function revokeStudentLicense(
  code: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: true; left: number; cap: number; claimed: boolean } | StudentLicenseFailure> {
  const token = readToken();
  if (!token) return { ok: false, error: 'Sign in on this device to revoke a free Student license.' };
  try {
    const { status, body } = await postJson('/api/student-licenses/revoke', { token, code }, fetcher);
    if (status >= 400 || body.ok !== true) return failure(body, 'Could not revoke that code.');
    return { ok: true, left: Number(body.left ?? 0), cap: Number(body.cap ?? 5), claimed: body.claimed === true };
  } catch {
    return { ok: false, error: 'Could not revoke that code.' };
  }
}

export async function claimStudentLicense(
  input: { code: string; email: string },
  fetcher: typeof fetch = fetch,
): Promise<StudentLicenseClaimResult | StudentLicenseFailure> {
  try {
    const { status, body } = await postJson(
      '/api/student-licenses/claim',
      { code: input.code, email: input.email, deviceId: readDeviceId() },
      fetcher,
    );
    if (status >= 400 || body.ok !== true || typeof body.token !== 'string' || typeof body.gymId !== 'string') {
      return failure(body, 'This free Student license could not be claimed.');
    }
    return {
      ok: true,
      token: body.token,
      grants: Array.isArray(body.grants) ? body.grants.filter((door): door is string => typeof door === 'string') : ['student'],
      gymId: body.gymId,
      deviceId: typeof body.deviceId === 'string' ? body.deviceId : '',
      cloud: body.cloud === true,
      ...(typeof body.studentPass === 'string' ? { studentPass: body.studentPass } : {}),
    };
  } catch {
    return { ok: false, error: 'This free Student license could not be claimed.' };
  }
}

export type AppliedStudentLicense = { applied: boolean; keptHigher: boolean };

/**
 * Save the pass on this browser and connect the gym, the way a coach-connect
 * scan links a student to the academy. The home-screen app still uses Restore.
 *
 * One no-downgrade rule (passDowngrade.ts, shared with code redeem): a higher pass
 * already here (Instructor seat, Media / Instructor / Pro license, owner) is never
 * replaced, because it already opens Student Edition. The Student pass is kept
 * beside it instead, and the academy join and student inbox pass still save.
 */
export async function applyClaimedStudentLicense(
  result: StudentLicenseClaimResult,
  gymName: string,
  storage: Storage = localStorage,
): Promise<AppliedStudentLicense> {
  applyServerGrant({ grants: result.grants });
  joinCloudAcademy(storage, { license: result.gymId, gymName });
  if (result.studentPass) saveInboxPass(storage, result.studentPass);
  if (wouldDowngradePass(readStoredEntitlementToken(storage), result.token)) {
    keepStudentSideToken(storage, result.token);
    return { applied: false, keptHigher: true };
  }
  const applied = await acceptServerToken(result.token);
  return { applied, keptHigher: false };
}
