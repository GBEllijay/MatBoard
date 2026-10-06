/**
 * Public CloudKit web settings. These are not secrets.
 * A Sign in with Apple Services ID is not one of them: that login does not
 * read or write iCloud. The API token is domain-restricted and safe to put
 * in the browser. Never put a server-to-server private key or a .p8 key here.
 */

export const ICLOUD_CONFIG_API = '/api/icloud-config';

/** CloudKit Sign In Callback. One URL per API token. */
export const ICLOUD_CALLBACK_PATH = '/api/icloud/callback';

export const ICLOUD_SIGN_IN_FAILED =
  'Apple did not finish sign-in. Try again, or ask whoever set up Advantage to allow this website.';

export const ICLOUD_TOKEN_KEY = 'matboard.icloud.webAuthToken';
export const ICLOUD_RESUME_KEY = 'matboard.icloud.resume';
export const ICLOUD_RESUME_ERROR_KEY = 'matboard.icloud.resumeError';
export const ICLOUD_RETURN_KEY = 'matboard.icloud.return';

const CONTAINER_PATTERN = /^iCloud\.[A-Za-z0-9][A-Za-z0-9.-]{0,120}$/;
const API_TOKEN_PATTERN = /^[a-f0-9]{32,128}$/i;
const WEB_AUTH_TOKEN_PATTERN = /^[A-Za-z0-9+/=._~-]{20,8000}$/;

const APPLE_SIGN_IN_HOSTS = new Set(['cdn.apple-cloudkit.com', 'idmsa.apple.com', 'appleid.apple.com']);

export type AppleCloudKitEnvironment = 'development' | 'production';

export type AppleCloudKitConfig = {
  container: string;
  apiToken: string;
  environment: AppleCloudKitEnvironment;
};

export function parseAppleCloudKitConfig(input: {
  container?: string | null;
  apiToken?: string | null;
  environment?: string | null;
}): AppleCloudKitConfig | null {
  const container = input.container?.trim() ?? '';
  const apiToken = input.apiToken?.trim() ?? '';
  const environment = input.environment?.trim() ?? '';
  if (!CONTAINER_PATTERN.test(container) || !API_TOKEN_PATTERN.test(apiToken)) return null;
  if (environment !== 'development' && environment !== 'production') return null;
  return { container, apiToken, environment };
}

/** Empty strings when the deployment has no usable CloudKit web settings. */
export function publicAppleCloudKitConfig(input: {
  container?: string | null;
  apiToken?: string | null;
  environment?: string | null;
}): { container: string; apiToken: string; environment: string } {
  const parsed = parseAppleCloudKitConfig(input);
  if (!parsed) return { container: '', apiToken: '', environment: '' };
  return parsed;
}

/** Cloudflare may set the Vite names or the same names without the prefix. */
export function publicAppleCloudKitConfigFromEnv(env: {
  VITE_APPLE_CLOUDKIT_CONTAINER?: string;
  APPLE_CLOUDKIT_CONTAINER?: string;
  VITE_APPLE_CLOUDKIT_API_TOKEN?: string;
  APPLE_CLOUDKIT_API_TOKEN?: string;
  VITE_APPLE_CLOUDKIT_ENVIRONMENT?: string;
  APPLE_CLOUDKIT_ENVIRONMENT?: string;
}): { container: string; apiToken: string; environment: string } {
  return publicAppleCloudKitConfig({
    container: env.VITE_APPLE_CLOUDKIT_CONTAINER || env.APPLE_CLOUDKIT_CONTAINER,
    apiToken: env.VITE_APPLE_CLOUDKIT_API_TOKEN || env.APPLE_CLOUDKIT_API_TOKEN,
    environment: env.VITE_APPLE_CLOUDKIT_ENVIRONMENT || env.APPLE_CLOUDKIT_ENVIRONMENT,
  });
}

export function isICloudWebAuthToken(value: string | null | undefined): boolean {
  const token = value?.trim() ?? '';
  return WEB_AUTH_TOKEN_PATTERN.test(token);
}

/** Apple’s CloudKit sign-in page only. Anything else is not opened. */
export function isAppleSignInUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && APPLE_SIGN_IN_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** Same-site path to reopen after Apple. Rejects open redirects. */
export function safeICloudReturnPath(value: string | null | undefined): string {
  const path = value?.trim() ?? '';
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || path.includes('://')) return '/';
  if (path.length > 300) return '/';
  return path;
}
