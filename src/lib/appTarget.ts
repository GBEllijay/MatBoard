/**
 * Build target for the bundled app.
 *
 * Default (unset) is the public website, including Cloudflare Pages and
 * production at advantagebjjtimer.com. Native White iOS builds set
 * `VITE_APP_TARGET=white` at build time only. That flag must never be set
 * for a web / Pages deploy, so website behavior stays unchanged.
 */
export type AppTarget = 'web' | 'white';

let appTargetForTests: AppTarget | undefined;

/** Test-only override for the default (no-argument) build target. */
export function setAppTargetForTests(target: AppTarget | undefined): void {
  appTargetForTests = target;
}

export function readAppTarget(
  raw: string | undefined = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_APP_TARGET : undefined,
): AppTarget {
  if (arguments.length === 0 && appTargetForTests !== undefined) {
    return appTargetForTests;
  }
  return raw === 'white' ? 'white' : 'web';
}

/** True only in the Capacitor White iOS (or future Android) bundle. */
export function isNativeWhiteApp(target: AppTarget = readAppTarget()): boolean {
  return target === 'white';
}

/**
 * Hide Stripe checkout, web edition buy links, and email restore
 * (`POST /api/checkout`, `POST /api/restore/request`) in the native app.
 */
export function hideWebCheckout(target: AppTarget = readAppTarget()): boolean {
  return isNativeWhiteApp(target);
}

/** Native White opens on the White hub, not the public storefront. */
export function nativeWhiteHomePath(target: AppTarget = readAppTarget()): '/white' | '/' {
  return isNativeWhiteApp(target) ? '/white' : '/';
}

/** Round timer stays free in the native White app, even before IAP. */
export function nativeTimerAllowed(target: AppTarget = readAppTarget()): boolean {
  return isNativeWhiteApp(target);
}
