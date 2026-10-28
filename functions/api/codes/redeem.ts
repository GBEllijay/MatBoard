import { handleCodeRedeem } from '../../../src/server/codeRedeem.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleCodeRedeem(context.request, context.env, context.env.WHITE_ENTITLEMENTS ?? null);
}
