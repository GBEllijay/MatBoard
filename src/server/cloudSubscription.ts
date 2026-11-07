import type { D1Database } from './d1.ts';
import { API_PRODUCT_COACH, API_PRODUCT_MEDIA, API_PRODUCT_PRO } from './routes.ts';
import { accessForSubscription, nextPastDueSince, type BillingEventKind, type SubscriptionAccess } from './subscriptionAccess.ts';
import { canceledSnapshot, fetchStripeSubscription, type StripeSubscriptionSnapshot } from './stripeSubscription.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';
import { cloudEditionForPriceIds } from './proPrices.ts';

/**
 * Advantage Cloud add-on subscriptions for Media, Instructor, and Pro.
 *
 * The one-time edition is its own grant and is never touched here. Cloud is a
 * separate grant row with no doors:
 * product = advantage-cloud-media, advantage-cloud-coach, or advantage-cloud-pro,
 * source = stripe_subscription, source_ref = the Stripe subscription id.
 * When the subscription ends, only that row goes inactive. revoked_at on it is
 * the lapse time. Files in R2 are not deleted here (60-day download window).
 * Uses the existing grants and subscriptions tables. No migration.
 *
 * Pro Cloud is recognized by checkout metadata cloud=1, not by price id.
 * STRIPE_PRICE_PRO_MONTHLY is also the legacy Pro monthly price. A monthly
 * Pro subscription without that metadata stays a Pro subscription.
 *
 * Purchases recorded before this split are not rewritten. A later Stripe
 * event with metadata cloud=1 stores only the cloud row. It does not insert
 * a one-time Pro grant and does not deactivate an existing Pro grant.
 * Already-inactive Pro grants are not revived. Turning those into one-time
 * Pro requires a Stripe Checkout Session lookup and is not done here.
 */
export type CloudEdition = 'media' | 'coach' | 'pro';

export const CLOUD_GRANT_PRODUCT: Record<CloudEdition, string> = {
  media: 'advantage-cloud-media',
  coach: 'advantage-cloud-coach',
  pro: 'advantage-cloud-pro',
};

const CLOUD_PRODUCTS = [CLOUD_GRANT_PRODUCT.media, CLOUD_GRANT_PRODUCT.coach, CLOUD_GRANT_PRODUCT.pro];

export function isCloudGrantProduct(product: string): boolean {
  return CLOUD_PRODUCTS.includes(product);
}

/** Cloud grant product, or the one-time Media/Instructor product that owns a cloud add-on. Pro is not included. */
export function cloudEditionForProduct(product: string): CloudEdition | null {
  if (product === API_PRODUCT_MEDIA || product === CLOUD_GRANT_PRODUCT.media) return 'media';
  if (product === API_PRODUCT_COACH || product === CLOUD_GRANT_PRODUCT.coach) return 'coach';
  if (product === CLOUD_GRANT_PRODUCT.pro) return 'pro';
  return null;
}

/**
 * Edition whose checkout carried metadata cloud=1.
 * advantage-pro maps only here, so a Pro grant is never read as Cloud by itself.
 */
export function cloudEditionForCheckoutProduct(product: string): CloudEdition | null {
  if (product === API_PRODUCT_PRO) return 'pro';
  return cloudEditionForProduct(product);
}

/** SQL fragment: subscription ids on this license that are Cloud add-ons, not the Pro edition. */
export const CLOUD_SUBSCRIPTION_IDS_SQL = `SELECT source_ref FROM grants
  WHERE license_id = ? AND source = 'stripe_subscription' AND source_ref IS NOT NULL
  AND product IN ('${CLOUD_GRANT_PRODUCT.media}', '${CLOUD_GRANT_PRODUCT.coach}', '${CLOUD_GRANT_PRODUCT.pro}')`;

type CloudGrantRow = {
  licenseId: string;
  product: string;
  subscriptionId: string;
  status: string;
  revokedAt: string | null;
};

