import {
  TOKEN_AUD,
  TOKEN_ISS,
  TOKEN_VERSION,
  parsePrivateJwk,
  publicJwkOf,
  signToken,
  type Door,
  type EntitlementClaims,
  type PrivateJwk,
  type PublicJwk,
  type SubscriptionClaim,
  type TokenSource,
  type TokenTier,
} from '../lib/entitlementToken.ts';
import {
  ONETIME_FAIL_OPEN_DAYS,
  ONETIME_TOKEN_DAYS,
  PRO_OFFLINE_GRACE_DAYS,
  PRO_TOKEN_DAYS,
} from './paywallDecisions.ts';

const DAY = 24 * 60 * 60;

export type TokenKind = 'pro' | 'onetime' | 'code' | 'owner-test';

export type IssueInput = {
  licenseId: string;
  grants: Door[];
  tier: TokenTier;
  src: TokenSource;
  deviceId: string;
  now: Date;
  kind: TokenKind;
  /** Owner-test duration in seconds. The token ends then, with no extra offline days. */
  ownerTestSeconds?: number;
  /** Keep this exact expiry, used when refreshing an owner-test token. */
  absoluteExp?: number;
  /** Hard end for a code grant, such as the 90-day free White campaign. */
  grantEndsAt?: string | null;
  emailHint?: string;
  thumbprint?: string;
  subs?: SubscriptionClaim;
  kid?: string;
};

export function signingMaterial(secret: string | undefined, keyId = 'k1'): { kid: string; privateJwk: PrivateJwk; publicJwk: PublicJwk } | null {
  const privateJwk = parsePrivateJwk(secret);
  if (!privateJwk) return null;
  return { kid: keyId.trim() || 'k1', privateJwk, publicJwk: publicJwkOf(privateJwk) };
}

export function lifetimeFor(input: IssueInput): Pick<EntitlementClaims, 'exp' | 'refresh_after' | 'fail_open_until' | 'offline_grace'> {
  const now = Math.floor(input.now.getTime() / 1000);
  const cap = input.grantEndsAt ? Math.floor(Date.parse(input.grantEndsAt) / 1000) : null;
  const bounded = (seconds: number) => (cap && Number.isFinite(cap) ? Math.min(now + seconds, cap) : now + seconds);
  if (input.absoluteExp && input.absoluteExp > now) {
    return { exp: input.absoluteExp, refresh_after: now + Math.min(DAY, input.absoluteExp - now) };
  }
  if (input.kind === 'owner-test') {
    const seconds = Math.max(60, input.ownerTestSeconds ?? 7 * DAY);
    return { exp: now + seconds, refresh_after: now + Math.min(DAY, seconds) };
  }
  if (input.kind === 'pro') {
    return {
      exp: bounded(PRO_TOKEN_DAYS * DAY),
      refresh_after: now + DAY,
      offline_grace: PRO_OFFLINE_GRACE_DAYS * DAY,
    };
  }
  if (input.kind === 'onetime') {
    const exp = bounded(ONETIME_TOKEN_DAYS * DAY);
    const failOpen = bounded((ONETIME_TOKEN_DAYS + ONETIME_FAIL_OPEN_DAYS) * DAY);
    return { exp, refresh_after: now + 7 * DAY, fail_open_until: failOpen };
  }
  return {
    exp: bounded(ONETIME_TOKEN_DAYS * DAY),
    refresh_after: now + DAY,
    offline_grace: PRO_OFFLINE_GRACE_DAYS * DAY,
  };
}

export async function issueToken(secret: string | undefined, input: IssueInput, keyId = 'k1'): Promise<string | null> {
  const material = signingMaterial(secret, keyId);
  if (!material || input.grants.length === 0) return null;
  const now = Math.floor(input.now.getTime() / 1000);
  const life = lifetimeFor(input);
  const claims: EntitlementClaims = {
    iss: TOKEN_ISS,
    aud: TOKEN_AUD,
    kid: material.kid,
    sub: input.licenseId,
    grants: input.grants,
    tier: input.tier,
    src: input.src,
    exp: life.exp,
    iat: now,
    nbf: now,
    refresh_after: life.refresh_after,
    did: input.deviceId,
    v: TOKEN_VERSION,
  };
  if (life.fail_open_until) claims.fail_open_until = life.fail_open_until;
  if (life.offline_grace) claims.offline_grace = life.offline_grace;
  if (input.emailHint) claims.eh = input.emailHint;
  if (input.thumbprint) claims.cnf = input.thumbprint;
  if (input.subs) claims.subs = input.subs;
  if (claims.exp <= now) return null;
  return signToken(claims, material.privateJwk);
}
