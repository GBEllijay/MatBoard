import { verifyToken } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { stripeErrorMessage, type StripeRuntimeEnv } from './stripeCheckout.ts';
import { signingMaterial } from './tokenIssue.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export type PortalEnv = StripeRuntimeEnv & {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

/**
 * Stripe Customer Portal for the Pro subscriber on this token.
 * A seat token is rejected. The portal is where the card is updated.
 */
export async function handleBillingPortal(
  request: Request,
  env: PortalEnv,
  db: D1Database | null,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) {
    return json(503, { ok: false, error: 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.' });
  }
  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!secret) return json(503, { ok: false, error: 'Payments are not set up yet. Set STRIPE_SECRET_KEY.' });
  if (!db) return json(503, { ok: false, error: 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.' });
  const raw = await request.text();
  if (raw.length > 8_000) return json(400, { ok: false, error: 'This device needs to restore access.' });
  let body: { token?: unknown; returnUrl?: unknown } = {};
  try {
    body = JSON.parse(raw) as typeof body;
  } catch {
    return json(400, { ok: false, error: 'This device needs to restore access.' });
  }
  if (typeof body.token !== 'string') return json(400, { ok: false, error: 'This device needs to restore access.' });
  const claims = await verifyToken(body.token, [{ kid: material.kid, jwk: material.publicJwk }]);
  if (!claims) return json(400, { ok: false, error: 'This device needs to restore access.' });
  if (claims.src === 'seat' || claims.tier === 'seat') {
    return json(403, { ok: false, error: 'Ask your gym owner to check billing.' });
  }
  const pro = claims.grants.includes('pro') || claims.subs?.state === 'grace' || claims.subs?.state === 'locked' || claims.subs?.state === 'active';
  if (!pro) return json(403, { ok: false, error: 'Billing is available for Advantage Pro.' });
  const identity = await db
    .prepare(
      `SELECT stripe_customer_id AS customerId FROM identities
       WHERE license_id = ? AND stripe_customer_id IS NOT NULL AND stripe_customer_id <> '' LIMIT 1`,
    )
    .bind(claims.sub)
    .first<{ customerId: string }>();
  if (!identity?.customerId) {
    return json(409, { ok: false, error: 'No billing profile is stored for this device yet. Restore the purchase, then try again.' });
  }
  let returnUrl = new URL(request.url).origin + '/pro/paused';
  if (typeof body.returnUrl === 'string') {
    try {
      const candidate = new URL(body.returnUrl);
      if (candidate.origin === new URL(request.url).origin) returnUrl = candidate.toString();
    } catch {
      /* keep the default */
    }
  }
  const params = new URLSearchParams();
  params.set('customer', identity.customerId);
  params.set('return_url', returnUrl);
  let response: Response;
  try {
    response = await fetchImpl('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
  } catch {
    return json(502, { ok: false, error: 'Stripe could not be reached.' });
  }
  const text = await response.text();
  if (!response.ok) return json(502, { ok: false, error: stripeErrorMessage(response.status, text) });
  let url = '';
  try {
    url = ((JSON.parse(text) as { url?: string }).url ?? '').trim();
  } catch {
    url = '';
  }
  if (!url.startsWith('https://billing.stripe.com/') && !url.startsWith('https://billing.stripe.com')) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('stripe.com')) {
        return json(502, { ok: false, error: 'Stripe did not return a billing link.' });
      }
    } catch {
      return json(502, { ok: false, error: 'Stripe did not return a billing link.' });
    }
  }
  return json(200, { ok: true, url });
}