export async function cloudGrantForSubscription(db: D1Database, subscriptionId: string): Promise<CloudGrantRow | null> {
  return db
    .prepare(
      `SELECT license_id AS licenseId, product, source_ref AS subscriptionId, status, revoked_at AS revokedAt
       FROM grants WHERE source = 'stripe_subscription' AND source_ref = ?
       AND product IN (?, ?, ?) LIMIT 1`,
    )
    .bind(subscriptionId, CLOUD_GRANT_PRODUCT.media, CLOUD_GRANT_PRODUCT.coach, CLOUD_GRANT_PRODUCT.pro)
    .first<CloudGrantRow>();
}

/**
 * Link a Cloud subscription to a license at checkout. Safe to call twice.
 * A row that already exists keeps its status; the subscription events move it.
 */
export async function recordCloudGrant(
  db: D1Database,
  input: { licenseId: string; edition: CloudEdition; subscriptionId: string; now: Date },
): Promise<void> {
  if (!input.subscriptionId.startsWith('sub_')) return;
  const stamp = input.now.toISOString();
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at)
       VALUES (?, ?, ?, 'stripe_subscription', ?, 'active', ?, NULL)
       ON CONFLICT(source, source_ref, product) DO NOTHING`,
    )
    .bind(crypto.randomUUID(), input.licenseId, CLOUD_GRANT_PRODUCT[input.edition], input.subscriptionId, stamp)
    .run();
  await db
    .prepare(
      `INSERT INTO subscriptions (
         stripe_subscription_id, license_id, status, cancel_at_period_end, last_event_at, last_synced_at
       ) VALUES (?, ?, 'active', 0, ?, ?)
       ON CONFLICT(stripe_subscription_id) DO NOTHING`,
    )
    .bind(input.subscriptionId, input.licenseId, stamp, stamp)
    .run();
}

/** Find the license a Cloud subscription belongs to. */
export async function licenseForCloudSubscription(db: D1Database, subscriptionId: string): Promise<string | null> {
  const grant = await cloudGrantForSubscription(db, subscriptionId);
  if (grant) return grant.licenseId;
  const row = await db
    .prepare(`SELECT license_id AS licenseId FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1`)
    .bind(subscriptionId)
    .first<{ licenseId: string }>();
  return row?.licenseId ?? null;
}

export type CloudSnapshot = Pick<StripeSubscriptionSnapshot, 'id' | 'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd' | 'priceIds'>;

export type CloudApplyResult =
  | { applied: false }
  | { applied: true; licenseId: string; edition: CloudEdition; access: SubscriptionAccess; lapsedAt: string | null };

function priceList(ids: readonly string[]): string | null {
  const unique = [...new Set(ids.filter((id) => id.startsWith('price_')))].sort();
  return unique.length ? unique.join(',') : null;
}

/**
 * Store one Cloud subscription state. Same rules as Pro: active and trialing are
 * on, past_due has 7 days of grace, cancel at period end stays on until the end,
 * canceled, unpaid, paused, and incomplete are off. Only the Cloud grant moves.
 * A repeat of the same state leaves the first lapse time in place.
 */
export async function applyCloudSnapshot(
  db: D1Database,
  input: { snapshot: CloudSnapshot; edition: CloudEdition; eventKind: BillingEventKind; now: Date; licenseId?: string | null },
): Promise<CloudApplyResult> {
  const subscriptionId = input.snapshot.id;
  const licenseId = input.licenseId || (await licenseForCloudSubscription(db, subscriptionId));
  if (!licenseId) return { applied: false };
  const existing = await cloudGrantForSubscription(db, subscriptionId);
  const edition = existing ? (cloudEditionForProduct(existing.product) ?? input.edition) : input.edition;
  if (!existing) await recordCloudGrant(db, { licenseId, edition, subscriptionId, now: input.now });
  const previous = await db
    .prepare(`SELECT past_due_since AS pastDueSince FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1`)
    .bind(subscriptionId)
    .first<{ pastDueSince: string | null }>();
  const status = input.snapshot.status || 'canceled';
  const pastDueSince = nextPastDueSince({
    previous: previous?.pastDueSince ?? null,
    eventKind: input.eventKind,
    status,
    now: input.now,
  });
  const access = accessForSubscription(
    {
      status,
      cancelAtPeriodEnd: input.snapshot.cancelAtPeriodEnd,
      currentPeriodEnd: input.snapshot.currentPeriodEnd,
      pastDueSince,
    },
    input.now,
  );
  const stamp = input.now.toISOString();
  const grantStatus = access.entitled ? 'active' : 'inactive';
  await db
    .prepare(
      `UPDATE grants SET
         status = ?,
         ends_at = ?,
         revoked_at = CASE WHEN ? = 'active' THEN NULL ELSE COALESCE(revoked_at, ?) END,
         reason = CASE WHEN ? = 'active' THEN NULL ELSE COALESCE(reason, 'cloud-subscription') END
       WHERE source = 'stripe_subscription' AND source_ref = ? AND product = ?`,
    )
    .bind(grantStatus, access.endsAt, grantStatus, stamp, grantStatus, subscriptionId, CLOUD_GRANT_PRODUCT[edition])
    .run();
  await db
    .prepare(
      `UPDATE subscriptions SET
         status = ?, price_id = COALESCE(?, price_id), cancel_at_period_end = ?, current_period_end = ?,
         past_due_since = ?, last_event_at = ?, last_synced_at = ?
       WHERE stripe_subscription_id = ?`,
    )
    .bind(
      status,
      priceList(input.snapshot.priceIds),
      input.snapshot.cancelAtPeriodEnd ? 1 : 0,
      input.snapshot.currentPeriodEnd,
      pastDueSince,
      stamp,
      stamp,
      subscriptionId,
    )
    .run();
  const after = await cloudGrantForSubscription(db, subscriptionId);
  return { applied: true, licenseId, edition, access, lapsedAt: after?.revokedAt ?? null };
}

export type CloudView = {
  /** False when this license has no Cloud add-on on record. */
  tracked: boolean;
  /** Cloud sharing is on. */
  entitled: boolean;
  edition: CloudEdition | null;
  /** First time Cloud went off, when it is off. */
  lapsedAt: string | null;
};

const RECONCILE_MS = 24 * 60 * 60 * 1000;
const SENSITIVE = new Set(['past_due', 'unpaid', 'paused', 'incomplete', 'incomplete_expired']);

/**
 * Cloud for one license, read on token refresh. Re-reads Stripe when the stored
 * row is a day old or in a billing problem, like Pro. A failed read keeps the row.
 */
export async function cloudAccessForLicense(
  db: D1Database,
  licenseId: string,
  now: Date,
  options: { env?: StripeRuntimeEnv; fetchImpl?: typeof fetch } = {},
): Promise<CloudView> {
  const rows = await db
    .prepare(
      `SELECT g.product AS product, g.source_ref AS subscriptionId, g.status AS grantStatus, g.revoked_at AS revokedAt,
         g.ends_at AS endsAt, s.status AS status, s.cancel_at_period_end AS cancelAtPeriodEnd,
         s.current_period_end AS currentPeriodEnd, s.past_due_since AS pastDueSince, s.last_synced_at AS lastSyncedAt
       FROM grants g LEFT JOIN subscriptions s ON s.stripe_subscription_id = g.source_ref
       WHERE g.license_id = ? AND g.source = 'stripe_subscription' AND g.product IN (?, ?, ?)`,
    )
    .bind(licenseId, CLOUD_GRANT_PRODUCT.media, CLOUD_GRANT_PRODUCT.coach, CLOUD_GRANT_PRODUCT.pro)
    .all<{
      product: string;
      subscriptionId: string;
      grantStatus: string;
      revokedAt: string | null;
      endsAt: string | null;
      status: string | null;
      cancelAtPeriodEnd: number | null;
      currentPeriodEnd: string | null;
      pastDueSince: string | null;
      lastSyncedAt: string | null;
    }>();
  if (!rows.results.length) return { tracked: false, entitled: false, edition: null, lapsedAt: null };
  let lapsedAt: string | null = null;
  let edition: CloudEdition | null = null;
  const secret = options.env?.STRIPE_SECRET_KEY?.trim() ?? '';
  for (const row of rows.results) {
    const rowEdition = cloudEditionForProduct(row.product) ?? 'media';
    edition = edition ?? rowEdition;
    let access = accessForSubscription(
      {
        status: row.status ?? (row.grantStatus === 'active' ? 'active' : 'canceled'),
        cancelAtPeriodEnd: row.cancelAtPeriodEnd === 1,
        currentPeriodEnd: row.currentPeriodEnd,
        pastDueSince: row.pastDueSince,
      },
      now,
    );
    if (row.grantStatus !== 'active' || row.revokedAt) access = { ...access, state: 'locked', entitled: false };
    const synced = row.lastSyncedAt ? Date.parse(row.lastSyncedAt) : 0;
    const stale = !Number.isFinite(synced) || now.getTime() - synced > RECONCILE_MS;
    const sensitive = SENSITIVE.has(row.status ?? '') || Boolean(row.pastDueSince);
    // An ended subscription stays ended. Only an open or troubled one is re-read.
    const recheck = (access.entitled && stale) || sensitive;
    if (recheck && secret && options.fetchImpl) {
      const fetched = await fetchStripeSubscription(secret, row.subscriptionId, options.fetchImpl);
      if (fetched !== 'error' && (fetched === 'missing' || fetched.id === row.subscriptionId)) {
        const snapshot = fetched === 'missing' ? canceledSnapshot(row.subscriptionId) : fetched;
        const applied = await applyCloudSnapshot(db, { snapshot, edition: rowEdition, eventKind: 'reconcile', now, licenseId });
        if (applied.applied) access = applied.access;
      }
    }
    if (access.entitled) return { tracked: true, entitled: true, edition: rowEdition, lapsedAt: null };
    const rowLapse = row.revokedAt ?? (row.endsAt && Date.parse(row.endsAt) <= now.getTime() ? row.endsAt : null) ?? now.toISOString();
    if (!lapsedAt || rowLapse < lapsedAt) lapsedAt = rowLapse;
  }
  return { tracked: true, entitled: false, edition, lapsedAt };
}

/**
 * Cloud edition from a subscription read from Stripe: by its Cloud price, its
 * edition metadata, Pro metadata cloud=1, or its Cloud grant on file.
 * A Pro monthly price without cloud metadata returns null so it stays Pro.
 */
export async function cloudEditionForSnapshot(
  db: D1Database | null | undefined,
  snapshot: Pick<StripeSubscriptionSnapshot, 'id' | 'priceIds' | 'metadataProduct' | 'metadataCloud'>,
  env: StripeRuntimeEnv,
): Promise<CloudEdition | null> {
  const priced = cloudEditionForPriceIds(snapshot.priceIds, env);
  if (priced === 'media' || priced === 'coach') return priced;
  const byMeta = snapshot.metadataProduct === API_PRODUCT_MEDIA ? 'media' : snapshot.metadataProduct === API_PRODUCT_COACH ? 'coach' : null;
  if (byMeta) return byMeta;
  if (snapshot.metadataCloud && snapshot.metadataProduct === API_PRODUCT_PRO) return 'pro';
  if (!db) return null;
  const grant = await cloudGrantForSubscription(db, snapshot.id);
  return grant ? cloudEditionForProduct(grant.product) : null;
}
