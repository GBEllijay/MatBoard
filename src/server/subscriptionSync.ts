import type { D1Database } from './d1.ts';
import { API_PRODUCT_PRO } from './routes.ts';
import { matchesProPrice } from './proPrices.ts';
import { recordPurchase } from './purchaseRecords.ts';
import {
  accessForSubscription,
  nextPastDueSince,
  type BillingEventKind,
  type SubscriptionAccess,
} from './subscriptionAccess.ts';
import type { StripeSubscriptionSnapshot } from './stripeSubscription.ts';
import type { StripeRuntimeEnv } from './stripeCheckout.ts';

export type SubscriptionRow = {
  licenseId: string;
  status: string;
  priceId: string | null;
  cancelAtPeriodEnd: number;
  currentPeriodEnd: string | null;
  pastDueSince: string | null;
  lastSyncedAt: string | null;
};

const SUBSCRIPTION_SQL = `SELECT license_id AS licenseId, status, price_id AS priceId,
  cancel_at_period_end AS cancelAtPeriodEnd, current_period_end AS currentPeriodEnd,
  past_due_since AS pastDueSince, last_synced_at AS lastSyncedAt
  FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1`;

export async function readSubscription(db: D1Database, subscriptionId: string): Promise<SubscriptionRow | null> {
  return db.prepare(SUBSCRIPTION_SQL).bind(subscriptionId).first<SubscriptionRow>();
}

export async function readSubscriptionForLicense(db: D1Database, licenseId: string): Promise<(SubscriptionRow & { subscriptionId: string }) | null> {
  return db
    .prepare(
      `SELECT stripe_subscription_id AS subscriptionId, license_id AS licenseId, status, price_id AS priceId,
        cancel_at_period_end AS cancelAtPeriodEnd, current_period_end AS currentPeriodEnd,
        past_due_since AS pastDueSince, last_synced_at AS lastSyncedAt
       FROM subscriptions WHERE license_id = ? ORDER BY last_synced_at DESC LIMIT 1`,
    )
    .bind(licenseId)
    .first<SubscriptionRow & { subscriptionId: string }>();
}

export function subscriptionIsPro(input: {
  snapshot: StripeSubscriptionSnapshot;
  extraPriceIds: readonly string[];
  env: StripeRuntimeEnv;
  alreadyKnown: boolean;
  productKnown: boolean;
}): boolean {
  if (input.alreadyKnown || input.productKnown) return true;
  if (input.snapshot.metadataProduct === API_PRODUCT_PRO) return true;
  return matchesProPrice([...input.snapshot.priceIds, ...input.extraPriceIds], input.env);
}

export function priceIdList(ids: readonly string[]): string | null {
  const unique = [...new Set(ids.filter((id) => id.startsWith('price_')))].sort();
  return unique.length ? unique.join(',') : null;
}

/**
 * Write the fetched Stripe subscription. past_due_since moves only on the first
 * failure of a cycle. A paid active subscription clears it.
 */
export async function applySubscriptionSnapshot(
  db: D1Database,
  input: {
    snapshot: StripeSubscriptionSnapshot;
    eventKind: BillingEventKind;
    email: string;
    pepper: string;
    now: Date;
    env: StripeRuntimeEnv;
    extraPriceIds?: readonly string[];
    alreadyKnown?: boolean;
    productKnown?: boolean;
  },
): Promise<{ ignored: true } | { ignored: false; licenseId: string; access: SubscriptionAccess; pastDueSince: string | null }> {
  const previous = await readSubscription(db, input.snapshot.id);
  const known = Boolean(previous) || Boolean(input.alreadyKnown);
  if (
    !subscriptionIsPro({
      snapshot: input.snapshot,
      extraPriceIds: input.extraPriceIds ?? [],
      env: input.env,
      alreadyKnown: known,
      productKnown: Boolean(input.productKnown),
    })
  ) {
    return { ignored: true };
  }
  const pastDueSince = nextPastDueSince({
    previous: previous?.pastDueSince ?? null,
    eventKind: input.eventKind,
    status: input.snapshot.status,
    now: input.now,
  });
  const access = accessForSubscription(
    {
      status: input.snapshot.status,
      cancelAtPeriodEnd: input.snapshot.cancelAtPeriodEnd,
      currentPeriodEnd: input.snapshot.currentPeriodEnd,
      pastDueSince,
    },
    input.now,
  );
  const { licenseId } = await recordPurchase(db, {
    email: input.email,
    product: API_PRODUCT_PRO,
    source: 'stripe_subscription',
    sourceRef: input.snapshot.id,
    sessionId: input.snapshot.id,
    subscriptionId: input.snapshot.id,
    stripeCustomerId: input.snapshot.customerId || undefined,
    pepper: input.pepper,
    now: input.now,
    status: access.entitled ? 'active' : 'inactive',
    endsAt: access.endsAt,
  });
  const grantStatus = access.entitled ? 'active' : 'inactive';
  await db
    .prepare(
      `UPDATE grants SET
         status = ?,
         ends_at = ?,
         revoked_at = CASE WHEN ? = 'active' THEN NULL ELSE COALESCE(revoked_at, ?) END,
         reason = CASE WHEN ? = 'active' THEN NULL ELSE COALESCE(reason, 'subscription') END
       WHERE license_id = ? AND product = ? AND source = 'stripe_subscription'`,
    )
    .bind(grantStatus, access.endsAt, grantStatus, input.now.toISOString(), grantStatus, licenseId, API_PRODUCT_PRO)
    .run();
  const stamp = input.now.toISOString();
  await db
    .prepare(
      `UPDATE subscriptions SET
         status = ?, price_id = ?, cancel_at_period_end = ?, current_period_end = ?,
         past_due_since = ?, last_event_at = ?, last_synced_at = ?
       WHERE stripe_subscription_id = ?`,
    )
    .bind(
      input.snapshot.status || 'canceled',
      priceIdList(input.snapshot.priceIds),
      input.snapshot.cancelAtPeriodEnd ? 1 : 0,
      input.snapshot.currentPeriodEnd,
      pastDueSince,
      stamp,
      stamp,
      input.snapshot.id,
    )
    .run();
  if (input.snapshot.customerId) {
    const owner = await db
      .prepare(`SELECT id FROM identities WHERE stripe_customer_id = ? AND license_id <> ? LIMIT 1`)
      .bind(input.snapshot.customerId, licenseId)
      .first<{ id: number }>();
    if (!owner) {
      await db
        .prepare(
          `UPDATE identities SET stripe_customer_id = ?
           WHERE license_id = ? AND (stripe_customer_id IS NULL OR stripe_customer_id = '')`,
        )
        .bind(input.snapshot.customerId, licenseId)
        .run();
    }
  }
  return { ignored: false, licenseId, access, pastDueSince };
}
