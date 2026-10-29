import type { D1Database } from './d1.ts';
import {
  type CoachEntitlement,
  type EntitlementStore,
  type ProEntitlement,
  type StudentEntitlement,
  type WhiteEntitlement,
} from './entitlements.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { lookupCheckoutSessionId, revokeOneTimePurchase } from './refundRevoke.ts';
import { applySubscriptionSnapshot } from './subscriptionSync.ts';
import { canceledSnapshot, fetchStripeSubscription, type StripeSubscriptionSnapshot } from './stripeSubscription.ts';
import { isHalfOffCheckoutFlag } from '../lib/halfOff.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from './routes.ts';
import {
  checkoutFormFields,
  checkoutReturnUrls,
  createCheckoutSession,
  findPromotionCodeId,
  lookupAllowlistedHalfOffPromotion,
  normalizePromoCode,
  purchaseFromStripeEvent,
  readCheckoutProduct,
  readStripeConfig,
  verifyStripeSignature,
  type StripeRuntimeEnv,
} from './stripeCheckout.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

export function methodNotAllowed(allow: string): Response {
  return json(405, { error: 'Method not allowed.' }, { allow });
}

function stripeFailure(error: unknown): Response {
  const status = typeof error === 'object' && error && 'status' in error ? Number((error as { status?: number }).status) : 0;
  const message = error instanceof Error ? error.message : 'Stripe request failed.';
  const http = status >= 400 && status < 500 ? 400 : 502;
  return json(http, { error: message || 'Stripe request failed.' });
}

export async function handleCheckout(
  request: Request,
  env: StripeRuntimeEnv,
  fetchImpl: typeof fetch = fetch,
  store: EntitlementStore | null = null,
): Promise<Response> {
  void store;
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const raw = await request.text();
  if (raw.length > 4_000) return json(413, { error: 'Checkout request is too large.' });
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown;
    } catch {
      return json(400, { error: 'Checkout body must be JSON.' });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(400, { error: 'Checkout body must be a JSON object.' });
  const promoField = (body as { promotionCode?: unknown }).promotionCode;
  if (promoField !== undefined && promoField !== null && typeof promoField !== 'string') {
    return json(400, { error: 'Promo code must be text.' });
  }
  const promo = typeof promoField === 'string' ? normalizePromoCode(promoField) : null;
  if (typeof promoField === 'string' && promoField.trim() && !promo) {
    return json(400, { error: 'Enter a promo code using letters, numbers, underscores, or hyphens.' });
  }
  const halfOff = isHalfOffCheckoutFlag((body as { halfOff?: unknown }).halfOff);
  const product = readCheckoutProduct((body as { product?: unknown }).product);
  if (typeof product !== 'string') return json(400, { error: product.error });

  const config = readStripeConfig(env, product);
  if ('error' in config) return json(503, { error: config.error });
  const urls = checkoutReturnUrls(request.url, env, product);
  if ('error' in urls) return json(503, { error: urls.error });

  try {
    let promotionCodeId: string | undefined;
    if (halfOff) {
      // Allowlist is MEIA inside the lookup. A promotionCode on the same body is ignored.
      const found = await lookupAllowlistedHalfOffPromotion(config.secret, fetchImpl);
      if (found) promotionCodeId = found;
    } else if (promo) {
      const found = await findPromotionCodeId(config.secret, promo, fetchImpl);
      if (!found) return json(400, { error: 'That promo code is not active.' });
      promotionCodeId = found;
    }
    const nonceHash = (body as { nonceHash?: unknown }).nonceHash;
    const fields = checkoutFormFields({
      priceIds: config.priceIds,
      mode: config.mode,
      productId: config.productId,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      promotionCodeId,
      clientReferenceId: typeof nonceHash === 'string' ? nonceHash.trim() : undefined,
    });
    const session = await createCheckoutSession(config.secret, fields, fetchImpl);
    return json(200, { url: session.url, id: session.id });
  } catch (error) {
    return stripeFailure(error);
  }
}

export type WebhookExtras = {
  db?: D1Database | null;
  pepper?: string;
  /** When set, subscription events are re-read from Stripe before they are stored. */
  fetchImpl?: typeof fetch;
};

