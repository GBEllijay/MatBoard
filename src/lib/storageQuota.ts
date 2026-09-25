/**
 * Origin storage for Advantage. Safari shows a system "not enough memory"
 * dialog when a site quota write fails. That is this site's storage, not RAM.
 * A count cap is not a substitute: the only hard stop is the quota itself.
 */

export const DEVICE_STORAGE_FULL_NOTE =
  'Storage for Advantage on this device is full. Remove a Gallery item, Pro Shop card, Events photo, or training clip, or clear unused media, then try again.';

/** A clip this large is worth a note even when the write succeeds. */
export const LARGE_MEDIA_BYTES = 40 * 1024 * 1024;

export const LARGE_MEDIA_NOTE =
  'That clip is very large. It stays on this device. If Advantage storage fills up, remove an unused Gallery video or training clip.';

export class StorageQuotaError extends Error {
  saved: number;
  constructor(saved: number) {
    super(DEVICE_STORAGE_FULL_NOTE);
    this.name = 'QuotaExceededError';
    this.saved = saved;
  }
}

export function isStorageQuotaError(error: unknown): boolean {
  if (!error || (typeof error !== 'object' && typeof error !== 'string')) return false;
  if (typeof error === 'string') return quotaText(error);
  const record = error as { name?: unknown; code?: unknown; message?: unknown };
  const name = typeof record.name === 'string' ? record.name : '';
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (record.code === 22 || record.code === 1014) return true;
  const message = typeof record.message === 'string' ? record.message : '';
  return quotaText(message);
}

function quotaText(message: string): boolean {
  return /quota|not enough space|insufficient memory|not enough memory|out of memory|low memory|storage full/i.test(
    message,
  );
}

/** In-app note for a failed on-device media save. Null when the error is something else. */
export function quotaAddNote(error: unknown): string | null {
  if (error instanceof StorageQuotaError) {
    if (error.saved > 0) return `Saved ${error.saved}. ${DEVICE_STORAGE_FULL_NOTE}`;
    return DEVICE_STORAGE_FULL_NOTE;
  }
  if (!isStorageQuotaError(error)) return null;
  return DEVICE_STORAGE_FULL_NOTE;
}

/**
 * True when `navigator.storage.estimate` says this many bytes still fit.
 * Null when the browser does not report a quota — the write should still be tried.
 */
export async function originCanStore(bytes: number): Promise<boolean | null> {
  if (!Number.isFinite(bytes) || bytes < 0) return true;
  try {
    const estimate = globalThis.navigator?.storage?.estimate;
    if (typeof estimate !== 'function') return null;
    const { quota, usage } = await estimate.call(globalThis.navigator.storage);
    if (typeof quota !== 'number' || !Number.isFinite(quota)) return null;
    const used = typeof usage === 'number' && Number.isFinite(usage) ? usage : 0;
    return bytes <= Math.max(0, quota - used);
  } catch {
    return null;
  }
}

/** Throw before a blob write when the reported quota is already smaller than the file. */
export async function assertOriginRoom(bytes: number, saved = 0): Promise<void> {
  const fits = await originCanStore(bytes);
  if (fits === false) throw new StorageQuotaError(saved);
}
