import { handleSeatAccept } from '../../../src/server/seats.ts';
import type { InboxBucket } from '../../../src/server/studentInbox.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv & { GYM_MEDIA?: InboxBucket } };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleSeatAccept(context.request, context.env, context.env.ENTITLEMENTS_DB ?? null);
}
