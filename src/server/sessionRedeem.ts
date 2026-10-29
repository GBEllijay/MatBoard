import { readPublicJwk } from '../lib/deviceProof.ts';
import { sha256Hex, thumbprintJwk, type Door } from '../lib/entitlementToken.ts';
import { allowAttempt, clientIp, rateBucket, rateLimitedResponse, CONFIRM_LIMIT } from './rateLimit.ts';
import type { D1Database } from './d1.ts';
import { expandGrants, tierForGrants } from './grantMatrix.ts';
import { grantsForProduct } from './grantMatrix.ts';
import {
  countActiveDevices,
  emailHint,
  recordPurchase,
  touchDevice,
  type PurchaseSource,
} from './purchaseRecords.ts';
import { DEVICE_ACTIVE_DAYS, PRO_DEVICES_PER_LICENSE } from './paywallDecisions.ts';
import { API_PRODUCT_PRO } from './routes.ts';
import { stripeErrorMessage, type StripeRuntimeEnv } from './stripeCheckout.ts';
import { issueToken } from './tokenIssue.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const SESSION_ID = /^cs_[A-Za-z0-9_]+$/;
const UNCONFIRMED = { ok: false, entitled: false, error: "That payment isn't confirmed." };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

type StripeSession = {
  id?: string;
  payment_status?: string;
  status?: string;
  mode?: string;
  client_reference_id?: string | null;
  customer?: string | { id?: string };
  customer_details?: { email?: string };
  customer_email?: string;
  metadata?: { product?: string };
  subscription?: string | { id?: string };
};

function customerId(session: StripeSession): string {
  if (typeof session.customer === 'string') return session.customer;
  if (session.customer && typeof session.customer.id === 'string') return session.customer.id;
  return '';
}

function subscriptionId(session: StripeSession): string {
  if (typeof session.subscription === 'string') return session.subscription;
  if (session.subscription && typeof session.subscription.id === 'string') return session.subscription.id;
  return '';
}

function emailOf(session: StripeSession): string {
  if (typeof session.customer_details?.email === 'string') return session.customer_details.email;
  if (typeof session.customer_email === 'string') return session.customer_email;
  return '';
}

async function retrieveSession(secret: string, sessionId: string, fetchImpl: typeof fetch): Promise<StripeSession | null> {
  const response = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (response.status === 404) return null;
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(stripeErrorMessage(response.status, text));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return JSON.parse(text) as StripeSession;
}

export type RedeemEnv = StripeRuntimeEnv & {
  CODE_HASH_PEPPER?: string;
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

/**
 * Checkout return. The session id in the URL is not enough. The browser must
 * present the nonce it kept, and Stripe must show that session paid.
 */
export async function handleSessionRedeem(
  request: Request,
  env: RedeemEnv,
  db: D1Database | null,
  fetchImpl: typeof fetch = fetch,
  kv: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<unknown> } | null = null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const bucket = await rateBucket('redeem-session', clientIp(request), pepper);
  if (!(await allowAttempt(bucket, CONFIRM_LIMIT, now().getTime(), kv))) return rateLimitedResponse();
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!secret) {
    return json(503, { ok: false, entitled: false, error: 'Payments are not set up yet. Set STRIPE_SECRET_KEY.' });
  }
  const raw = await request.text();
  if (raw.length > 12_000) return json(400, UNCONFIRMED);
  let body: { sessionId?: unknown; nonce?: unknown; deviceId?: unknown; publicJwk?: unknown } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(400, UNCONFIRMED);
  }
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const nonce = typeof body.nonce === 'string' ? body.nonce.trim() : '';
  if (!SESSION_ID.test(sessionId) || nonce.length < 16 || nonce.length > 200) return json(400, UNCONFIRMED);
  let session: StripeSession | null;
  try {
    session = await retrieveSession(secret, sessionId, fetchImpl);
  } catch {
    return json(502, { ok: false, entitled: false, error: 'Stripe could not be reached. Nothing was unlocked.' });
  }
  if (!session) return json(400, UNCONFIRMED);
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  const product = session.metadata?.product ?? '';
  const grants = grantsForProduct(product);
  if (!paid || grants.length === 0 || session.status === 'expired') return json(400, UNCONFIRMED);
  const nonceHash = await sha256Hex(nonce);
  if (!session.client_reference_id || session.client_reference_id !== nonceHash) return json(400, UNCONFIRMED);

  const stamp = now();
  const source: PurchaseSource = product === API_PRODUCT_PRO ? 'stripe_subscription' : 'stripe_payment';
  let licenseId: string = crypto.randomUUID();
  if (db) {
    const recorded = await recordPurchase(db, {
      email: emailOf(session),
      product,
      source,
      sourceRef: sessionId,
      sessionId,
      subscriptionId: subscriptionId(session) || undefined,
      stripeCustomerId: customerId(session) || undefined,
      pepper,
      now: stamp,
      status: 'active',
    });
    licenseId = recorded.licenseId;
  }
  const deviceId = typeof body.deviceId === 'string' && body.deviceId.trim() ? body.deviceId.trim().slice(0, 80) : crypto.randomUUID();
  const publicJwk = readPublicJwk(body.publicJwk);
  const thumbprint = publicJwk ? await thumbprintJwk(publicJwk) : undefined;
  let deviceWarning: string | undefined;
  if (db && grants.includes('pro')) {
    const touch = await touchDevice(db, { licenseId, deviceId, thumbprint: thumbprint ?? null, now: stamp });
    if (!touch.known) {
      const active = await countActiveDevices(db, licenseId, stamp, DEVICE_ACTIVE_DAYS);
      if (active > PRO_DEVICES_PER_LICENSE) {
        deviceWarning = 'This Pro license is already on several devices. You can sign out the others from Restore.';
      }
    }
  } else if (db) {
    await touchDevice(db, { licenseId, deviceId, thumbprint: thumbprint ?? null, now: stamp });
  }
  const doors = expandGrants(grants) as Door[];
  const hint = await emailHint(emailOf(session), pepper);
  const token = await issueToken(
    env.ENTITLEMENT_SIGNING_KEY,
    {
      licenseId,
      grants: doors,
      tier: tierForGrants(doors, 'stripe'),
      src: 'stripe',
      deviceId,
      now: stamp,
      kind: product === API_PRODUCT_PRO ? 'pro' : 'onetime',
      emailHint: hint,
      thumbprint,
      subs: product === API_PRODUCT_PRO ? { state: 'active' } : undefined,
    },
    env.ENTITLEMENT_KEY_ID,
  );
  const response: Record<string, unknown> = {
    ok: true,
    entitled: true,
    product,
    grants: doors,
    deviceId,
    source: 'stripe',
  };
  if (token) response.token = token;
  else {
    response.degraded = true;
    response.warning = 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY. This device can still open during the amnesty window.';
  }
  if (deviceWarning) response.deviceWarning = deviceWarning;
  return json(200, response);
}
