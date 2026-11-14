/**
 * The device pass a verified person gets for their license.
 *
 * Same shape the restore code flow issues after its code is confirmed
 * (restoreAccess.ts handleRestoreVerify): owner academy, free Student claim with
 * its gym link, Cloud from the license's own cloud grant, Pro, or a one-time
 * edition. Kept as its own module so email sign-in does not edit the restore
 * handler (feat/restore-signed-in changes that file in parallel). A follow-up can
 * point handleRestoreVerify at this function too.
 */

import { thumbprintJwk, type Door, type PublicJwk } from '../lib/entitlementToken.ts';
import { appVersionOf } from '../lib/appCapability.ts';
import { ensureAccountForLicense } from './accountId.ts';
import { cloudAccessForLicense } from './cloudSubscription.ts';
import type { D1Database } from './d1.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { isPerpetualOwnerAcademyGrant, OWNER_SESSION_SECONDS } from './ownerCloudProvision.ts';
import { countExtraProfileSlots } from './profileSlots.ts';
import { doorsFromStored, grantsForLicense, touchDevice, type StoredGrant } from './purchaseRecords.ts';
import { freeStudentRestoreShape } from './studentLicenses.ts';
import { issueToken, signingMaterial } from './tokenIssue.ts';

export type DevicePassEnv = {
  CODE_HASH_PEPPER?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

export type LicenseSummary = {
  licenseId: string;
  accountId: string;
  doors: Door[];
  grants: StoredGrant[];
  ownerAcademy: boolean;
  tier: string;
  cloud: { entitled: boolean; edition: string | null; lapsedAt: string | null; owner?: boolean } | null;
  student: { gym: string; preset: string; studentPass: string | null } | null;
  extraProfileSlots: number;
};

export async function summarizeLicense(
  db: D1Database,
  env: DevicePassEnv,
  licenseId: string,
  now: Date,
): Promise<LicenseSummary | null> {
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const linked = await ensureAccountForLicense(db, { licenseId, pepper, now });
  const grants = await grantsForLicense(db, licenseId, now);
  const doors = expandGrants(doorsFromStored(grants)) as Door[];
  if (!doors.length) return null;
  const ownerAcademy = grants.some((grant) => isPerpetualOwnerAcademyGrant(grant) && grant.product === 'advantage-pro');
  const pro = doors.includes('pro');
  const student = ownerAcademy ? null : await freeStudentRestoreShape(db, licenseId, now, env);
  const cloudRow = student || ownerAcademy ? null : await cloudAccessForLicense(db, licenseId, now);
  const accountId = linked?.accountId ?? '';
  const extraProfileSlots = accountId ? await countExtraProfileSlots(db, accountId) : 0;
  return {
    licenseId,
    accountId,
    doors,
    grants,
    ownerAcademy,
    tier: ownerAcademy ? 'owner' : student ? 'student' : tierForGrants(doors, pro ? 'stripe' : 'code'),
    cloud: ownerAcademy
      ? { entitled: true, edition: 'pro', lapsedAt: null, owner: true }
      : cloudRow?.tracked
        ? { entitled: Boolean(cloudRow.entitled), edition: cloudRow.edition ?? null, lapsedAt: cloudRow.lapsedAt ?? null }
        : null,
    student: student ? { gym: student.gym, preset: student.preset, studentPass: student.studentPass } : null,
    extraProfileSlots,
  };
}

export async function issueDevicePass(
  db: D1Database,
  env: DevicePassEnv,
  input: {
    summary: LicenseSummary;
    emailHash: string;
    deviceId: string;
    publicJwk?: unknown;
    request: Request;
    now: Date;
  },
): Promise<string | null> {
  const { summary } = input;
  if (!signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID)) return null;
  let thumbprint: string | undefined;
  if (input.publicJwk && typeof input.publicJwk === 'object') {
    const jwk = input.publicJwk as PublicJwk;
    if (jwk.kty === 'EC' && jwk.crv === 'P-256' && typeof jwk.x === 'string' && typeof jwk.y === 'string') {
      thumbprint = await thumbprintJwk(jwk);
    }
  }
  await touchDevice(db, { licenseId: summary.licenseId, deviceId: input.deviceId, thumbprint: thumbprint ?? null, now: input.now });
  const pro = summary.doors.includes('pro');
  const subs = summary.ownerAcademy
    ? undefined
    : summary.student
      ? undefined
      : summary.cloud?.entitled
        ? { state: 'active' as const, cloud: true as const }
        : pro
          ? { state: 'active' as const }
          : undefined;
  return issueToken(
    env.ENTITLEMENT_SIGNING_KEY,
    {
      licenseId: summary.licenseId,
      grants: summary.doors,
      tier: summary.ownerAcademy ? 'owner' : summary.student ? 'student' : tierForGrants(summary.doors, pro ? 'stripe' : 'code'),
      src: summary.ownerAcademy ? 'owner' : summary.student ? 'free' : pro ? 'stripe' : 'code',
      deviceId: input.deviceId,
      now: input.now,
      kind: summary.ownerAcademy ? 'owner-test' : summary.student ? 'onetime' : pro ? 'pro' : 'onetime',
      ownerTestSeconds: summary.ownerAcademy ? OWNER_SESSION_SECONDS : undefined,
      emailHint: input.emailHash.slice(0, 16),
      thumbprint,
      subs,
      gym: summary.student?.gym,
      preset: summary.student?.preset,
      appVersion: appVersionOf(input.request),
    },
    env.ENTITLEMENT_KEY_ID,
  );
}
