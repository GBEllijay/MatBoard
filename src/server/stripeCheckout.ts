import { CHECKOUT_BUY_PATH, isCheckoutProduct, type CheckoutProduct } from '../lib/checkoutProducts.ts';
import { HALF_OFF_CODE } from '../lib/halfOff.ts';
import { normalizeEmail } from './entitlements.ts';
import { API_PRODUCT_COACH, API_PRODUCT_ID, API_PRODUCT_PRO, API_PRODUCT_STUDENT } from './routes.ts';
import type { BillingEventKind } from './subscriptionAccess.ts';
import { readCurrentPeriodEnd, readPriceIds } from './stripeSubscription.ts';

export type { CheckoutProduct };

export type StripeRuntimeEnv = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_WHITE?: string;
  STRIPE_PRICE_STUDENT?: string;
  STRIPE_PRICE_COACH?: string;
  STRIPE_PRICE_PRO?: string;
  STRIPE_PRICE_PRO_MONTHLY?: string;
  /**
   * Optional. Not used by Checkout. Reserved for a future discount price id.
   */
  STRIPE_PRICE_PRO_MONTHLY_DISCOUNT?: string;
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
  student: API_PRODUCT_STUDENT,
  coach: API_PRODUCT_COACH,
  pro: API_PRODUCT_PRO,
};

const CHECKOUT_MODE: Record<CheckoutProduct, 'payment' | 'subscription'> = {
  white: 'payment',
  student: 'payment',
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
  student: ['STRIPE_PRICE_STUDENT'],
  coach: ['STRIPE_PRICE_COACH'],
  pro: ['STRIPE_PRICE_PRO', 'STRIPE_PRICE_PRO_MONTHLY'],
};

const CONFIG_HINT: Record<CheckoutProduct, string> = {
  white: 'STRIPE_SECRET_KEY and STRIPE_PRICE_WHITE',
  student: 'STRIPE_SECRET_KEY and STRIPE_PRICE_STUDENT',
  coach: 'STRIPE_SECRET_KEY and STRIPE_PRICE_COACH',
  pro: 'STRIPE_SECRET_KEY, STRIPE_PRICE_PRO, and STRIPE_PRICE_PRO_MONTHLY',
};

/**
 * Discount price id, when the owner sets STRIPE_PRICE_PRO_MONTHLY_DISCOUNT.
 * Checkout does not call this. A future discount code can.
 */
export function readOptionalProMonthlyDiscountPrice(env: StripeRuntimeEnv): string | null {
  const price = env.STRIPE_PRICE_PRO_MONTHLY_DISCOUNT?.trim() ?? '';
  if (!price.startsWith('price_')) return null;
  return price;
}

export function readCheckoutProduct(raw: unknown): CheckoutProduct | { error: string } {
  if (raw === undefined || raw === null) return 'white';
  if (typeof raw !== 'string') return { error: 'Product must be white, student, coach, or pro.' };
  const product = raw.trim().toLowerCase();
  if (!product) return 'white';
  if (isCheckoutProduct(product)) return product;
  return { error: 'Product must be white, student, coach, or pro.' };
}