async function rememberEvent(extras: WebhookExtras, eventId: string, stamp: string): Promise<void> {
  if (!eventId || !extras.db) return;
  await extras.db.prepare(`INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)`).bind(eventId, stamp).run();
}

function eventInstant(event: unknown, fallback: Date): Date {
  if (event && typeof event === 'object' && typeof (event as { created?: unknown }).created === 'number') {
    const created = (event as { created: number }).created;
    if (Number.isFinite(created) && created > 0) return new Date(created * 1000);
  }
  return fallback;
}

async function freshSubscription(
  env: StripeRuntimeEnv,
  extras: WebhookExtras,
  subscriptionId: string,
): Promise<StripeSubscriptionSnapshot | 'error' | null> {
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!extras.fetchImpl || !secret) return null;
  const fetched = await fetchStripeSubscription(secret, subscriptionId, extras.fetchImpl);
  if (fetched === 'error') return 'error';
  if (fetched === 'missing') return canceledSnapshot(subscriptionId);
  return fetched;
}

async function mirrorPurchase(
  extras: WebhookExtras,
  input: {
    email: string;
    product: string;
    source: 'stripe_payment' | 'stripe_subscription';
    sourceRef: string;
    sessionId: string;
    subscriptionId?: string;
    status?: 'active' | 'inactive';
    now: Date;
  },
): Promise<void> {
  if (!extras.db) return;
  await recordPurchase(extras.db, {
    email: input.email,
    product: input.product,
    source: input.source,
    sourceRef: input.sourceRef,
    sessionId: input.sessionId,
    subscriptionId: input.subscriptionId,
    pepper: extras.pepper ?? '',
    now: input.now,
    status: input.status ?? 'active',
  });
}

