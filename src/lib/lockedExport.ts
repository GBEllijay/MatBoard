/**
 * A copy of this browser's saved data for the Pro lock screen.
 * Reading it does not delete photos, logos, journals, or cloud bindings.
 */

const SKIP = new Set([
  'advantage.entitlement.token',
  'advantage.entitlement.config',
  'advantage.entitlement.clock',
  'advantage.device.id',
]);

function skipKey(key: string): boolean {
  if (SKIP.has(key)) return true;
  const lower = key.toLowerCase();
  if (lower.startsWith('msal.')) return true;
  if (lower.includes('accesstoken') || lower.includes('refreshtoken') || lower.includes('secret')) return true;
  return false;
}

export function lockedDataSnapshot(storage: Pick<Storage, 'length' | 'key' | 'getItem'>): Record<string, string> {
  const out: Record<string, string> = {};
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key || skipKey(key)) continue;
    const value = storage.getItem(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

export function downloadLockedData(): void {
  if (typeof localStorage === 'undefined') return;
  const snapshot = lockedDataSnapshot(localStorage);
  const blob = new Blob([JSON.stringify(snapshot)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'advantage-export.json';
  link.click();
  URL.revokeObjectURL(url);
}