export function checkoutFormFields(input: {
  priceIds: readonly string[];
  mode: 'payment' | 'subscription';
  productId: string;
  successUrl: string;
  cancelUrl: string;
  promotionCodeId?: string;
  /** SHA-256 hex of the browser nonce. Stored as Stripe client_reference_id. */
  clientReferenceId?: string;
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
    params.set('customer_creation', 'always');
  }
  if (input.clientReferenceId && /^[a-f0-9]{64}$/.test(input.clientReferenceId)) {
    params.set('client_reference_id', input.clientReferenceId);
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

/**
 * Active MEIA promotion code, or null when Stripe has no active code or the
 * request fails. Callers fall back to checkout without a discount. The code
 * is the allowlist constant, never a visitor-supplied string. A returned id
 * is applied with discounts, which cannot be combined with allow_promotion_codes.
 */
export async function lookupAllowlistedHalfOffPromotion(
  secret: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  try {
    const params = new URLSearchParams();
    params.set('code', HALF_OFF_CODE);
    params.set('active', 'true');
    params.set('limit', '1');
    const body = (await stripeRequest(
      secret,
      `/v1/promotion_codes?${params.toString()}`,
      { method: 'GET' },
      fetchImpl,
    )) as { data?: { id?: unknown; code?: unknown; active?: unknown }[] };
    const row = body.data?.[0];
    if (!row || row.active === false) return null;
    if (typeof row.code !== 'string' || row.code.trim().toUpperCase() !== HALF_OFF_CODE) return null;
    if (typeof row.id !== 'string' || !row.id.startsWith('promo_')) return null;
    return row.id;
  } catch {
    return null;
  }
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

export type ProCheckoutGrant = {
  email: string;
  sessionId: string;
  subscriptionId: string;
  amountTotal: number | null;
  currency: string | null;
};

export type ProSubscriptionSync = {
  subscriptionId: string;
  email: string;
  amountTotal: number | null;
  currency: string | null;
  /** True when this payload itself says the subscription is Advantage Pro. */
  productKnown: boolean;
  entitled: boolean;
  /** Why this event is syncing. The handler re-reads Stripe and does not trust this flag alone. */
  billingEvent: BillingEventKind;
  /** Price ids copied off the event. The handler prefers the fetched subscription. */
  priceIds: string[];
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
};

export type OneTimeRevocation = {
  paymentIntentId: string;
  sessionId: string;
  /** Full refund or a dispute closed as lost. Partial refunds and open disputes are false. */
  revoke: boolean;
  reason: 'refund' | 'dispute';
};

export type StripeEntitlementDecision =
  | { action: 'record'; purchase: CheckoutPurchase }
  | { action: 'record-student'; purchase: CheckoutPurchase }
  | { action: 'record-coach'; purchase: CheckoutPurchase }
  | { action: 'grant-pro'; grant: ProCheckoutGrant }
  | { action: 'sync-pro'; sync: ProSubscriptionSync }
  | { action: 'revoke-onetime'; revocation: OneTimeRevocation }
  | { action: 'retry' }
  | { action: 'ignore' }
  | { action: 'invalid' };

/**
 * Event classification before the handler re-reads Stripe.
 * past_due stays in this set so a failure is not dropped. Grace and the day-8
 * lock are applied from past_due_since after the fresh subscription is stored.
 * paused, unpaid, canceled, and incomplete are not entitled.
 */
const ENTITLED_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const REVOKED_SUBSCRIPTION_STATUSES = new Set(['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused']);

function readMetaProduct(row: Record<string, unknown>): string {
  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && typeof (metadata as { product?: unknown }).product === 'string') {
    return (metadata as { product: string }).product;
  }
  return '';
}

function subscriptionIdValue(value: unknown): string {
  if (typeof value === 'string' && value.startsWith('sub_')) return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    const id = (value as { id: string }).id;
    if (id.startsWith('sub_')) return id;
  }
  return '';
}

/** Checkout sessions, legacy invoices, and 2025+ invoice.parent shapes. */
function readSubscriptionId(row: Record<string, unknown>): string {
  const direct = subscriptionIdValue(row.subscription);
  if (direct) return direct;
  const parent = row.parent;
  if (parent && typeof parent === 'object') {
    const details = (parent as { subscription_details?: unknown }).subscription_details;
    if (details && typeof details === 'object') {
      const fromParent = subscriptionIdValue((details as { subscription?: unknown }).subscription);
      if (fromParent) return fromParent;
    }
  }
  const lines = row.lines;
  if (lines && typeof lines === 'object' && Array.isArray((lines as { data?: unknown }).data)) {
    for (const line of (lines as { data: unknown[] }).data) {
      if (!line || typeof line !== 'object') continue;
      const lineRow = line as Record<string, unknown>;
      const fromLine = subscriptionIdValue(lineRow.subscription);
      if (fromLine) return fromLine;
      const lineParent = lineRow.parent;
      if (lineParent && typeof lineParent === 'object') {
        const item = (lineParent as { subscription_item_details?: unknown }).subscription_item_details;
        if (item && typeof item === 'object') {
          const fromItem = subscriptionIdValue((item as { subscription?: unknown }).subscription);
          if (fromItem) return fromItem;
        }
      }
    }
  }
  return '';
}

function invoiceProduct(row: Record<string, unknown>): string {
  const direct = readMetaProduct(row);
  if (direct) return direct;
  const parents = [row.parent, row.subscription_details];
  for (const parent of parents) {
    if (!parent || typeof parent !== 'object') continue;
    const details =
      parent === row.subscription_details
        ? parent
        : (parent as { subscription_details?: unknown }).subscription_details;
    if (details && typeof details === 'object') {
      const product = readMetaProduct(details as Record<string, unknown>);
      if (product) return product;
    }
  }
  const lines = row.lines;
  if (lines && typeof lines === 'object' && Array.isArray((lines as { data?: unknown }).data)) {
    for (const line of (lines as { data: unknown[] }).data) {
      if (!line || typeof line !== 'object') continue;
      const product = readMetaProduct(line as Record<string, unknown>);
      if (product) return product;
    }
  }
  return '';
}

function eventObject(event: object): Record<string, unknown> | 'invalid' {
  const data = (event as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return 'invalid';
  const object = (data as { object?: unknown }).object;
  if (!object || typeof object !== 'object') return 'invalid';
  return object as Record<string, unknown>;
}

function money(row: Record<string, unknown>, key: string): number | null {
  return typeof row[key] === 'number' ? (row[key] as number) : null;
}

function currencyOf(row: Record<string, unknown>): string | null {
  return typeof row.currency === 'string' ? row.currency : null;
}

function checkoutDecision(row: Record<string, unknown>): StripeEntitlementDecision {
  if (row.object !== 'checkout.session') return { action: 'invalid' };
  const product = readMetaProduct(row);
  const paid = row.payment_status === 'paid' || row.payment_status === 'no_payment_required';
  if (row.mode === 'payment') {
    if (product !== API_PRODUCT_ID && product !== API_PRODUCT_STUDENT && product !== API_PRODUCT_COACH) {
      return { action: 'ignore' };
    }
    if (!paid) return { action: 'ignore' };
    if (typeof row.id !== 'string' || !row.id.startsWith('cs_')) return { action: 'invalid' };
    const purchase: CheckoutPurchase = {
      email: readEmail(row),
      sessionId: row.id,
      amountTotal: money(row, 'amount_total'),
      currency: currencyOf(row),
    };
    if (product === API_PRODUCT_STUDENT) return { action: 'record-student', purchase };
    if (product === API_PRODUCT_COACH) return { action: 'record-coach', purchase };
    return { action: 'record', purchase };
  }
  if (row.mode === 'subscription' && product === API_PRODUCT_PRO) {
    if (!paid) return { action: 'ignore' };
    if (typeof row.id !== 'string' || !row.id.startsWith('cs_')) return { action: 'invalid' };
    const subscriptionId = readSubscriptionId(row);
    if (!subscriptionId) return { action: 'retry' };
    return {
      action: 'grant-pro',
      grant: {
        email: readEmail(row),
        sessionId: row.id,
        subscriptionId,
        amountTotal: money(row, 'amount_total'),
        currency: currencyOf(row),
      },
    };
  }
  return { action: 'ignore' };
}

function billingFields(row: Record<string, unknown>): Pick<ProSubscriptionSync, 'priceIds' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'> {
  return {
    priceIds: readPriceIds(row),
    cancelAtPeriodEnd: row.cancel_at_period_end === true,
    currentPeriodEnd: readCurrentPeriodEnd(row),
  };
}

function invoiceDecision(row: Record<string, unknown>, kind: 'paid' | 'failed'): StripeEntitlementDecision {
  if (row.object !== 'invoice') return { action: 'invalid' };
  const subscriptionId = readSubscriptionId(row);
  if (!subscriptionId) return { action: 'ignore' };
  const product = invoiceProduct(row);
  if (product && product !== API_PRODUCT_PRO) return { action: 'ignore' };
  return {
    action: 'sync-pro',
    sync: {
      subscriptionId,
      email: readEmail(row),
      amountTotal: money(row, kind === 'paid' ? 'amount_paid' : 'amount_due'),
      currency: currencyOf(row),
      productKnown: product === API_PRODUCT_PRO,
      entitled: true,
      billingEvent: kind,
      ...billingFields(row),
    },
  };
}

function subscriptionDecision(row: Record<string, unknown>, kind: 'deleted' | 'upsert'): StripeEntitlementDecision {
  if (row.object !== 'subscription') return { action: 'invalid' };
  const subscriptionId = typeof row.id === 'string' && row.id.startsWith('sub_') ? row.id : '';
  if (!subscriptionId) return { action: 'invalid' };
  const product = readMetaProduct(row);
  if (product && product !== API_PRODUCT_PRO) return { action: 'ignore' };
  if (kind === 'upsert') {
    const status = typeof row.status === 'string' ? row.status : '';
    if (!ENTITLED_SUBSCRIPTION_STATUSES.has(status) && !REVOKED_SUBSCRIPTION_STATUSES.has(status)) {
      return { action: 'ignore' };
    }
    return {
      action: 'sync-pro',
      sync: {
        subscriptionId,
        email: '',
        amountTotal: null,
        currency: null,
        productKnown: product === API_PRODUCT_PRO,
        entitled: ENTITLED_SUBSCRIPTION_STATUSES.has(status),
        billingEvent: 'upsert',
        ...billingFields(row),
      },
    };
  }
  return {
    action: 'sync-pro',
    sync: {
      subscriptionId,
      email: '',
      amountTotal: null,
      currency: null,
      productKnown: product === API_PRODUCT_PRO,
      entitled: false,
      billingEvent: 'deleted',
      ...billingFields(row),
    },
  };
}

function stringId(value: unknown, prefix: string): string {
  if (typeof value === 'string' && value.startsWith(prefix)) return value;
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    const id = (value as { id: string }).id;
    if (id.startsWith(prefix)) return id;
  }
  return '';
}

