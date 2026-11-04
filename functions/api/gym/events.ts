/**
 * Advantage Cloud academy event sync. Idempotent push, pull since a cursor.
 * Uses the existing ENTITLEMENTS_DB binding. The owner applies migrations/0004_gym_events.sql.
 */

import { handleGymEvents } from '../../../src/server/gymEvents.ts';
import type { GymCloudEnv } from '../../../src/server/gymCloud.ts';

export async function onRequest(context: { request: Request; env: GymCloudEnv }): Promise<Response> {
  return handleGymEvents(context.request, context.env);
}
