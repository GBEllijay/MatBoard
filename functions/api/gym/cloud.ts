/**
 * Advantage Cloud uploads, lists, and playback for one signed-in license.
 * Gallery reads stay on /api/gym/media. This route never returns a public bucket URL.
 */

import { handleGymCloud, type GymCloudEnv } from '../../../src/server/gymCloud.ts';

export async function onRequest(context: { request: Request; env: GymCloudEnv }): Promise<Response> {
  return handleGymCloud(context.request, context.env);
}