function chargeDecision(row: Record<string, unknown>, type: string): StripeEntitlementDecision {
  const paymentIntentId = stringId(row.payment_intent, 'pi_');
  const metadata = row.metadata;
  const sessionFromMeta =
    metadata && typeof metadata === 'object' && typeof (metadata as { session_id?: unknown }).session_id === 'string'
      ? (metadata as { session_id: string }).session_id
      : '';
  const sessionId = sessionFromMeta.startsWith('cs_') ? sessionFromMeta : '';
  if (type === 'charge.refunded') {
    if (row.object !== 'charge') return { action: 'invalid' };
    const amount = typeof row.amount === 'number' ? row.amount : 0;
    const refundedAmount = typeof row.amount_refunded === 'number' ? row.amount_refunded : 0;
    const full = row.refunded === true || (amount > 0 && refundedAmount >= amount);
    return {
      action: 'revoke-onetime',
      revocation: { paymentIntentId, sessionId, revoke: full, reason: 'refund' },
    };
  }
  if (row.object !== 'dispute') return { action: 'invalid' };
  const status = typeof row.status === 'string' ? row.status : '';
  return {
    action: 'revoke-onetime',
    revocation: {
      paymentIntentId,
      sessionId,
      revoke: type === 'charge.dispute.closed' && status === 'lost',
      reason: 'dispute',
    },
  };
}

