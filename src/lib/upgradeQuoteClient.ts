/**
 * Browser side of upgrade credit. The server (`/api/upgrade-quote`) owns the math;
 * this only asks for a quote and turns it into button text.
 */
import type { CheckoutProduct } from './checkoutProducts.ts';
import { formatUsdFromCents } from './whitePurchase.ts';

export const UPGRADE_QUOTE_API = '/api/upgrade-quote';

export type UpgradeQuoteResult =
  | { kind: 'quote'; listPriceCents: number; upgradePriceCents: number; creditApplied: number }
  | { kind: 'owned'; message: string }
  | { kind: 'error'; message: string };

export type UpgradeTier = Exclude<CheckoutProduct, 'white'>;

export async function requestUpgradeQuote(
  input: { tier: UpgradeTier; email: string; halfOff: boolean },
  fetchImpl: typeof fetch = fetch,
): Promise<UpgradeQuoteResult> {
  try {
    const response = await fetchImpl(UPGRADE_QUOTE_API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tier: input.tier, email: input.email.trim(), halfOff: input.halfOff }),
    });
    const body = (await response.json()) as {
      ok?: boolean;
      owned?: boolean;
      message?: string;
      error?: string;
      listPriceCents?: number;
      upgradePriceCents?: number;
      creditApplied?: number;
    };
    if (body.owned) return { kind: 'owned', message: body.message || body.error || 'You already own this edition.' };
    if (
      !response.ok ||
      typeof body.listPriceCents !== 'number' ||
      typeof body.upgradePriceCents !== 'number' ||
      typeof body.creditApplied !== 'number'
    ) {
      return { kind: 'error', message: body.error || 'Could not check upgrade pricing.' };
    }
    return {
      kind: 'quote',
      listPriceCents: body.listPriceCents,
      upgradePriceCents: body.upgradePriceCents,
      creditApplied: body.creditApplied,
    };
  } catch {
    return { kind: 'error', message: 'Could not check upgrade pricing. Check your connection and try again.' };
  }
}

/** "Upgrade for $X" when a credit applies; otherwise null so the page keeps its normal label. */
export function upgradeButtonPrice(quote: UpgradeQuoteResult | null): string | null {
  if (!quote || quote.kind !== 'quote' || quote.creditApplied <= 0) return null;
  return formatUsdFromCents(quote.upgradePriceCents);
}

export function upgradeQuoteNote(quote: UpgradeQuoteResult | null): string | null {
  if (!quote) return null;
  if (quote.kind === 'owned' || quote.kind === 'error') return quote.message;
  if (quote.creditApplied <= 0) return 'No earlier purchase found for that email. Full price applies.';
  return `Upgrade for ${formatUsdFromCents(quote.upgradePriceCents)}: ${formatUsdFromCents(
    quote.creditApplied,
  )} credit from your earlier purchase.`;
}
