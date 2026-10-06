import { icloudCallbackResponse } from '../../../src/server/icloudCallback.ts';

/** Apple redirects the browser here after CloudKit sign-in. GET only. */
export async function onRequestGet(context: { request: Request }): Promise<Response> {
  return icloudCallbackResponse(context.request);
}
