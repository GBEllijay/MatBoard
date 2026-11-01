import { isCheckoutProduct, type CheckoutProduct } from '../lib/checkoutProducts.ts';
import { impliedDoors } from '../lib/tierImplications.ts';
import type { D1Database } from './d1.ts';
import { normalizeEmail, type EntitlementStore } from './entitlements.ts';
import { allowAttempt, clientIp, rateBucket, rateLimitedResponse } from './rateLimit.ts';
import { readStripeConfig, stripeRequest, type StripeRuntimeEnv } from './stripeCheckout.ts';

/**
 * Upgrade credit (Nov 2026 owner rule).
 *
 * Ladder: White < Student < Media < Instructor (internal `coach`) < Pro.
 * Credit toward tier T = the most this email actually paid on ONE earlier Stripe
 * purchase of a LOWER tier (Stripe amount_total, so a half-off buy counts what was
 * paid). Codes, alpha, owner, and free unlocks have no Stripe amount and earn 0.
 * Refunded or lost-dispute purchases (revoked in D1) earn 0.
 * Credit is capped so the buyer still pays at least MIN_UPGRADE_CHARGE_CENTS.
 * For Pro the credit applies only to the one-time line, never the $5.99/month line.
 */
export const UPGRADE_TIER_ORDER: readonly CheckoutProduct[] = ['white', 'student', 'media', 'coach', 'pro'];

/** Stripe's smallest USD card charge. The credit never takes a purchase below this. */
export const MIN_UPGRADE_CHARGE_CENTS = 50;

/** Single-use coupon window. Stripe Checkout sessions expire after 24 hours by default. */
export const UPGRADE_COUPON_TTL_SECONDS = 25 * 60 * 60;

export const UPGRADE_QUOTE_LIMIT = 20;

const TIER_LABEL: Record<CheckoutProduct, string> = {
  white: 'Advantage White',
  student: 'Student Edition',
  media: 'Media Edition',
  coach: 'Instructor Edition',
  pro: 'Advantage Pro',
};

export function upgradeTierLabel(tier: CheckoutProduct): string {
  return TIER_LABEL[tier];
}

export function tierRank(tier: CheckoutProduct): number {
  return UPGRADE_TIER_ORDER.indexOf(tier);
}

export type PaidPurchase = {
  tier: CheckoutProduct;
  sessionId: string;
  /** Stripe amount_total in cents. 0 or null earns no credit. */
  amountPaid: number | null;
  currency: string | null;
  /** False when refunded, disputed and lost, or (Pro) no longer active. */
  active: boolean;
};

export type UpgradeQuote =
  | { owned: true; ownedTier: CheckoutProduct }
  | { owned: false; listPriceCents: number; creditCents: number; dueCents: number };

/** True when an active purchase already opens the target tier's door. */
export function ownedTierFor(target: CheckoutProduct, purchases: readonly PaidPurchase[]): CheckoutProduct | null {
  for (const purchase of purchases) {
    if (!purchase.active) continue;
    if (impliedDoors([purchase.tier]).includes(target)) return purchase.tier;
  }
  return null;
}

/** Highest single amount actually paid on an active lower-tier USD purchase. Uncapped. */
export function rawUpgradeCredit(target: CheckoutProduct, purchases: readonly PaidPurchase[]): number {
  const rank = tierRank(target);
  let best = 0;
  for (const purchase of purchases) {
    if (!purchase.active) continue;
    if (tierRank(purchase.tier) >= rank) continue;
    if ((purchase.currency ?? '').toLowerCase() !== 'usd') continue;
    const paid = purchase.amountPaid ?? 0;
    if (Number.isInteger(paid) && paid > best) best = paid;
  }
  return best;
}

export function capUpgradeCredit(rawCredit: number, listPriceCents: number): number {
  const cap = Math.max(0, listPriceCents - MIN_UPGRADE_CHARGE_CENTS);
  return Math.max(0, Math.min(rawCredit, cap));
}

export function computeUpgradeQuote(
  target: CheckoutProduct,
  listPriceCents: number,
  purchases: readonly PaidPurchase[],
): UpgradeQuote {
  const ownedTier = ownedTierFor(target, purchases);
  if (ownedTier) return { owned: true, ownedTier };
  const creditCents = capUpgradeCredit(rawUpgradeCredit(target, purchases), listPriceCents);
  return { owned: false, listPriceCents, creditCents, dueCents: listPriceCents - creditCents };
}

export function ownedMessage(target: CheckoutProduct, ownedTier: CheckoutProduct): string {
  const own = upgradeTierLabel(ownedTier);
  const want = upgradeTierLabel(target);
  return ownedTier === target
    ? `This email already owns ${want}. Use Restore purchases to open it on this device instead of buying it again.`
    : `This email already owns ${own}, which includes ${want}. Use Restore purchases to open it on this device.`;
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

export function readUpgradeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = normalizeEmail(raw);
  if (!email || email.length > 254 || !EMAIL.test(email)) return null;
  return email;
}

