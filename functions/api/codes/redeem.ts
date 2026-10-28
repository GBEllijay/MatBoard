import { handleCodeRedeem } from '../../../src/server/codeRedeem.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleCodeRedeem(context.request, context.env, context.env.WHITE_ENTITLEMENTS ?? null, null, () => new Date(), {
    db: context.env.ENTITLEMENTS_DB ?? null,
    signingKey: context.env.ENTITLEMENT_SIGNING_KEY,
    keyId: context.env.ENTITLEMENT_KEY_ID,
  });
}
