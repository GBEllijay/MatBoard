import { handleStudentLicenseReset } from '../../../src/server/studentLicenses.ts';
import type { PagesEnv } from '../../pagesEnv.ts';

type PagesContext = { request: Request; env: PagesEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleStudentLicenseReset(context.request, context.env, context.env.ENTITLEMENTS_DB ?? null);
}
