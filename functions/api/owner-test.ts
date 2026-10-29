import { handleOwnerTest } from '../../src/server/ownerTest.ts';
import type { PagesEnv } from '../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleOwnerTest(context.request, context.env, context.env.WHITE_ENTITLEMENTS ?? null, () => new Date(), {
    signingKey: context.env.ENTITLEMENT_SIGNING_KEY,
    keyId: context.env.ENTITLEMENT_KEY_ID,
  });
}
