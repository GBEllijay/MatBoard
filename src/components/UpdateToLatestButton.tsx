/**
 * TEMPORARY — remove after launch, once deploys settle.
 *
 * Hide every copy without deleting the mounts: set SHOW_UPDATE_TO_LATEST to false.
 * Delete it: remove this file, the `.update-latest` block at the bottom of
 * src/index.css, and the three lines marked TEMPORARY UPDATE BUTTON:
 *   src/components/SiteFooter.tsx
 *   src/pages/Storefront.tsx
 *   src/pages/student/BackupMenu.tsx
 *
 * One tap unregisters service workers and deletes Cache Storage, then reloads
 * this same address with a cache-busting query. It does not clear localStorage,
 * sessionStorage, IndexedDB, or cookies. Rosters, journals, backups, unlock
 * flags, and Drive / OneDrive sign-in on this origin stay put.
 */
import { useEffect, useId, useState } from 'react';

/** Flip to false to hide the button. The mounts can stay until the file is deleted. */
export const SHOW_UPDATE_TO_LATEST = true;

declare const __MATBOARD_BUILD__: { version: string; builtAt: string };

type BuildStamp = { version: string; builtAt: string };

function runningBuild(): BuildStamp {
  try {
    const stamp = __MATBOARD_BUILD__;
    if (stamp && typeof stamp.builtAt === 'string' && typeof stamp.version === 'string') return stamp;
  } catch {
    /* unit tests render this file outside Vite's define */
  }
  return { version: 'dev', builtAt: '' };
}

export function formatBuildTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min} UTC`;
}

export function formatBuildLabel(stamp: BuildStamp): string {
  const when = formatBuildTime(stamp.builtAt);
  if (!stamp.version) return when || 'dev';
  return when ? `${stamp.version} · ${when}` : stamp.version;
}

/** Drop service workers. Does not touch storage. */
export async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

/** Drop Cache Storage only. localStorage, sessionStorage, and IndexedDB stay. */
export async function clearCacheStorageOnly(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
}

/** Reload the current page so the browser fetches the newest shell. */
export async function applyLatestBuild(): Promise<void> {
  try {
    await unregisterServiceWorkers();
  } catch {
    /* a stuck worker should not block the reload */
  }
  try {
    await clearCacheStorageOnly();
  } catch {
    /* Cache Storage can throw in private mode; the reload still helps */
  }
  const url = new URL(window.location.href);
  url.searchParams.set('mbv', String(Date.now()));
  window.location.replace(url.toString());
}

export function UpdateToLatestButton() {
  const stamp = runningBuild();
  const label = formatBuildLabel(stamp);
  const noteId = useId();
  const [newer, setNewer] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!SHOW_UPDATE_TO_LATEST) return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has('mbv')) return;
    url.searchParams.delete('mbv');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }, []);

  useEffect(() => {
    if (!SHOW_UPDATE_TO_LATEST) return;
    const controller = new AbortController();
    const run = async () => {
      try {
        const response = await fetch('/version.json', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const body = (await response.json()) as { version?: unknown; builtAt?: unknown };
        if (typeof body.builtAt !== 'string') return;
        const remoteVersion = typeof body.version === 'string' ? body.version : '';
        if (remoteVersion !== stamp.version || body.builtAt !== stamp.builtAt) setNewer(true);
      } catch {
        /* offline, or a test page with no version file */
      }
    };
    void run();
    return () => controller.abort();
  }, [stamp.builtAt, stamp.version]);

  if (!SHOW_UPDATE_TO_LATEST) return null;

  return (
    <div className="update-latest">
      <button
        type="button"
        className="update-latest__button"
        aria-label="Update to latest"
        aria-describedby={noteId}
        disabled={busy}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          void applyLatestBuild().catch(() => setBusy(false));
        }}
      >
        <span className="update-latest__label">{busy ? 'Updating…' : 'Update to latest'}</span>
        <small className="update-latest__stamp">This build: {label}</small>
        {newer ? <small className="update-latest__ready">Newer build is ready</small> : null}
      </button>
      <p id={noteId} className="update-latest__note">
        Saved data on this device stays.
      </p>
    </div>
  );
}
