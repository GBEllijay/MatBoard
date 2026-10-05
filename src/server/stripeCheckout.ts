import { CHECKOUT_BUY_PATH, isCheckoutProduct, type CheckoutProduct } from '../lib/checkoutProducts.ts';
import { normalizeEmail } from './entitlements.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_PRO } from './routes.ts';

export type { CheckoutProduct };

export type StripeRuntimeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_WHITE?: string;
  STRIPE_PRICE_COACH?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
};

export type CheckoutPurchase = {
  email: string;
  sessionId: string;
  amountTotal: number | null;
  currency: string | null;
};

const CHECKOUT_PLACEHOLDER = '{CHECKOUT_SESSION_ID}';

export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim();
  if (!code) return null;
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(code)) return null;
  return code;
}

const PRODUCT_META: Record<CheckoutProduct, string> = {
  white: API_PRODUCT_ID,
  coach: API_PRODUCT_COACH,
  pro: API_PRODUCT_PRO,
};

const CHECKOUT_MODE: Record<CheckoutProduct, 'payment' | 'subscription'> = {
  white: 'payment',
  coach: 'payment',
  pro: 'subscription',
};

/**
 * Env names for each product, in line-item order.
 * Pro is a mixed cart: one-time price, then the monthly price. Stripe requires
 * mode=subscription when a session has both. payment_intent_data is not valid then.
 */
const PRICE_ENV_KEYS: Record<CheckoutProduct, (keyof StripeRuntimeEnv)[]> = {
  white: ['STRIPE_PRICE_WHITE'],
  coach: ['STRIPE_PRICE_COACH'],
  pro: ['STRIPE_PRICE_PRO', 'STRIPE_PRICE_PRO_MONTHLY'],
};

const CONFIG_HINT: Record<CheckoutProduct, string> = {
  white: 'STRIPE_SECRET_KEY and STRIPE_PRICE_WHITE',
  coach: 'STRIPE_SECRET_KEY and STRIPE_PRICE_COACH',
  pro: 'STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, and STRIPE_PRICE_PRO_MONTHLY',
};

export function readCheckoutProduct(raw: unknown): CheckoutProduct | { error: string } {
  if (raw === undefined || raw === null) return 'white';
  if (typeof raw !== 'string') return { error: 'Product must be white, coach, or pro.' };
  const product = raw.trim().toLowerCase();
  if (!product) return 'white';
  if (isCheckoutProduct(product)) return product;
  return { error: 'Product must be white, coach, or pro.' };
}

export function checkoutFormFields(input: {
  priceIds: readonly string[];
  mode: 'payment' | 'subscription';
  productId: string;
  successUrl: string;
  cancelUrl: string;
  promotionCodeId?: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('mode', input.mode);
  input.priceIds.forEach((priceId, index) => {
    params.set(`line_items[${index}][price]`, priceId);
    params.set(`line_items[${index}][quantity]`, '1');
  });
  params.set('success_url', input.successUrl);
  params.set('cancel_url', input.cancelUrl);
  params.set('metadata[product]', input.productId);
  if (input.mode === 'subscription') {
    params.set('subscription_data[metadata][product]', input.productId);
  } else {
    params.set('payment_intent_data[metadata][product]', input.productId);
  }
  if (input.promotionCodeId) params.set('discounts[0][promotion_code]', input.promotionCodeId);
  else params.set('allow_promotion_codes', 'true');
  return params;
}

export function isStripeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}

export function checkoutReturnUrls(
  requestUrl: string,
  env: StripeRuntimeEnv,
  product: CheckoutProduct = 'white',
): { successUrl: string; cancelUrl: string } | { error: string } {
  let origin: string;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    return { error: 'Could not determine the site origin for Checkout return URLs.' };
  }
  const path = CHECKOUT_BUY_PATH[product];
  // Optional overrides stay White-only so a White URL does not send Coach or Pro back to /buy.
  const successOverride = product === 'white' ? env.STRIPE_SUCCESS_URL?.trim() : '';
  const cancelOverride = product === 'white' ? env.STRIPE_CANCEL_URL?.trim() : '';
  const successUrl = successOverride || `${origin}${path}?checkout=success&session_id=${CHECKOUT_PLACEHOLDER}`;
  const cancelUrl = cancelOverride || `${origin}${path}?checkout=cancel`;
  if (!successUrl.includes(CHECKOUT_PLACEHOLDER)) {
    return { error: 'STRIPE_SUCCESS_URL must include {CHECKOUT_SESSION_ID}.' };
  }
  try {
    const success = new URL(successUrl.replace(CHECKOUT_PLACEHOLDER, 'cs_test_placeholder'));
    const cancel = new URL(cancelUrl);
    if (success.protocol !== 'https:' && success.protocol !== 'http:') throw new Error('protocol');
    if (cancel.protocol !== 'https:' && cancel.protocol !== 'http:') throw new Error('protocol');
  } catch {
    return { error: 'Success and cancel URLs must be absolute http(s) URLs.' };
  }
  return { successUrl, cancelUrl };
}

