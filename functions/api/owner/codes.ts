import { handleOwnerCodeReissue } from '../../../src/server/ownerReissue.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleOwnerCodeReissue(
    context.request,
    context.env,
    context.env.WHITE_ENTITLEMENTS ?? null,
    context.env.ENTITLEMENTS_DB ?? null,
  );
}
