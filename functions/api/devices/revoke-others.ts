import { handleRevokeOtherDevices } from '../../../src/server/restoreAccess.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleRevokeOtherDevices(context.request, context.env, context.env.ENTITLEMENTS_DB ?? null);
}