/**
 * Password hashing for email sign-in. WebCrypto only, so it runs the same on
 * Cloudflare Workers and in Node tests.
 *
 * Format (versioned so the cost can be raised later without a migration):
 *   pbkdf2-sha256$<iterations>$<salt base64url>$<hash base64url>
 * 100,000 iterations is the most Workers' PBKDF2 accepts. A stored hash with
 * fewer iterations still verifies, and `needsRehash` says to upgrade it at the
 * next successful sign-in.
 */

import { timingSafeEqual } from './codeCrypto.ts';

export const PASSWORD_SCHEME = 'pbkdf2-sha256';
export const PASSWORD_ITERATIONS = 100_000;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 256;
const SALT_BYTES = 16;
const HASH_BITS = 256;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(value: string): Uint8Array | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const raw = atob(padded);
    const out = new Uint8Array(raw.length);
    for (let index = 0; index < raw.length; index += 1) out[index] = raw.charCodeAt(index);
    return out;
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    HASH_BITS,
  );
  return new Uint8Array(bits);
}

/** Null when the password is acceptable, otherwise the sentence to show. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) return 'That password is too long.';
  return null;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, iterations);
  return `${PASSWORD_SCHEME}$${iterations}$${b64url(salt)}$${b64url(hash)}`;
}

type Parsed = { iterations: number; salt: Uint8Array; hash: string };

function parse(stored: string): Parsed | null {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== PASSWORD_SCHEME) return null;
  const iterations = Number(parts[1]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > PASSWORD_ITERATIONS) return null;
  const salt = fromB64url(parts[2] ?? '');
  if (!salt || salt.length < 8) return null;
  return { iterations, salt, hash: parts[3] ?? '' };
}

/** Constant-time compare of the derived hash. A malformed stored value never matches. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const parsed = stored ? parse(stored) : null;
  if (!parsed) {
    // Spend the same work so a missing account is not faster than a wrong password.
    await derive(password, new Uint8Array(SALT_BYTES), PASSWORD_ITERATIONS);
    return false;
  }
  const got = b64url(await derive(password, parsed.salt, parsed.iterations));
  return timingSafeEqual(got, parsed.hash);
}

export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  return !parsed || parsed.iterations < PASSWORD_ITERATIONS;
}
