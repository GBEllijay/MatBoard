/**
 * Student → instructor self-assessments on Advantage Cloud ("Send to my instructor").
 * Uses the existing GYM_MEDIA bucket and ENTITLEMENTS_DB. Never deletes from R2.
 */

import { handleInstructorAssessments } from '../../../src/server/instructorAssessments.ts';
import type { GymCloudEnv } from '../../../src/server/gymCloud.ts';

export async function onRequest(context: { request: Request; env: GymCloudEnv }): Promise<Response> {
  return handleInstructorAssessments(context.request, context.env);
}
