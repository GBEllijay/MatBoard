/** Must match the server product metadata for Advantage Pro (`API_PRODUCT_PRO`). */
export const PRO_PRODUCT_ID = 'advantage-pro';

/** A paid Pro subscription unlocks Pro. A White purchase or a canceled Pro subscription does not. */
export function proPurchaseEntitled(status: { entitled?: boolean; product?: string }): boolean {
  return status.entitled === true && status.product === PRO_PRODUCT_ID;
}

/**
 * `true` unlocks this device, `false` locks it, `null` leaves the current flag.
 * A missing record stays null so a slow webhook does not clear an alpha unlock.
 */
export function proDeviceUnlock(status: { entitled?: boolean; product?: string }): boolean | null {
  if (proPurchaseEntitled(status)) return true;
  if (status.product === PRO_PRODUCT_ID) return false;
  return null;
}

/**
 * Stripe's Pro success return. This is the only `/buy/pro` URL that renders
 * before the alpha door is open, so the webhook can unlock this device.
 */
export function proPurchaseReturn(search: URLSearchParams): boolean {
  const sessionId = search.get('session_id')?.trim() ?? '';
  return search.get('checkout') === 'success' && sessionId.length > 0;
}
