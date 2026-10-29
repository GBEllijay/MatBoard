import type { D1Database } from './d1.ts';

export async function lookupCheckoutSessionId(
  secret: string,
  paymentIntentId: string,
  fetchImpl: typeof fetch,
): Promise<string | 'error' | null> {
  if (!paymentIntentId.startsWith('pi_')) return null;
  let response: Response;
  try {
    const url = `https://api.stripe.com/v1/checkout/sessions?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=1`;
    response = await fetchImpl(url, { headers: { Authorization: `Bearer ${secret}` } });
  } catch {
    return 'error';
  }
  if (!response.ok) return 'error';
  try {
    const body = (await response.json()) as { data?: { id?: string }[] };
    const id = body.data?.[0]?.id ?? '';
    return id.startsWith('cs_') ? id : null;
  } catch {
    return 'error';
  }
}

/** Revoke a one-time grant. Subscription grants are left alone. */
export async function revokeOneTimePurchase(
  db: D1Database,
  sessionId: string,
  reason: string,
  now: Date,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE grants SET status = 'inactive', revoked_at = COALESCE(revoked_at, ?), reason = ?
       WHERE source = 'stripe_payment' AND source_ref = ? AND revoked_at IS NULL`,
    )
    .bind(now.toISOString(), reason, sessionId)
    .run();
  return result.meta.changes;
}
