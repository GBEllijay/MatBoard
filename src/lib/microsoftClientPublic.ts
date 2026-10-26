/**
 * Public Microsoft application (client) id. This is not a secret.
 * Anything that is not a GUID is ignored so a mis-set env var cannot be echoed.
 */

export const MICROSOFT_CLIENT_API = '/api/microsoft-client';

const MICROSOFT_CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicMicrosoftClientId(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? '';
  return MICROSOFT_CLIENT_ID_PATTERN.test(trimmed) ? trimmed : '';
}

/** Cloudflare Pages may set either name. Vite only inlines the VITE_ one at build time. */
export function publicMicrosoftClientIdFromEnv(env: {
  VITE_MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_ID?: string;
}): string {
  return publicMicrosoftClientId(env.VITE_MICROSOFT_CLIENT_ID || env.MICROSOFT_CLIENT_ID);
}