export function readStripeConfig(
  env: StripeRuntimeEnv,
  product: CheckoutProduct = 'white',
): { secret: string; priceIds: string[]; mode: 'payment' | 'subscription'; productId: string } | { error: string } {
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  const keys = PRICE_ENV_KEYS[product];
  const priceIds = keys.map((key) => (env[key] ?? '').trim());
  if (!secret || priceIds.some((price) => !price)) {
    return { error: `Stripe is not configured. Set ${CONFIG_HINT[product]}.` };
  }
  if (!secret.startsWith('sk_')) {
    return { error: 'STRIPE_SECRET_KEY must be a Stripe secret key. Use an sk_test_ key in test mode.' };
  }
  for (let index = 0; index < priceIds.length; index += 1) {
    if (!priceIds[index].startsWith('price_')) {
      return { error: `${keys[index]} must be a Stripe Price id (price_...).` };
    }
  }
  return {
    secret,
    priceIds,
    mode: CHECKOUT_MODE[product],
    productId: PRODUCT_META[product],
  };
}

export function stripeErrorMessage(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message?.trim();
    if (message) return message.slice(0, 300);
  } catch {
    /* Stripe sometimes returns non-JSON. */
  }
  return `Stripe request failed (${status}).`;
}

async function stripeRequest(
  secret: string,
  path: string,
  init: { method: 'GET' | 'POST'; body?: string },
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(`https://api.stripe.com${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${secret}`,
      ...(init.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: init.body,
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(stripeErrorMessage(response.status, text));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return JSON.parse(text) as unknown;
}

export async function findPromotionCodeId(
  secret: string,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const params = new URLSearchParams();
  params.set('code', code);
  params.set('active', 'true');
  params.set('limit', '1');
  const body = (await stripeRequest(secret, `/v1/promotion_codes?${params.toString()}`, { method: 'GET' }, fetchImpl)) as {
    data?: { id?: string }[];
  };
  const id = body.data?.[0]?.id;
  return typeof id === 'string' && id ? id : null;
}

export async function createCheckoutSession(
  secret: string,
  fields: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; url: string }> {
  const body = (await stripeRequest(
    secret,
    '/v1/checkout/sessions',
    { method: 'POST', body: fields.toString() },
    fetchImpl,
  )) as { id?: string; url?: string };
  if (!body.url || !isStripeCheckoutUrl(body.url) || typeof body.id !== 'string') {
    throw new Error('Stripe did not return a Checkout URL.');
  }
  return { id: body.id, url: body.url };
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexEqual(a: string, b: string): boolean {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  const length = Math.max(left.length, right.length);
  let diff = left.length === right.length ? 0 : 1;
  for (let index = 0; index < length; index += 1) {
    diff |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return diff === 0;
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key === 't') timestamp = value;
    if (key === 'v1' && value) signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  const stamped = Number(timestamp);
  if (Math.abs(nowSeconds - stamped) > toleranceSeconds) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const expected = hexFromBuffer(mac);
  return signatures.some((signature) => hexEqual(signature, expected));
}

function readEmail(session: Record<string, unknown>): string {
  const details = session.customer_details;
  if (details && typeof details === 'object' && typeof (details as { email?: unknown }).email === 'string') {
    return normalizeEmail((details as { email: string }).email);
  }
  if (typeof session.customer_email === 'string') return normalizeEmail(session.customer_email);
  return '';
}

export function purchaseFromStripeEvent(event: unknown):
  | { action: 'record'; purchase: CheckoutPurchase }
  | { action: 'ignore' }
  | { action: 'invalid' } {
  if (!event || typeof event !== 'object') return { action: 'invalid' };
  const type = (event as { type?: unknown }).type;
  if (type !== 'checkout.session.completed') return { action: 'ignore' };
  const data = (event as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return { action: 'invalid' };
  const session = (data as { object?: unknown }).object;
  if (!session || typeof session !== 'object') return { action: 'invalid' };
  const row = session as Record<string, unknown>;
  if (row.object !== 'checkout.session') return { action: 'invalid' };
  if (row.mode !== 'payment') return { action: 'ignore' };
  const metadata = row.metadata;
  const product =
    metadata && typeof metadata === 'object' ? (metadata as { product?: unknown }).product : undefined;
  if (product !== API_PRODUCT_ID) return { action: 'ignore' };
  if (row.payment_status !== 'paid' && row.payment_status !== 'no_payment_required') return { action: 'ignore' };
  if (typeof row.id !== 'string' || !row.id.startsWith('cs_')) return { action: 'invalid' };
  return {
    action: 'record',
    purchase: {
      email: readEmail(row),
      sessionId: row.id,
      amountTotal: typeof row.amount_total === 'number' ? row.amount_total : null,
      currency: typeof row.currency === 'string' ? row.currency : null,
    },
  };
}
