import { handlePaidChunk } from '../../src/server/paidChunks.ts';
import type { PagesEnv } from '../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  const assets = context.env.ASSETS;
  if (!assets) return new Response('Paid screens are not available on this deployment.', { status: 503 });
  return handlePaidChunk(context.request, context.env, assets);
}
