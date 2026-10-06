import { publicMicrosoftClientIdFromEnv } from '../../src/lib/microsoftClientPublic.ts';

type MicrosoftClientEnv = {
  VITE_MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_ID?: string;
};

/**
 * Public application id for OneDrive sign-in. No client secret.
 * Pages Functions read the Cloudflare env at request time, so the id does not
 * have to be inlined into the static bundle.
 */
export async function onRequestGet(context: { env: MicrosoftClientEnv }): Promise<Response> {
  return Response.json(
    { clientId: publicMicrosoftClientIdFromEnv(context.env) },
    {
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    },
  );
}
