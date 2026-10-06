import {
  entitlementStatus,
  proEntitlementStatus,
  type EntitlementStore,
  type ProEntitlement,
  type WhiteEntitlement,
} from './entitlements.ts';
import { API_FREE_CODE, API_PRODUCT_ID, API_PRODUCT_PRO } from './routes.ts';
import {
  checkoutFormFields,
  checkoutReturnUrls,
  createCheckoutSession,
  findPromotionCodeId,
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

function freeSessionId(): string {
  return `free_${crypto.randomUUID().replace(/-/g, '')}`;
}

export async function handleCheckout(
  request: Request,
  env: StripeRuntimeEnv,
  fetchImpl: typeof fetch = fetch,
  store: EntitlementStore | null = null,
): Promise<Response> {
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
  const product = readCheckoutProduct((body as { product?: unknown }).product);
  if (typeof product !== 'string') return json(400, { error: product.error });
  if (promo && promo.toUpperCase() === API_FREE_CODE) {
    if (product !== 'white') return json(400, { error: 'That promo code is not active.' });
    return grantFreeUnlock(store);
  }

  const config = readStripeConfig(env, product);
  if ('error' in config) return json(503, { error: config.error });
  const urls = checkoutReturnUrls(request.url, env, product);
  if ('error' in urls) return json(503, { error: urls.error });

  try {
    let promotionCodeId: string | undefined;
    if (promo) {
      const found = await findPromotionCodeId(config.secret, promo, fetchImpl);
      if (!found) return json(400, { error: 'That promo code is not active.' });
      promotionCodeId = found;
    }
    const fields = checkoutFormFields({
      priceIds: config.priceIds,
      mode: config.mode,
      productId: config.productId,
      successUrl: urls.successUrl,
      cancelUrl: urls.cancelUrl,
      promotionCodeId,
    });
    const session = await createCheckoutSession(config.secret, fields, fetchImpl);
    return json(200, { url: session.url, id: session.id });
  } catch (error) {
    return stripeFailure(error);
  }
}

export async function handleWebhook(
  request: Request,
  env: StripeRuntimeEnv,
  store: EntitlementStore | null,
  now: () => Date = () => new Date(),
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
  if (parsed.action === 'record') {
    const record: WhiteEntitlement = {
      email: parsed.purchase.email,
      sessionId: parsed.purchase.sessionId,
      product: API_PRODUCT_ID,
      amountTotal: parsed.purchase.amountTotal,
      currency: parsed.purchase.currency,
      createdAt: now().toISOString(),
    };
    const stored = await store.save(record);
    return json(200, { received: true, sessionId: stored.sessionId });
  }
  const stamp = now().toISOString();
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
    return json(200, { received: true, sessionId: stored.sessionId, entitled: true });
  }
  const existing = await store.findProBySubscriptionId(parsed.sync.subscriptionId);
  if (!parsed.sync.productKnown && !existing) return json(200, { received: true, ignored: true });
  if (!parsed.sync.entitled && !existing) return json(200, { received: true, ignored: true });
  const next: ProEntitlement = {
    email: parsed.sync.email || existing?.email || '',
    sessionId: existing?.sessionId.startsWith('cs_') ? existing.sessionId : parsed.sync.subscriptionId,
    subscriptionId: parsed.sync.subscriptionId,
    product: API_PRODUCT_PRO,
    status: parsed.sync.entitled ? 'active' : 'inactive',
    amountTotal: existing?.amountTotal ?? parsed.sync.amountTotal,
    currency: existing?.currency ?? parsed.sync.currency,
    createdAt: existing?.createdAt ?? stamp,
    updatedAt: stamp,
  };
  const stored = await store.savePro(next);
  return json(200, { received: true, sessionId: stored.sessionId, entitled: stored.status === 'active' });
}

const SESSION_ID = /^(?:cs|free)_[A-Za-z0-9_]+$/;

async function grantFreeUnlock(store: EntitlementStore | null, now: () => Date = () => new Date()): Promise<Response> {
  if (!store) {
    return json(503, {
      error: 'Entitlement store is not configured. Bind WHITE_ENTITLEMENTS or use local dev.',
    });
  }
  const record: WhiteEntitlement = {
    email: '',
    sessionId: freeSessionId(),
    product: API_PRODUCT_ID,
    amountTotal: 0,
    currency: 'usd',
    createdAt: now().toISOString(),
  };
  const stored = await store.save(record);
  return json(200, {
    entitled: true,
    free: true,
    amountTotal: 0,
    currency: 'usd',
    product: stored.product,
    email: stored.email,
    sessionId: stored.sessionId,
    createdAt: stored.createdAt,
  });
}

export async function handleEntitlement(request: Request, store: EntitlementStore | null): Promise<Response> {
  if (request.method !== 'GET') return methodNotAllowed('GET');
  if (!store) {
    return json(503, { error: 'Entitlement store is not configured. Bind WHITE_ENTITLEMENTS or use local dev.' });
  }
  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id')?.trim() ?? '';
  const email = url.searchParams.get('email')?.trim() ?? '';
  const product = url.searchParams.get('product')?.trim().toLowerCase() ?? '';
  if (!sessionId && !email) return json(400, { error: 'Pass email or session_id.' });
  if (sessionId && !SESSION_ID.test(sessionId)) return json(400, { error: 'session_id is not a purchase id.' });
  if (email && (email.length > 320 || !email.includes('@') || /\s/.test(email))) {
    return json(400, { error: 'email is not valid.' });
  }
  if (product && product !== 'white' && product !== 'pro') return json(400, { error: 'Product must be white or pro.' });
  if (sessionId) {
    const white = await store.findBySessionId(sessionId);
    if (white) return json(200, entitlementStatus(white));
    return json(200, proEntitlementStatus(await store.findProBySessionId(sessionId)));
  }
  if (product === 'pro') return json(200, proEntitlementStatus(await store.findProByEmail(email)));
  return json(200, entitlementStatus(await store.findByEmail(email)));
}
