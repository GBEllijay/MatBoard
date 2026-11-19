/**
 * Private / incognito browsing check for the "can't save here" banner
 * (src/components/PrivateBrowsingBanner.tsx).
 *
 * Browsers try hard to hide private mode, so this only answers `true` on a
 * signal that is specific to it and `false`/`null` otherwise. A wrong warning
 * on a normal tab is worse than a missed one, so anything unsure stays silent.
 *
 * Signals that count:
 * - localStorage throws on a tiny write (older Safari private tabs, storage blocked).
 * - Safari/WebKit: `navigator.storage.getDirectory()` rejects with Safari's private-mode
 *   "unknown transient reason" error.
 * - Firefox: IndexedDB will not open, or service workers are switched off.
 * - Chromium (not Brave): a reported quota under ~120 MB, the old incognito cap.
 *   Brave reports a fixed 2 GB quota on purpose, so the quota says nothing there.
 * `navigator.storage.persisted() === true` always means a normal, kept tab.
 */

export type PrivateProbeEnv = {
  userAgent: string;
  localStorage?: Pick<Storage, 'setItem' | 'removeItem'> | null;
  storage?: {
    estimate?: () => Promise<{ quota?: number; usage?: number }>;
    persisted?: () => Promise<boolean>;
    getDirectory?: () => Promise<unknown>;
  } | null;
  indexedDB?: Pick<IDBFactory, 'open'> | null;
  hasServiceWorker?: boolean;
  isBrave?: boolean;
  /** Give up on any single check after this long. */
  timeoutMs?: number;
};

export type PrivateVerdict = { private: boolean; reason: string | null };

const CHROMIUM_INCOGNITO_QUOTA_BYTES = 120 * 1024 * 1024;
const PROBE_KEY = 'advantage.privateProbe';

export const PRIVATE_BANNER_DISMISS_KEY = 'advantage.privateBanner.dismissed.v1';

export function privateBrowsingText(userAgent = ''): string {
  return isIosLike(userAgent)
    ? 'You’re in private browsing. Advantage can’t save your data here. Open it in a normal Safari tab and add it to your Home Screen (Share, then Add to Home Screen).'
    : 'You’re in a private or incognito window. Advantage can’t save your data here. Open it in a normal browser window, then install it or add it to your home screen.';
}

function isIosLike(ua: string): boolean {
  return /\b(iPhone|iPad|iPod)\b/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
}

export function browserFamily(ua: string, isBrave = false): 'safari' | 'firefox' | 'brave' | 'chromium' | 'other' {
  if (isBrave) return 'brave';
  // iOS: every browser is WebKit underneath (CriOS, FxiOS, EdgiOS too). Treat them all as Safari.
  if (isIosLike(ua)) return 'safari';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\/|Chromium\/|Edg\//.test(ua)) return 'chromium';
  if (/Safari\//.test(ua) && /AppleWebKit\//.test(ua)) return 'safari';
  return 'other';
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve('timeout'), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function localStorageBlocked(store: PrivateProbeEnv['localStorage']): boolean {
  if (store === undefined) return false;
  if (store === null) return true;
  try {
    store.setItem(PROBE_KEY, '1');
    store.removeItem(PROBE_KEY);
    return false;
  } catch {
    return true;
  }
}

async function safariOpfsPrivate(env: PrivateProbeEnv, ms: number): Promise<boolean> {
  const getDirectory = env.storage?.getDirectory;
  if (typeof getDirectory !== 'function') return false;
  try {
    await withTimeout(getDirectory.call(env.storage), ms);
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return /unknown transient reason/i.test(message);
  }
}

async function firefoxIdbPrivate(env: PrivateProbeEnv, ms: number): Promise<boolean> {
  const idb = env.indexedDB;
  if (!idb) return false;
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), ms);
    const done = (value: boolean) => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      const request = idb.open('advantage-private-probe');
      request.onerror = () => done(true);
      request.onsuccess = () => {
        try {
          request.result?.close();
        } catch {
          /* closing a probe */
        }
        done(false);
      };
    } catch {
      done(true);
    }
  });
}

export async function detectPrivateBrowsing(env: PrivateProbeEnv): Promise<PrivateVerdict> {
  const ms = env.timeoutMs ?? 1500;
  const family = browserFamily(env.userAgent, env.isBrave);
  try {
    if (typeof env.storage?.persisted === 'function') {
      const kept = await withTimeout(env.storage.persisted.call(env.storage), ms).catch(() => false);
      if (kept === true) return { private: false, reason: null };
    }
    if (localStorageBlocked(env.localStorage)) return { private: true, reason: 'localStorage' };
    if (family === 'safari' && (await safariOpfsPrivate(env, ms))) return { private: true, reason: 'safari-opfs' };
    if (family === 'firefox') {
      if (env.hasServiceWorker === false) return { private: true, reason: 'firefox-sw' };
      if (await firefoxIdbPrivate(env, ms)) return { private: true, reason: 'firefox-idb' };
    }
    if (family === 'chromium' && typeof env.storage?.estimate === 'function') {
      const estimate = await withTimeout(env.storage.estimate.call(env.storage), ms).catch(() => 'timeout' as const);
      if (estimate !== 'timeout') {
        const quota = estimate.quota;
        if (typeof quota === 'number' && Number.isFinite(quota) && quota > 0 && quota < CHROMIUM_INCOGNITO_QUOTA_BYTES) {
          return { private: true, reason: 'chromium-quota' };
        }
      }
    }
  } catch {
    /* unsure: stay quiet */
  }
  return { private: false, reason: null };
}

/** The real browser's probes. Undefined pieces are skipped. */
export function browserPrivateProbeEnv(): PrivateProbeEnv {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  let store: PrivateProbeEnv['localStorage'];
  try {
    store = typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    store = null;
  }
  let idb: PrivateProbeEnv['indexedDB'];
  try {
    idb = typeof indexedDB === 'undefined' ? undefined : indexedDB;
  } catch {
    idb = null;
  }
  return {
    userAgent: nav?.userAgent ?? '',
    localStorage: store,
    storage: nav?.storage ?? undefined,
    indexedDB: idb,
    hasServiceWorker: nav ? 'serviceWorker' in nav : undefined,
    isBrave: Boolean(nav && (nav as Navigator & { brave?: unknown }).brave),
  };
}

let cached: Promise<PrivateVerdict> | null = null;

/** One check per page load. */
export function privateBrowsingCheck(): Promise<PrivateVerdict> {
  if (!cached) cached = detectPrivateBrowsing(browserPrivateProbeEnv());
  return cached;
}

/**
 * Ask the browser to keep this site's storage (Safari home-screen apps and Chrome grant it
 * quietly). Firefox shows a permission prompt for this, so it is skipped there.
 */
export async function requestPersistentStorage(env: Pick<PrivateProbeEnv, 'userAgent' | 'isBrave'> & {
  storage?: { persisted?: () => Promise<boolean>; persist?: () => Promise<boolean> } | null;
} = browserPrivateProbeEnv()): Promise<boolean | null> {
  const storage = env.storage;
  if (!storage || typeof storage.persist !== 'function') return null;
  if (browserFamily(env.userAgent, env.isBrave) === 'firefox') return null;
  try {
    if (typeof storage.persisted === 'function' && (await storage.persisted.call(storage))) return true;
    return await storage.persist.call(storage);
  } catch {
    return null;
  }
}