export async function handleWebhook(
  request: Request,
  env: StripeRuntimeEnv,
  store: EntitlementStore | null,
  now: () => Date = () => new Date(),
  extras: WebhookExtras = {},
): Promise<Response> {
  if (request.method !== 'POST') return methodNotAllowed('POST');
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? '';
  if (!secret) return json(503, { error: 'Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET.' });
  const payload = await request.text();
  if (payload.length > 1_000_000) return json(413, { error: 'Webhook body is too large.' });
  const signature = request.headers.get('stripe-signature');
  const valid = await verifyStripeSignature(payload, signature, secret, Math.floor(now().getTime() / 1000));
  if (!valid) return json(400, { error: 'Invalid Stripe signature.' });

  let event: unknown;
  try {
    event = JSON.parse(payload) as unknown;
  } catch {
    return json(400, { error: 'Webhook body must be JSON.' });
  }
  const eventId = event && typeof event === 'object' && typeof (event as { id?: unknown }).id === 'string' ? (event as { id: string }).id : '';
  if (eventId && extras.db) {
    const seen = await extras.db
      .prepare(`SELECT event_id AS eventId FROM stripe_events WHERE event_id = ?`)
      .bind(eventId)
      .first<{ eventId: string }>();
    if (seen) return json(200, { received: true, duplicate: true });
  }
  const parsed = purchaseFromStripeEvent(event);
  if (parsed.action === 'invalid') return json(400, { error: 'Webhook event is not valid.' });
  if (parsed.action === 'ignore') return json(200, { received: true, ignored: true });
  if (parsed.action === 'retry') {
    return json(500, { error: 'Pro Checkout session is missing the subscription id.' });
  }
  if (!store) {
    return json(500, {
      error: 'Entitlement store is not configured. Bind WHITE_ENTITLEMENTS or use local dev.',
    });
  }
  const stamp = now().toISOString();
  if (parsed.action === 'record' || parsed.action === 'record-student') {
    if (parsed.action === 'record-student') {
      const record: StudentEntitlement = {
        email: parsed.purchase.email,
        sessionId: parsed.purchase.sessionId,
        product: API_PRODUCT_STUDENT,
        amountTotal: parsed.purchase.amountTotal,
        currency: parsed.purchase.currency,
        createdAt: stamp,
      };
      const stored = await store.saveStudent(record);
      await mirrorPurchase(extras, {
        email: stored.email,
        product: stored.product,
        source: 'stripe_payment',
        sourceRef: stored.sessionId,
        sessionId: stored.sessionId,
        now: now(),
      });
      if (eventId && extras.db) {
        await extras.db.prepare(`INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)`).bind(eventId, stamp).run();
      }
      return json(200, { received: true, sessionId: stored.sessionId });
    }
    const record: WhiteEntitlement = {
      email: parsed.purchase.email,
      sessionId: parsed.purchase.sessionId,
      product: API_PRODUCT_ID,
      amountTotal: parsed.purchase.amountTotal,
      currency: parsed.purchase.currency,
      createdAt: stamp,
    };
    const stored = await store.save(record);
    await mirrorPurchase(extras, {
      email: stored.email,
      product: stored.product,
      source: 'stripe_payment',
      sourceRef: stored.sessionId,
      sessionId: stored.sessionId,
      now: now(),
    });
    if (eventId && extras.db) {
      await extras.db.prepare(`INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)`).bind(eventId, stamp).run();
    }
    return json(200, { received: true, sessionId: stored.sessionId });
  }
  if (parsed.action === 'record-coach') {
    const record: CoachEntitlement = {
      email: parsed.purchase.email,
      sessionId: parsed.purchase.sessionId,
      product: API_PRODUCT_COACH,
      amountTotal: parsed.purchase.amountTotal,
      currency: parsed.purchase.currency,
      createdAt: stamp,
    };
    const stored = await store.saveCoach(record);
    await mirrorPurchase(extras, {
      email: stored.email,
      product: stored.product,
      source: 'stripe_payment',
      sourceRef: stored.sessionId,
      sessionId: stored.sessionId,
      now: now(),
    });
    if (eventId && extras.db) {
      await extras.db.prepare(`INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)`).bind(eventId, stamp).run();
    }
    return json(200, { received: true, sessionId: stored.sessionId });
  }
  if (parsed.action === 'grant-pro') {
    const stored = await store.savePro({
      email: parsed.grant.email,
      sessionId: parsed.grant.sessionId,
      subscriptionId: parsed.grant.subscriptionId,
      product: API_PRODUCT_PRO,
      status: 'active',
      amountTotal: parsed.grant.amountTotal,
      currency: parsed.grant.currency,
      createdAt: stamp,
      updatedAt: stamp,
    });
    await mirrorPurchase(extras, {
      email: stored.email,
      product: stored.product,
      source: 'stripe_subscription',
      sourceRef: stored.sessionId,
      sessionId: stored.sessionId,
      subscriptionId: stored.subscriptionId,
      status: 'active',
      now: now(),
    });
    if (eventId && extras.db) {
      await extras.db.prepare(`INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)`).bind(eventId, stamp).run();
    }
    return json(200, { received: true, sessionId: stored.sessionId, entitled: true });
  }
  if (parsed.action === 'revoke-onetime') {
    if (!parsed.revocation.revoke) {
      await rememberEvent(extras, eventId, stamp);
      return json(200, { received: true, ignored: true });
    }
    if (!extras.db) return json(500, { error: 'Entitlement storage is not configured. Bind ENTITLEMENTS_DB.' });
    let sessionId = parsed.revocation.sessionId;
    if (!sessionId && parsed.revocation.paymentIntentId && extras.fetchImpl && env.STRIPE_SECRET_KEY) {
      const found = await lookupCheckoutSessionId(env.STRIPE_SECRET_KEY, parsed.revocation.paymentIntentId, extras.fetchImpl);
      if (found === 'error') return json(500, { error: 'Could not match the refund to a purchase. Stripe will retry.' });
      sessionId = found ?? '';
    }
    if (!sessionId) {
      await rememberEvent(extras, eventId, stamp);
      return json(200, { received: true, ignored: true });
    }
    const revoked = await revokeOneTimePurchase(
      extras.db,
      sessionId,
      parsed.revocation.reason === 'dispute' ? 'dispute-lost' : 'refund',
      now(),
    );
    await rememberEvent(extras, eventId, stamp);
    return json(200, { received: true, revoked: revoked > 0 });
  }
  const existing = await store.findProBySubscriptionId(parsed.sync.subscriptionId);
  const fresh = await freshSubscription(env, extras, parsed.sync.subscriptionId);
  if (fresh === 'error') {
    return json(500, { error: 'Could not read the subscription from Stripe. Stripe will retry.' });
  }
  if (fresh && extras.db) {
    const applied = await applySubscriptionSnapshot(extras.db, {
      snapshot: fresh,
      eventKind: parsed.sync.billingEvent,
      email: parsed.sync.email || existing?.email || '',
      pepper: extras.pepper ?? '',
      now: eventInstant(event, now()),
      env,
      extraPriceIds: parsed.sync.priceIds,
      alreadyKnown: Boolean(existing),
      productKnown: parsed.sync.productKnown,
    });
    if (applied.ignored) {
      await rememberEvent(extras, eventId, stamp);
      return json(200, { received: true, ignored: true });
    }
    const stored = await store.savePro({
      email: parsed.sync.email || existing?.email || '',
      sessionId: existing?.sessionId.startsWith('cs_') ? existing.sessionId : parsed.sync.subscriptionId,
      subscriptionId: parsed.sync.subscriptionId,
      product: API_PRODUCT_PRO,
      status: applied.access.entitled ? 'active' : 'inactive',
      amountTotal: existing?.amountTotal ?? parsed.sync.amountTotal,
      currency: existing?.currency ?? parsed.sync.currency,
      createdAt: existing?.createdAt ?? stamp,
      updatedAt: stamp,
    });
    await rememberEvent(extras, eventId, stamp);
    return json(200, {
      received: true,
      sessionId: stored.sessionId,
      entitled: applied.access.entitled,
      state: applied.access.state,
    });
  }
  if (!parsed.sync.productKnown && !existing && !fresh) return json(200, { received: true, ignored: true });
  if (!parsed.sync.entitled && !existing && !fresh) return json(200, { received: true, ignored: true });
  const entitled = fresh
    ? fresh.status === 'active' || fresh.status === 'trialing' || fresh.status === 'past_due'
    : parsed.sync.entitled;
  if (!entitled && !existing && parsed.sync.billingEvent !== 'failed') {
    await rememberEvent(extras, eventId, stamp);
    return json(200, { received: true, ignored: true });
  }
  const next: ProEntitlement = {
    email: parsed.sync.email || existing?.email || '',
    sessionId: existing?.sessionId.startsWith('cs_') ? existing.sessionId : parsed.sync.subscriptionId,
    subscriptionId: parsed.sync.subscriptionId,
    product: API_PRODUCT_PRO,
    status: entitled ? 'active' : 'inactive',
    amountTotal: existing?.amountTotal ?? parsed.sync.amountTotal,
    currency: existing?.currency ?? parsed.sync.currency,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  const stored = await store.savePro(next);
  await mirrorPurchase(extras, {
    email: stored.email,
    product: stored.product,
    source: 'stripe_subscription',
    sourceRef: stored.subscriptionId,
    sessionId: stored.sessionId,
    subscriptionId: stored.subscriptionId,
    status: stored.status,
    now: now(),
  });
  if (eventId && extras.db) {
    await extras.db.prepare(`INSERT OR IGNORE INTO stripe_events (event_id, received_at) VALUES (?, ?)`).bind(eventId, stamp).run();
  }
  return json(200, { received: true, sessionId: stored.sessionId, entitled: stored.status === 'active' });
}

/**
 * Deleted. Email lookup is replaced by the restore code. The response is the
 * same for every query and does not read the purchase store.
 */
export async function handleEntitlement(
  request: Request,
  _store: EntitlementStore | null,
  _env: { CODE_HASH_PEPPER?: string } = {},
  _kv: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<unknown> } | null = null,
  _now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') return methodNotAllowed('GET');
  return json(410, {
    ok: false,
    error: 'Email lookup has been removed. Use Restore on this site. This check does not say whether an email has a purchase.',
  });
}
