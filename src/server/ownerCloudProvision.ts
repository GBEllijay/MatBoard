/**
 * Owner unlock writes the same license rows a Pro + Cloud purchase does,
 * without calling Stripe and without charging anyone.
 * One owner academy is reused, so later unlocks keep the same folder prefix.
 * The shared owner-test license id is not used here.
 */

import type { D1Database } from './d1.ts';
import { API_PRODUCT_PRO } from './routes.ts';
import { CLOUD_GRANT_PRODUCT } from './cloudSubscription.ts';

const PRO_REF = 'owner-academy';
const CLOUD_REF = 'owner-academy-cloud';

export async function provisionOwnerAcademy(
  db: D1Database,
  input: { now: Date; endsAt: string },
): Promise<{ licenseId: string }> {
  const stamp = input.now.toISOString();
  const existing = await db
    .prepare(
      `SELECT license_id AS licenseId FROM grants
       WHERE source = 'owner' AND source_ref = ? AND product = ? LIMIT 1`,
    )
    .bind(PRO_REF, API_PRODUCT_PRO)
    .first<{ licenseId: string }>();
  let licenseId = existing?.licenseId ?? '';
  if (!licenseId) {
    licenseId = crypto.randomUUID();
    await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(licenseId, stamp).run();
  }
  await writeGrant(db, {
    licenseId,
    product: API_PRODUCT_PRO,
    sourceRef: PRO_REF,
    stamp,
    endsAt: input.endsAt,
  });
  await writeGrant(db, {
    licenseId,
    product: CLOUD_GRANT_PRODUCT.pro,
    sourceRef: CLOUD_REF,
    stamp,
    endsAt: input.endsAt,
  });
  return { licenseId };
}

async function writeGrant(
  db: D1Database,
  input: { licenseId: string; product: string; sourceRef: string; stamp: string; endsAt: string },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at, revoked_at)
       VALUES (?, ?, ?, 'owner', ?, 'active', ?, ?, NULL)
       ON CONFLICT(source, source_ref, product) DO UPDATE SET
         license_id = excluded.license_id,
         status = 'active',
         ends_at = excluded.ends_at,
         revoked_at = NULL`,
    )
    .bind(crypto.randomUUID(), input.licenseId, input.product, input.sourceRef, input.stamp, input.endsAt)
    .run();
}
