import { allowAttempt, clientIp, rateBucket, rateLimitedResponse, CONFIRM_LIMIT } from './rateLimit.ts';
import { stripeErrorMessage, type StripeRuntimeEnv } from './stripeCheckout.ts';

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const SESSION_ID = /^cs_[A-Za-z0-9_]+$/;

const PRODUCT_GRANTS: Record<string, string[]> = {
  'advantage-white': ['white'],
  'advantage-student': ['student'],
  'advantage-coach': ['coach'],
  'advantage-pro': ['pro', 'student'],
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

const UNCONFIRMED = { ok: false, entitled: false, error: "That payment isn't confirmed." };

function unconfirmed(): Response {
  return json(400, UNCONFIRMED);
}

type StripeSession = {
  id?: string;
  payment_status?: string;
  status?: string;
  mode?: string;
  metadata?: { product?: string };
};

async function retrieveSession(secret: string, sessionId: string, fetchImpl: typeof fetch): Promise<StripeSession | null> {
  const response = await fetchImpl(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
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

/**
 * A checkout return grants access only after Stripe says this session is paid
 * for a known product. The response does not include the email or session id.
 */
export async function handleCheckoutConfirm(
  request: Request,
  env: StripeRuntimeEnv & { CODE_HASH_PEPPER?: string },
  fetchImpl: typeof fetch = fetch,
  kv: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<unknown> } | null = null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  const bucket = await rateBucket('confirm', clientIp(request), pepper);
  if (!(await allowAttempt(bucket, CONFIRM_LIMIT, now().getTime(), kv))) return rateLimitedResponse();

  const secret = env.STRIPE_SECRET_KEY?.trim() ?? '';
  if (!secret) {
    return json(503, {
      ok: false,
      entitled: false,
      error: 'Payments are not set up yet. Set STRIPE_SECRET_KEY before confirming a checkout.',
    });
  }

  const raw = await request.text();
  if (raw.length > 4_000) return unconfirmed();
  let body: unknown = {};
  try {
    body = raw.trim() ? (JSON.parse(raw) as unknown) : {};
  } catch {
    return unconfirmed();
  }
  const sessionId = body && typeof body === 'object' ? (body as { sessionId?: unknown }).sessionId : undefined;
  if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return unconfirmed();

  let session: StripeSession | null;
  try {
    session = await retrieveSession(secret, sessionId, fetchImpl);
  } catch {
    return json(502, { ok: false, entitled: false, error: 'Stripe could not be reached. Nothing was unlocked.' });
  }
  if (!session) return unconfirmed();
  const paid = session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  const product = session.metadata?.product ?? '';
  const grants = PRODUCT_GRANTS[product];
  if (!paid || !grants || session.status === 'expired') return unconfirmed();
  return json(200, { ok: true, entitled: true, product, grants, source: 'stripe' });
}
