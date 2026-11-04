/**
 * Advantage Cloud master roster: read, submit (pending for seats unless trust mode),
 * approve or reject, trust mode, and each author's private notes.
 * Uses the existing GYM_MEDIA bucket and ENTITLEMENTS_DB. Never deletes from R2.
 */

import { handleGymRoster } from '../../../src/server/gymRoster.ts';
import type { GymCloudEnv } from '../../../src/server/gymCloud.ts';

export async function onRequest(context: { request: Request; env: GymCloudEnv }): Promise<Response> {
  return handleGymRoster(context.request, context.env);
}
