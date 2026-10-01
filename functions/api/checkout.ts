import { handleCheckout } from '../../src/server/handlers.ts';
import type { PagesEnv } from '../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleCheckout(context.request, context.env);
}
