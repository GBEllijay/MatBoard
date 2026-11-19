/**
 * Short instructor invite links for the invite QR.
 *
 * A signed seat invite (header.payload.signature, ES256) is ~400 characters, which made the
 * invite QR so dense that phone cameras could not read it. The short code carries only what the
 * server needs to find the seat and prove the holder got it from the owner:
 *
 *   code = base64url(seat id, 16 bytes) + base64url(invite nonce, 16 bytes)   (44 characters)
 *
 * Both are random UUIDs that the server already stores (seats.id, seats.invite_nonce). The nonce
 * is 122 random bits and is rotated by Reset, so it works as the invite secret exactly like the
 * signed link's nonce did. Gym, preset and expiry come from the seat row, not from the link, so
 * nothing in the code can be forged into more access. No migration: no new column or table.
 *
 * Link: https://<site>/i/<code>, which opens /account?invite=<code> (the same invite screen).
 */

export const SHORT_INVITE_PATH_PREFIX = '/i/';
export const SHORT_INVITE_LENGTH = 44;

const SHORT_INVITE_PATTERN = /^[A-Za-z0-9_-]{44}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const out = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
    return out;
  } catch {
    return null;
  }
}

function uuidToBytes(uuid: string): Uint8Array | null {
  if (!UUID_PATTERN.test(uuid)) return null;
  const hex = uuid.replace(/-/g, '').toLowerCase();
  const out = new Uint8Array(16);
  for (let index = 0; index < 16; index += 1) out[index] = parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  return out;
}

function bytesToUuid(bytes: Uint8Array): string | null {
  if (bytes.length !== 16) return null;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Short code for a seat id + invite nonce. Null unless both are UUIDs (server-issued seats). */
export function encodeShortSeatInvite(sid: string, nonce: string): string | null {
  const sidBytes = uuidToBytes(sid);
  const nonceBytes = uuidToBytes(nonce);
  if (!sidBytes || !nonceBytes) return null;
  return `${toBase64Url(sidBytes)}${toBase64Url(nonceBytes)}`;
}

/** Seat id + nonce inside a short code. Null for anything else (signed tokens, legacy tokens). */
export function parseShortSeatInvite(code: string): { sid: string; nonce: string } | null {
  const value = code.trim();
  if (!SHORT_INVITE_PATTERN.test(value)) return null;
  const sidBytes = fromBase64Url(value.slice(0, 22));
  const nonceBytes = fromBase64Url(value.slice(22));
  if (!sidBytes || !nonceBytes) return null;
  const sid = bytesToUuid(sidBytes);
  const nonce = bytesToUuid(nonceBytes);
  if (!sid || !nonce) return null;
  // Only the canonical encoding counts, so one seat has exactly one short code per nonce.
  if (encodeShortSeatInvite(sid, nonce) !== value) return null;
  return { sid, nonce };
}

/**
 * Short code for a signed seat invite this device already holds. Reads (does not verify) the
 * payload: the server verifies everything when the code is used. Null for legacy device tokens,
 * student invites, or anything without a UUID seat id and nonce, which keep the long link.
 */
export function shortCodeForSignedSeatInvite(token: string): string | null {
  const parts = token.trim().split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  const bytes = fromBase64Url(parts[1]);
  if (!bytes) return null;
  let payload: { typ?: unknown; sid?: unknown; nonce?: unknown; v?: unknown };
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes)) as typeof payload;
  } catch {
    return null;
  }
  if (!payload || payload.typ !== 'seat-invite' || payload.v !== 1) return null;
  if (typeof payload.sid !== 'string' || typeof payload.nonce !== 'string') return null;
  return encodeShortSeatInvite(payload.sid, payload.nonce);
}

/** `/i/<code>` → the short code, or null for any other path. */
export function shortInviteCodeFromPath(pathname: string): string | null {
  if (!pathname.startsWith(SHORT_INVITE_PATH_PREFIX)) return null;
  const rest = pathname.slice(SHORT_INVITE_PATH_PREFIX.length).replace(/\/+$/, '');
  return parseShortSeatInvite(rest) ? rest : null;
}
