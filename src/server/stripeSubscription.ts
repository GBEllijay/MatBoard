/**
 * Stripe subscription as this app stores it.
 * No Stripe-Version header is sent, so the body matches the account's pinned API version.
 * `current_period_end` lived on the subscription before 2025-03-31 (basil) and on
 * each subscription item after that. Whichever the response includes is the one we store.
 */
export type StripeSubscriptionSnapshot = {
  id: string;
  status: string;
  customerId: string;
  cancelAtPeriodEnd: boolean;
  /** ISO-8601, or null when Stripe did not send a period end. */
  currentPeriodEnd: string | null;
  priceIds: string[];
  metadataProduct: string;
};

function unixSeconds(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function isoFromUnix(value: unknown): string | null {
  const seconds = unixSeconds(value);
  if (seconds === null) return null;
  return new Date(seconds * 1000).toISOString();
}

function pushPrice(ids: Set<string>, value: unknown): void {
  if (typeof value === 'string' && value.startsWith('price_')) ids.add(value);
  if (value && typeof value === 'object' && typeof (value as { id?: unknown }).id === 'string') {
    const id = (value as { id: string }).id;
    if (id.startsWith('price_')) ids.add(id);
  }
}

/** Price ids from a subscription or an invoice, including basil and later shapes. */
export function readPriceIds(row: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const items = row.items;
  if (items && typeof items === 'object' && Array.isArray((items as { data?: unknown }).data)) {
    for (const item of (items as { data: unknown[] }).data) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      pushPrice(ids, record.price);
      pushPrice(ids, record.plan);
      const pricing = record.pricing;
      if (pricing && typeof pricing === 'object') {
        const details = (pricing as { price_details?: unknown }).price_details;
        if (details && typeof details === 'object') pushPrice(ids, (details as { price?: unknown }).price);
      }
    }
  }
  const lines = row.lines;
  if (lines && typeof lines === 'object' && Array.isArray((lines as { data?: unknown }).data)) {
    for (const line of (lines as { data: unknown[] }).data) {
      if (!line || typeof line !== 'object') continue;
      const record = line as Record<string, unknown>;
      pushPrice(ids, record.price);
      const pricing = record.pricing;
      if (pricing && typeof pricing === 'object') {
        const details = (pricing as { price_details?: unknown }).price_details;
        if (details && typeof details === 'object') pushPrice(ids, (details as { price?: unknown }).price);
      }
    }
  }
  return [...ids];
}

/**
 * Period end for the pinned Stripe API version.
 * Prefer the subscription field when the response still has it.
 * Otherwise use the latest item `current_period_end` (basil and newer).
 */
export function readCurrentPeriodEnd(row: Record<string, unknown>): string | null {
  const top = isoFromUnix(row.current_period_end);
  if (top) return top;
  const items = row.items;
  if (!items || typeof items !== 'object' || !Array.isArray((items as { data?: unknown }).data)) {
    return isoFromUnix(row.cancel_at);
  }
  let latest = 0;
  for (const item of (items as { data: unknown[] }).data) {
    if (!item || typeof item !== 'object') continue;
    const seconds = unixSeconds((item as { current_period_end?: unknown }).current_period_end);
    if (seconds !== null && seconds > latest) latest = seconds;
  }
  if (latest > 0) return new Date(latest * 1000).toISOString();
  return isoFromUnix(row.cancel_at);
}

function customerId(row: Record<string, unknown>): string {
  const customer = row.customer;
  if (typeof customer === 'string' && customer.startsWith('cus_')) return customer;
  if (customer && typeof customer === 'object' && typeof (customer as { id?: unknown }).id === 'string') {
    const id = (customer as { id: string }).id;
    if (id.startsWith('cus_')) return id;
  }
  return '';
}

function metadataProduct(row: Record<string, unknown>): string {
  const metadata = row.metadata;
  if (metadata && typeof metadata === 'object' && typeof (metadata as { product?: unknown }).product === 'string') {
    return (metadata as { product: string }).product;
  }
  return '';
}

export function parseStripeSubscription(row: Record<string, unknown>): StripeSubscriptionSnapshot | null {
  const id = typeof row.id === 'string' && row.id.startsWith('sub_') ? row.id : '';
  if (!id) return null;
  const status = typeof row.status === 'string' ? row.status : '';
  const cancelAt = unixSeconds(row.cancel_at);
  return {
    id,
    status,
    customerId: customerId(row),
    cancelAtPeriodEnd: row.cancel_at_period_end === true || cancelAt !== null,
    currentPeriodEnd: readCurrentPeriodEnd(row),
    priceIds: readPriceIds(row),
    metadataProduct: metadataProduct(row),
  };
}

export function canceledSnapshot(subscriptionId: string): StripeSubscriptionSnapshot {
  return {
    id: subscriptionId,
    status: 'canceled',
    customerId: '',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    priceIds: [],
    metadataProduct: '',
  };
}

export async function fetchStripeSubscription(
  secret: string,
  subscriptionId: string,
  fetchImpl: typeof fetch,
): Promise<StripeSubscriptionSnapshot | 'missing' | 'error'> {
  let response: Response;
  try {
    response = await fetchImpl(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
  } catch {
    return 'error';
  }
  if (response.status === 404) return 'missing';
  const text = await response.text();
  if (!response.ok) return 'error';
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') return 'error';
    return parseStripeSubscription(parsed as Record<string, unknown>) ?? 'error';
  } catch {
    return 'error';
  }
}
