/**
 * Published class schedule, personal class marks, and absentee recap requests.
 * Uses the existing ENTITLEMENTS_DB binding. The owner applies migrations/0010_gym_schedule.sql.
 */

import { handleGymSchedule, type GymScheduleEnv } from '../../../src/server/gymSchedule.ts';

export async function onRequest(context: { request: Request; env: GymScheduleEnv }): Promise<Response> {
  return handleGymSchedule(context.request, context.env);
}
