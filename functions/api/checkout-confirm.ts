import { handleCheckoutConfirm } from '../../src/server/checkoutConfirm.ts';
import type { PagesEnv } from '../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleCheckoutConfirm(context.request, context.env, fetch, context.env.WHITE_ENTITLEMENTS ?? null);
}