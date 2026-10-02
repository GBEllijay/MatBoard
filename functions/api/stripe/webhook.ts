import { handleWebhook } from '../../../src/server/handlers.ts';
import { pagesEntitlementStore, type PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleWebhook(context.request, context.env, pagesEntitlementStore(context.env));
}