export function purchaseFromStripeEvent(event: unknown): StripeEntitlementDecision {
  if (!event || typeof event !== 'object') return { action: 'invalid' };
  const type = (event as { type?: unknown }).type;
  if (typeof type !== 'string') return { action: 'invalid' };
  if (
    type !== 'checkout.session.completed' &&
    type !== 'checkout.session.async_payment_succeeded' &&
    type !== 'invoice.paid' &&
    type !== 'invoice.payment_succeeded' &&
    type !== 'invoice.payment_failed' &&
    type !== 'customer.subscription.created' &&
    type !== 'customer.subscription.updated' &&
    type !== 'customer.subscription.deleted' &&
    type !== 'charge.refunded' &&
    type !== 'charge.dispute.created' &&
    type !== 'charge.dispute.closed'
  ) {
    return { action: 'ignore' };
  }
  const row = eventObject(event);
  if (row === 'invalid') return { action: 'invalid' };
  if (type === 'checkout.session.completed' || type === 'checkout.session.async_payment_succeeded') {
    return checkoutDecision(row);
  }
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') return invoiceDecision(row, 'paid');
  if (type === 'invoice.payment_failed') return invoiceDecision(row, 'failed');
  if (type === 'charge.refunded' || type === 'charge.dispute.created' || type === 'charge.dispute.closed') {
    return chargeDecision(row, type);
  }
  if (type === 'customer.subscription.deleted') return subscriptionDecision(row, 'deleted');
  return subscriptionDecision(row, 'upsert');
}
