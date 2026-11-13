/**
 * Fields a packet must not carry.
 * Export drops them. Import refuses a file that still has one.
 * Journal text can mention a word like "token". Only object keys are checked.
 */

const FORBIDDEN_KEYS = new Set([
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'clientsecret',
  'client_secret',
  'pinhash',
  'inboxpass',
  'authorization',
  'stripesession',
  'stripecustomer',
  'paymentintent',
  'licensecode',
  'redemptioncode',
  'unlockcode',
]);

export function isForbiddenPacketKey(key: string): boolean {
  return FORBIDDEN_KEYS.has(key.trim().toLowerCase());
}

/** A path such as `bundle:default.extras.pinHash`, or null when the tree is clean. */
export function findPacketSecret(value: unknown, path = ''): string | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findPacketSecret(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (isForbiddenPacketKey(key)) return here;
    const found = findPacketSecret(child, here);
    if (found) return found;
  }
  return null;
}

/** Copy `value` without forbidden keys. Arrays keep their order. */
export function stripPacketSecrets<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => stripPacketSecrets(item)) as T;
  const source = value as Record<string, unknown>;
  let changed = false;
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(source)) {
    if (isForbiddenPacketKey(key)) {
      changed = true;
      continue;
    }
    const cleaned = stripPacketSecrets(child);
    if (cleaned !== child) changed = true;
    next[key] = cleaned;
  }
  return (changed ? next : value) as T;
}
