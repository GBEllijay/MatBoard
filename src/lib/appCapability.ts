import type { Door, TokenTier } from './entitlementToken.ts';

/**
 * Old-client safety for Media Edition.
 *
 * Clients before app version 3 verify a pass with a fixed door list
 * (white, student, coach, pro). A pass carrying 'media', or tier 'media', fails their
 * check and the whole pass is dropped, which would lock a paying Pro customer out.
 *
 * So the client sends its version in APP_VERSION_HEADER on every request that returns
 * a pass, and the server (src/server/tokenIssue.ts issueToken) leaves 'media' out for any
 * client that sends no version or one below MEDIA_APP_VERSION. Those clients keep every
 * door they understood before; the White that Media implies stays in the pass.
 *
 * MIN_APP_VERSION (/api/config) is not raised, so nobody is forced to update. Once old
 * clients are gone, the owner can set MIN_APP_VERSION=3 and this filter becomes a no-op.
 */
export const CLIENT_APP_VERSION = '3';
export const MEDIA_APP_VERSION = '3';
export const APP_VERSION_HEADER = 'x-advantage-app';

export function compareAppVersion(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function appSupportsMedia(version: string | null | undefined): boolean {
  if (typeof version !== 'string' || !/^\d+(\.\d+)*$/.test(version.trim())) return false;
  return compareAppVersion(version.trim(), MEDIA_APP_VERSION) >= 0;
}

/** The grants and tier a pass may carry for a client of this version. */
export function passScopeForApp(
  grants: readonly Door[],
  tier: TokenTier,
  version: string | null | undefined,
): { grants: Door[]; tier: TokenTier } {
  if (appSupportsMedia(version)) return { grants: [...grants], tier };
  return {
    grants: grants.filter((door) => door !== 'media'),
    tier: tier === 'media' ? 'white' : tier,
  };
}

/** Read the client version from a request. Missing means an old client. */
export function appVersionOf(request: Request): string | null {
  const raw = request.headers.get(APP_VERSION_HEADER);
  return raw ? raw.trim().slice(0, 20) : null;
}

/** Headers a client adds to a request that returns a pass. */
export function appVersionHeaders(): Record<string, string> {
  return { [APP_VERSION_HEADER]: CLIENT_APP_VERSION };
}
