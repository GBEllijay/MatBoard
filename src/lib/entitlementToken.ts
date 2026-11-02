/** Compact ES256 entitlement token. The private key never ships to the browser. */

export const TOKEN_ISS = 'advantage';
export const TOKEN_AUD = 'advantagebjjtimer.com';
export const TOKEN_VERSION = 1;

/**
 * 'media' (Media Edition) is last so the older four keep their order.
 * Clients before MEDIA_APP_VERSION reject a pass with an unknown door, so the
 * server leaves 'media' out of their passes (src/server/tokenIssue.ts passGrantsForApp).
 */
export const DOORS = ['white', 'student', 'coach', 'pro', 'media'] as const;
export type Door = (typeof DOORS)[number];

export type TokenTier = 'owner' | 'pro' | 'coach' | 'student' | 'white' | 'media' | 'seat' | 'alpha';
export type TokenSource = 'stripe' | 'code' | 'free' | 'owner' | 'seat';

/** Present so Phase 3 can lock Pro without changing the token shape. */
export type SubscriptionClaim = {
  state: 'active' | 'grace' | 'locked';
  lock_at?: string;
  ends_at?: string;
};

export type EntitlementClaims = {
  iss: typeof TOKEN_ISS;
  aud: typeof TOKEN_AUD;
  kid: string;
  sub: string;
  eh?: string;
  grants: Door[];
  tier: TokenTier;
  src: TokenSource;
  subs?: SubscriptionClaim;
  exp: number;
  iat: number;
  nbf: number;
  refresh_after: number;
  did: string;
  cnf?: string;
  gym?: string;
  sid?: string;
  preset?: string;
  v: typeof TOKEN_VERSION;
  /** Unix seconds. One-time purchases may keep working until this time while offline. */
  fail_open_until?: number;
  /** Seconds after exp that Pro and code tokens may keep working while offline. */
  offline_grace?: number;
};

export type PublicJwk = { kty: 'EC'; crv: 'P-256'; x: string; y: string };
export type PrivateJwk = PublicJwk & { d: string };

const encoder = new TextEncoder();

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

export function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function publicJwkOf(key: PrivateJwk): PublicJwk {
  return { kty: 'EC', crv: 'P-256', x: key.x, y: key.y };
}

export function parsePrivateJwk(raw: string | undefined | null): PrivateJwk | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PrivateJwk>;
    if (parsed.kty !== 'EC' || parsed.crv !== 'P-256') return null;
    if (typeof parsed.x !== 'string' || typeof parsed.y !== 'string' || typeof parsed.d !== 'string') return null;
    return { kty: 'EC', crv: 'P-256', x: parsed.x, y: parsed.y, d: parsed.d };
  } catch {
    return null;
  }
}

function isDoor(value: unknown): value is Door {
  return (DOORS as readonly unknown[]).includes(value);
}

function isTier(value: unknown): value is TokenTier {
  return (
    value === 'owner' ||
    value === 'pro' ||
    value === 'coach' ||
    value === 'student' ||
    value === 'white' ||
    value === 'media' ||
    value === 'seat' ||
    value === 'alpha'
  );
}

function isSource(value: unknown): value is TokenSource {
  return value === 'stripe' || value === 'code' || value === 'free' || value === 'owner' || value === 'seat';
}

export function claimsFromUnknown(raw: unknown): EntitlementClaims | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<EntitlementClaims>;
  if (row.iss !== TOKEN_ISS || row.aud !== TOKEN_AUD || row.v !== TOKEN_VERSION) return null;
  if (typeof row.kid !== 'string' || typeof row.sub !== 'string' || typeof row.did !== 'string') return null;
  if (!isTier(row.tier) || !isSource(row.src)) return null;
  if (!Array.isArray(row.grants) || !row.grants.every(isDoor)) return null;
  if (typeof row.exp !== 'number' || typeof row.iat !== 'number' || typeof row.nbf !== 'number') return null;
  if (typeof row.refresh_after !== 'number') return null;
  const claims: EntitlementClaims = {
    iss: TOKEN_ISS,
    aud: TOKEN_AUD,
    kid: row.kid,
    sub: row.sub,
    grants: row.grants,
    tier: row.tier,
    src: row.src,
    exp: row.exp,
    iat: row.iat,
    nbf: row.nbf,
    refresh_after: row.refresh_after,
    did: row.did,
    v: TOKEN_VERSION,
  };
  if (typeof row.eh === 'string' && row.eh) claims.eh = row.eh;
  if (typeof row.cnf === 'string' && row.cnf) claims.cnf = row.cnf;
  if (typeof row.gym === 'string' && row.gym) claims.gym = row.gym;
  if (typeof row.sid === 'string' && row.sid) claims.sid = row.sid;
  if (typeof row.preset === 'string' && row.preset) claims.preset = row.preset;
  if (typeof row.fail_open_until === 'number') claims.fail_open_until = row.fail_open_until;
  if (typeof row.offline_grace === 'number') claims.offline_grace = row.offline_grace;
  if (row.subs && typeof row.subs === 'object') {
    const state = (row.subs as SubscriptionClaim).state;
    if (state === 'active' || state === 'grace' || state === 'locked') {
      const subs: SubscriptionClaim = { state };
      const lockAt = (row.subs as SubscriptionClaim).lock_at;
      const endsAt = (row.subs as SubscriptionClaim).ends_at;
      if (typeof lockAt === 'string') subs.lock_at = lockAt;
      if (typeof endsAt === 'string') subs.ends_at = endsAt;
      claims.subs = subs;
    }
  }
  return claims;
}

async function importPrivate(jwk: PrivateJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

async function importPublic(jwk: PublicJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}

export async function signToken(claims: EntitlementClaims, privateJwk: PrivateJwk): Promise<string> {
  return signJson(claims.kid, claims, privateJwk);
}

export async function signJson(kid: string, payload: unknown, privateJwk: PrivateJwk): Promise<string> {
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })));
  const body = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importPrivate(privateJwk);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${body}`));
  return `${header}.${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function readSignedJson(
  token: string,
  keys: readonly { kid: string; jwk: PublicJwk }[],
): Promise<unknown | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as { alg?: unknown; kid?: unknown };
  } catch {
    return null;
  }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') return null;
  const listed = keys.find((key) => key.kid === header.kid);
  if (!listed) return null;
  try {
    const key = await importPublic(listed.jwk);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))) as unknown;
  } catch {
    return null;
  }
}

export async function verifyToken(
  token: string,
  keys: readonly { kid: string; jwk: PublicJwk }[],
): Promise<EntitlementClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part)) return null;
  let header: { alg?: unknown; kid?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[0]))) as { alg?: unknown; kid?: unknown };
  } catch {
    return null;
  }
  if (header.alg !== 'ES256' || typeof header.kid !== 'string') return null;
  const listed = keys.find((key) => key.kid === header.kid);
  if (!listed) return null;
  try {
    const key = await importPublic(listed.jwk);
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(parts[2]),
      encoder.encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;
    return claimsFromUnknown(JSON.parse(new TextDecoder().decode(base64UrlToBytes(parts[1]))));
  } catch {
    return null;
  }
}

export async function thumbprintJwk(jwk: PublicJwk): Promise<string> {
  return sha256Hex(`${jwk.x}.${jwk.y}`);
}
