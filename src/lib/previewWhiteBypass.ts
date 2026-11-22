/**
 * Preview-only White gate bypass for Cloudflare Pages hash/branch previews.
 *
 * Active only when the hostname ends with `.matboard.pages.dev` and is not the
 * exact production alias `matboard.pages.dev`. Every other host fails closed,
 * including advantagebjjtimer.com, www, localhost, and look-alike domains.
 *
 * Address-bar values never unlock: this check is host-based only. No query
 * parameter, hash, or path can turn it on. It never writes unlock flags and
 * never opens Student, Coach, Media, Instructor, Pro, or Cloud.
 */

export const PREVIEW_WHITE_BADGE_TEXT = 'Preview build: White unlocked for testing';

const PREVIEW_HOST_SUFFIX = '.matboard.pages.dev';
const PRODUCTION_PAGES_HOST = 'matboard.pages.dev';

export function isPreviewWhiteBypassHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  if (!host || host === PRODUCTION_PAGES_HOST) return false;
  return host.endsWith(PREVIEW_HOST_SUFFIX);
}

/** Read-time check. Missing window or host fails closed. */
export function isPreviewWhiteUnlocked(hostname?: string): boolean {
  const host =
    hostname ??
    (typeof window !== 'undefined' && window.location ? window.location.hostname : '');
  return isPreviewWhiteBypassHost(host);
}
