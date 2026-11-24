import { useEffect, useState } from 'react';
import { readWhitePublicPricing, whitePublicPricing, type WhitePublicPricing } from '../lib/whiteLaunchPricing';

/**
 * Live White price from GET /api/config. Falls back to the standard $19.99
 * list so a failed fetch never advertises the launch price by mistake.
 */
export function useWhitePublicPricing(): WhitePublicPricing {
  const [pricing, setPricing] = useState<WhitePublicPricing>(() => whitePublicPricing(null));

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/config', { headers: { accept: 'application/json' }, signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: unknown) => {
        if (!body || typeof body !== 'object' || Array.isArray(body)) return;
        const parsed = readWhitePublicPricing((body as { whitePricing?: unknown }).whitePricing);
        if (parsed) setPricing(parsed);
      })
      .catch(() => {
        /* Keep the standard $19.99 fallback. */
      });
    return () => controller.abort();
  }, []);

  return pricing;
}
