import { handleCoachConnectShortRedirect, type CoachConnectEnv } from '../../src/server/coachConnect.ts';

/** /c/<license>/<id>: the short coach connect QR. Redirects to the full signed link. */
export async function onRequest(context: { request: Request; env: CoachConnectEnv; params: { path?: string | string[] } }): Promise<Response> {
  const path = Array.isArray(context.params.path) ? context.params.path.join('/') : context.params.path ?? '';
  return handleCoachConnectShortRedirect(context.request, context.env, path);
}
