import { handleSessionRedeem } from '../../../src/server/sessionRedeem.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleSessionRedeem(
    context.request,
    context.env,
    context.env.ENTITLEMENTS_DB ?? null,
    fetch,
    context.env.WHITE_ENTITLEMENTS ?? null,
  );
}
