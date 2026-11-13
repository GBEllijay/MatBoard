import { handleCoachConnect, type CoachConnectEnv } from '../../../src/server/coachConnect.ts';

type PagesContext = { request: Request; env: CoachConnectEnv };

/** Owner issues, instructor accepts, a signed coach connect link. No Drive folder. */
export async function onRequest(context: PagesContext): Promise<Response> {
  return handleCoachConnect(context.request, context.env);
}
