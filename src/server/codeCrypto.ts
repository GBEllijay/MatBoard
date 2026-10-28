/** Peppered HMAC for codes, emails, and IP addresses. The pepper never ships to the browser. */

const encoder = new TextEncoder();

export function normalizeCode(raw: string): string {
  return raw.normalize('NFKC').trim().toLowerCase().replace(/[\s-]+/g, '');
}

/**
 * One address, one redemption. Gmail dots and plus-tags collapse so
 * a.b+tag@gmail.com and ab@gmail.com share a cap.
 */
export function normalizeEmail(raw: string): string {
  const trimmed = raw.normalize('NFKC').trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at === trimmed.length - 1) return trimmed;
  let local = trimmed.slice(0, at);
  let domain = trimmed.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') {
    const plus = local.indexOf('+');
    if (plus >= 0) local = local.slice(0, plus);
    local = local.replaceAll('.', '');
  }
  return `${local}@${domain}`;
}

export async function keyedHash(value: string, pepper: string, domain: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${domain}\0${value}`));
  return hex(new Uint8Array(signature));
}

export function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length === b.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

/** Same generic failure whether the secret is wrong or missing. */
export async function secretMatches(provided: string, expected: string | undefined): Promise<boolean> {
  const configured = Boolean(expected && expected.length > 0);
  const actual = await keyedHash(provided, 'owner-test-compare', 'secret');
  const target = await keyedHash(configured ? (expected as string) : '', 'owner-test-compare', 'secret');
  return configured && timingSafeEqual(actual, target);
}
