import { handlePublicConfig } from '../../src/server/publicConfig.ts';
import type { PagesEnv } from '../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handlePublicConfig(context.request, context.env, context.env.ENTITLEMENTS_DB ?? null);
}
