import { handleLogin, type LoginEnv } from '../../../src/server/loginAccount.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv & Pick<LoginEnv, 'GYM_MEDIA'> };

/** /api/login/signin, /invite, /code, /me, /signout. See src/server/loginAccount.ts. */
export async function onRequest(context: PagesContext): Promise<Response> {
  const env = context.env;
  return handleLogin(
    context.request,
    { ...env, ENTITLEMENTS_DB: env.ENTITLEMENTS_DB ?? null },
    env.ENTITLEMENTS_DB ?? null,
    () => new Date(),
    fetch,
  );
}