/** D1 refunds and lost disputes mark the grant row inactive. No D1 means no known revocation. */
async function sessionRevoked(db: D1Database | null, sessionId: string): Promise<boolean> {
  if (!db) return false;
  try {
    const row = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM grants
         WHERE source_ref = ? AND source IN ('stripe_payment', 'stripe_subscription')
           AND (revoked_at IS NOT NULL OR status <> 'active')`,
      )
      .bind(sessionId)
      .first<{ n: number }>();
    return Number(row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Stripe purchases on record for this email. Amounts come from the entitlement store,
 * which the webhook fills with amount_total. Code and alpha unlocks are not in it.
 */
export async function loadPaidPurchases(
  store: EntitlementStore | null,
  db: D1Database | null,
  email: string,
): Promise<PaidPurchase[]> {
  if (!store) return [];
  const [white, student, media, coach, pro] = await Promise.all([
    store.findByEmail(email),
    store.findStudentByEmail(email),
    store.findMediaByEmail(email),
    store.findCoachByEmail(email),
    store.findProByEmail(email),
  ]);
  const rows: { tier: CheckoutProduct; record: { sessionId: string; amountTotal: number | null; currency: string | null } | null; active: boolean }[] = [
    { tier: 'white', record: white, active: true },
    { tier: 'student', record: student, active: true },
    { tier: 'media', record: media, active: true },
    { tier: 'coach', record: coach, active: true },
    { tier: 'pro', record: pro, active: pro?.status === 'active' },
  ];
  const purchases: PaidPurchase[] = [];
  for (const row of rows) {
    if (!row.record) continue;
    const revoked = await sessionRevoked(db, row.record.sessionId);
    purchases.push({
      tier: row.tier,
      sessionId: row.record.sessionId,
      amountPaid: row.record.amountTotal,
      currency: row.record.currency,
      active: row.active && !revoked,
    });
  }
  return purchases;
}

export type StripePriceInfo = { priceId: string; unitAmount: number; currency: string; productId: string };

/** Read-only Stripe GET. The first price is the one-time line (Pro's $99.99, never the monthly). */
export async function fetchOneTimePrice(
  secret: string,
  priceId: string,
  fetchImpl: typeof fetch,
): Promise<StripePriceInfo> {
  const body = (await stripeRequest(secret, `/v1/prices/${encodeURIComponent(priceId)}`, { method: 'GET' }, fetchImpl)) as {
    unit_amount?: unknown;
    currency?: unknown;
    product?: unknown;
  };
  const unitAmount = typeof body.unit_amount === 'number' ? body.unit_amount : NaN;
  const product =
    typeof body.product === 'string'
      ? body.product
      : body.product && typeof body.product === 'object' && typeof (body.product as { id?: unknown }).id === 'string'
        ? (body.product as { id: string }).id
        : '';
  if (!Number.isInteger(unitAmount) || unitAmount <= 0 || !product) throw new Error('Stripe price is missing an amount.');
  return { priceId, unitAmount, currency: typeof body.currency === 'string' ? body.currency : 'usd', productId: product };
}

/**
 * Runtime single-use coupon: amount_off, duration once, max_redemptions 1, limited to
 * the one-time price's Stripe product so a Pro monthly line is never discounted.
 */
export function upgradeCouponFields(input: {
  creditCents: number;
  currency: string;
  productId: string;
  tier: CheckoutProduct;
  nowSeconds: number;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('amount_off', String(input.creditCents));
  params.set('currency', input.currency || 'usd');
  params.set('duration', 'once');
  params.set('max_redemptions', '1');
  params.set('redeem_by', String(input.nowSeconds + UPGRADE_COUPON_TTL_SECONDS));
  params.set('name', 'Upgrade credit');
  params.set('applies_to[products][0]', input.productId);
  params.set('metadata[kind]', 'upgrade_credit');
  params.set('metadata[tier]', input.tier);
  return params;
}

export async function createUpgradeCoupon(
  secret: string,
  fields: URLSearchParams,
  fetchImpl: typeof fetch,
): Promise<string> {
  const body = (await stripeRequest(secret, '/v1/coupons', { method: 'POST', body: fields.toString() }, fetchImpl)) as {
    id?: unknown;
  };
  if (typeof body.id !== 'string' || !body.id) throw new Error('Stripe did not return a coupon.');
  return body.id;
}

export type UpgradePlan =
  | { kind: 'none' }
  | { kind: 'owned'; message: string; ownedTier: CheckoutProduct }
  | { kind: 'credit'; creditCents: number; listPriceCents: number; dueCents: number; price: StripePriceInfo };

/**
 * Checkout's credit decision. A new buyer (no Stripe purchase on record) makes no
 * extra Stripe call. The handler compares the credit with MEIA half off (creditBeatsHalfOff).
 */
export async function planUpgrade(input: {
  target: CheckoutProduct;
  email: string;
  secret: string;
  priceIds: readonly string[];
  store: EntitlementStore | null;
  db: D1Database | null;
  fetchImpl: typeof fetch;
}): Promise<UpgradePlan> {
  const purchases = await loadPaidPurchases(input.store, input.db, input.email);
  if (!purchases.length) return { kind: 'none' };
  const ownedTier = ownedTierFor(input.target, purchases);
  if (ownedTier) return { kind: 'owned', ownedTier, message: ownedMessage(input.target, ownedTier) };
  const raw = rawUpgradeCredit(input.target, purchases);
  if (raw <= 0) return { kind: 'none' };
  const price = await fetchOneTimePrice(input.secret, input.priceIds[0], input.fetchImpl);
  const quote = computeUpgradeQuote(input.target, price.unitAmount, purchases);
  if (quote.owned || quote.creditCents <= 0) return { kind: 'none' };
  return { kind: 'credit', creditCents: quote.creditCents, listPriceCents: quote.listPriceCents, dueCents: quote.dueCents, price };
}

/**
 * Stripe allows one discount per Checkout. With MEIA half off active the credit is used
 * only when it saves more than half the one-time list price; otherwise half off stays.
 */
export function creditBeatsHalfOff(creditCents: number, listPriceCents: number): boolean {
  return creditCents > Math.floor(listPriceCents / 2);
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

/**
 * POST /api/upgrade-quote { tier, email } (GET ?tier=&email= also works).
 * Returns only prices for that tier: { tier, listPriceCents, upgradePriceCents, creditApplied }
 * or { owned: true, message }. Never returns sessions, dates, or which tier was paid.
 */
export async function handleUpgradeQuote(
  request: Request,
  env: StripeRuntimeEnv & { CODE_HASH_PEPPER?: string },
  store: EntitlementStore | null,
  db: D1Database | null,
  fetchImpl: typeof fetch = fetch,
  kv: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<unknown> } | null = null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST' && request.method !== 'GET') return json(405, { error: 'Method not allowed.' });
  const bucket = await rateBucket('upgrade-quote', clientIp(request), env.CODE_HASH_PEPPER?.trim() ?? '');
  if (!(await allowAttempt(bucket, UPGRADE_QUOTE_LIMIT, now().getTime(), kv))) return rateLimitedResponse();

  let tierRaw: unknown;
  let emailRaw: unknown;
  let halfOffRaw: unknown;
  if (request.method === 'GET') {
    const url = new URL(request.url);
    tierRaw = url.searchParams.get('tier');
    emailRaw = url.searchParams.get('email');
    halfOffRaw = url.searchParams.get('halfOff') === 'true';
  } else {
    const raw = await request.text();
    if (raw.length > 2_000) return json(413, { error: 'Request is too large.' });
    try {
      const body = (raw.trim() ? JSON.parse(raw) : {}) as { tier?: unknown; email?: unknown; halfOff?: unknown };
      tierRaw = body?.tier;
      emailRaw = body?.email;
      halfOffRaw = body?.halfOff;
    } catch {
      return json(400, { error: 'Body must be JSON.' });
    }
  }
  const tierText = typeof tierRaw === 'string' ? tierRaw.trim().toLowerCase() : '';
  const tier = tierText === 'instructor' ? 'coach' : tierText;
  if (!isCheckoutProduct(tier) || tier === 'white') return json(400, { error: 'Tier must be student, media, coach, or pro.' });
  const email = readUpgradeEmail(emailRaw);
  if (!email) return json(400, { error: 'Enter a valid email.' });

  const config = readStripeConfig(env, tier);
  if ('error' in config) return json(503, { error: config.error });
  try {
    const purchases = await loadPaidPurchases(store, db, email);
    const price = await fetchOneTimePrice(config.secret, config.priceIds[0], fetchImpl);
    const quote = computeUpgradeQuote(tier, price.unitAmount, purchases);
    if (quote.owned) return json(200, { ok: true, tier, owned: true, message: ownedMessage(tier, quote.ownedTier) });
    const useCredit =
      quote.creditCents > 0 && (halfOffRaw !== true || creditBeatsHalfOff(quote.creditCents, quote.listPriceCents));
    return json(200, {
      ok: true,
      tier,
      listPriceCents: quote.listPriceCents,
      upgradePriceCents: useCredit ? quote.dueCents : quote.listPriceCents,
      creditApplied: useCredit ? quote.creditCents : 0,
    });
  } catch {
    return json(502, { error: 'Could not reach Stripe for a price. Try again.' });
  }
}
