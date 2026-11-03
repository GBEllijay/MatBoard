import { handleStudentInbox, type StudentInboxEnv } from '../../../src/server/studentInbox.ts';

type PagesContext = { request: Request; env: StudentInboxEnv };

export async function onRequest(context: PagesContext): Promise<Response> {
  return handleStudentInbox(context.request, context.env);
}
