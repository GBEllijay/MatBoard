import { emailSenderFromEnv } from '../../../src/server/emailSender.ts';
import { handleRestoreRequest } from '../../../src/server/restoreAccess.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleRestoreRequest(
    context.request,
    context.env,
    context.env.ENTITLEMENTS_DB ?? null,
    emailSenderFromEnv(context.env),
  );
}
