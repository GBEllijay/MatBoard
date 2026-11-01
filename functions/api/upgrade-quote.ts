import { handleUpgradeQuote } from '../../src/server/upgradeCredit.ts';
import { pagesEntitlementStore, type PagesEnv } from '../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleUpgradeQuote(
    context.request,
    context.env,
    pagesEntitlementStore(context.env),
    context.env.ENTITLEMENTS_DB ?? null,
    fetch,
    context.env.WHITE_ENTITLEMENTS ?? null,
  );
}
