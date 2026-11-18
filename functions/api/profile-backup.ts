/**
 * Advantage Cloud profile backup for every buyer (small JSON only).
 * groups/{licenseId}/profiles/backup.json in the existing GYM_MEDIA bucket.
 * Reads ENTITLEMENTS_DB only to refuse refunded licenses. Never deletes from R2.
 */

import { handleProfileBackup, type ProfileBackupEnv } from '../../src/server/profileBackup.ts';

export async function onRequest(context: { request: Request; env: ProfileBackupEnv }): Promise<Response> {
  return handleProfileBackup(context.request, context.env);
}
