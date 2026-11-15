/**
 * Owner unlock writes the same license rows a Pro + Cloud purchase does,
 * without calling Stripe and without charging anyone.
 * One owner academy is reused, so later unlocks keep the same folder prefix.
 * The shared owner-test license id is not used here.
 * This does not read or write a student's journal, photos, or backup.
 */

import { grantRowOpensPlusCloud, ownerCloudGrantOpen } from '../lib/advantageCloudMedia.ts';
import { ensureAccountForLicense } from './accountId.ts';
import type { D1Database } from './d1.ts';
import { API_PRODUCT_PRO } from './routes.ts';
import { CLOUD_GRANT_PRODUCT } from './cloudSubscription.ts';
import { PRO_TOKEN_DAYS } from './paywallDecisions.ts';

const PRO_REF = 'owner-academy';
const CLOUD_REF = 'owner-academy-cloud';

/** Renewable pass length. The academy grant itself has no end date. */
export const OWNER_SESSION_SECONDS = PRO_TOKEN_DAYS * 24 * 60 * 60;

export function isStableOwnerAcademyGrant(row: { source: string; sourceRef: string | null }): boolean {
  return row.source === 'owner' && (row.sourceRef === PRO_REF || row.sourceRef === CLOUD_REF);
}

/** Open owner-academy row with no end. A dated owner-test grant is not this. */
export function isPerpetualOwnerAcademyGrant(row: {
  source: string;
  sourceRef: string | null;
  endsAt: string | null;
}): boolean {
  return isStableOwnerAcademyGrant(row) && !row.endsAt;
}

/**
 * Open owner row with no end: the owner-academy rows, or the `source = 'owner'`
 * Pro or Cloud row an owner code wrote before owner-academy existed
 * (source_ref `code:owner-…`). Both open Plus Cloud in gymCloud.ts lookupPlusCloud,
 * so sign-in, restore, and refresh treat them as the owner academy too.
 * A dated owner-test grant and a `source = 'code'` alpha-pro row are not this.
 */
export function isPerpetualOwnerGrant(row: {
  product: string;
  source: string;
  sourceRef: string | null;
  endsAt: string | null;
}): boolean {
  if (row.source !== 'owner' || row.endsAt) return false;
  return isStableOwnerAcademyGrant(row) || grantRowOpensPlusCloud(row) || ownerCloudGrantOpen(row);
}

async function existingOwnerLicense(db: D1Database): Promise<string | null> {
  const grant = await db
    .prepare(
      `SELECT license_id AS licenseId FROM grants
       WHERE source = 'owner' AND source_ref = ? AND product = ? LIMIT 1`,
    )
    .bind(PRO_REF, API_PRODUCT_PRO)
    .first<{ licenseId: string }>();
  return grant?.licenseId || null;
}

export async function provisionOwnerAcademy(
  db: D1Database,
  input: { now: Date; endsAt: string | null; email?: string; pepper?: string },
): Promise<{ licenseId: string; accountId: string }> {
  const stamp = input.now.toISOString();
  let licenseId = (await existingOwnerLicense(db)) ?? '';
  let created = '';
  if (!licenseId) {
    created = crypto.randomUUID();
    licenseId = created;
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
  const confirmed = await existingOwnerLicense(db);
  if (confirmed) licenseId = confirmed;
  if (created && created !== licenseId) {
    const used = await db
      .prepare(`SELECT id FROM grants WHERE license_id = ? LIMIT 1`)
      .bind(created)
      .first<{ id: string }>();
    if (!used) await db.prepare(`DELETE FROM licenses WHERE id = ? AND account_id IS NULL`).bind(created).run();
  }
  const account = await ensureAccountForLicense(db, {
    licenseId,
    email: input.email,
    pepper: input.pepper,
    now: input.now,
  });
  return { licenseId, accountId: account?.accountId ?? '' };
}

async function writeGrant(
  db: D1Database,
  input: { licenseId: string; product: string; sourceRef: string; stamp: string; endsAt: string | null },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at, revoked_at)
       VALUES (?, ?, ?, 'owner', ?, 'active', ?, ?, NULL)
       ON CONFLICT(source, source_ref, product) DO UPDATE SET
         status = 'active',
         ends_at = CASE
           WHEN grants.ends_at IS NULL AND excluded.ends_at IS NOT NULL THEN grants.ends_at
           ELSE excluded.ends_at
         END,
         revoked_at = NULL`,
    )
    .bind(crypto.randomUUID(), input.licenseId, input.product, input.sourceRef, input.stamp, input.endsAt)
    .run();
}
