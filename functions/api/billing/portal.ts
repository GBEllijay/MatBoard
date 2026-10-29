import { handleBillingPortal } from '../../../src/server/billingPortal.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleBillingPortal(context.request, context.env, context.env.ENTITLEMENTS_DB ?? null);
}
