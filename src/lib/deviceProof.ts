import { base64UrlToBytes, bytesToBase64Url, thumbprintJwk, type PublicJwk } from './entitlementToken.ts';

const encoder = new TextEncoder();

export function refreshMessage(deviceId: string, timestamp: number): string {
  return `advantage-refresh\n${deviceId}\n${timestamp}`;
}

export function readPublicJwk(raw: unknown): PublicJwk | null {
  if (!raw || typeof raw !== 'object') return null;
  const jwk = raw as Partial<PublicJwk>;
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256') return null;
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') return null;
  return { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y };
}

export async function signRefreshProof(key: CryptoKey, deviceId: string, timestamp: number): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    encoder.encode(refreshMessage(deviceId, timestamp)),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function verifyRefreshProof(input: {
  publicJwk: PublicJwk;
  deviceId: string;
  timestamp: number;
  proof: string;
  nowSeconds: number;
  expectedThumbprint?: string;
}): Promise<boolean> {
  if (!Number.isFinite(input.timestamp)) return false;
  if (Math.abs(input.nowSeconds - input.timestamp) > 300) return false;
  if (input.expectedThumbprint) {
    const thumb = await thumbprintJwk(input.publicJwk);
    if (thumb !== input.expectedThumbprint) return false;
  }
  try {
    const key = await crypto.subtle.importKey(
      'jwk',
      { ...input.publicJwk, ext: true },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(input.proof),
      encoder.encode(refreshMessage(input.deviceId, input.timestamp)),
    );
  } catch {
    return false;
  }
}
