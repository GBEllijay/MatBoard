/**
 * Content fingerprint for Cloud dedup.
 *
 * Small files hash every byte (`v1-full-…`). A large phone video would need
 * the whole file in memory to hash, so it hashes its size plus three 4 MiB
 * samples from the start, middle, and end (`v1-sample-…`). Two different
 * camera clips do not share size and all three samples in practice.
 * The server stores `hashes/{fingerprint}.json -> path` inside the license
 * prefix, so dedup never crosses gyms.
 */

/** Files at or under this size hash every byte. */
export const FINGERPRINT_FULL_MAX_BYTES = 32 * 1024 * 1024;
export const FINGERPRINT_SAMPLE_BYTES = 4 * 1024 * 1024;

const FINGERPRINT = /^v1-(full|sample)-[0-9a-f]{64}$/;

export function isCloudFingerprint(value: unknown): value is string {
  return typeof value === 'string' && FINGERPRINT.test(value);
}

export function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return hex(await crypto.subtle.digest('SHA-256', view as Uint8Array<ArrayBuffer>));
}

/** Byte ranges the sampled fingerprint reads. Exported for tests. */
export function fingerprintSamples(size: number, sample = FINGERPRINT_SAMPLE_BYTES): { start: number; end: number }[] {
  const middle = Math.max(0, Math.floor(size / 2 - sample / 2));
  return [
    { start: 0, end: Math.min(size, sample) },
    { start: middle, end: Math.min(size, middle + sample) },
    { start: Math.max(0, size - sample), end: size },
  ];
}

export async function cloudFingerprint(file: Blob): Promise<string> {
  if (file.size <= FINGERPRINT_FULL_MAX_BYTES) {
    return `v1-full-${await sha256Hex(await file.arrayBuffer())}`;
  }
  const header = new TextEncoder().encode(`size:${file.size}\n`);
  const parts = await Promise.all(
    fingerprintSamples(file.size).map(async (range) => new Uint8Array(await file.slice(range.start, range.end).arrayBuffer())),
  );
  const total = header.byteLength + parts.reduce((sum, part) => sum + part.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const part of [header, ...parts]) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return `v1-sample-${await sha256Hex(joined)}`;
}
