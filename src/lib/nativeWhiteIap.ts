/**
 * Planned StoreKit 2 / Capacitor bridge for Advantage White on iOS.
 *
 * This is a stub only. It must not talk to App Store Connect, StoreKit,
 * Stripe, `/api/checkout`, or `/api/restore/request`.
 *
 * TODO(native-iap): implement a Capacitor plugin that wraps StoreKit 2.
 * Owner-approved product (voice, 7:08 PM EST, 22 Nov 2026):
 *   - Free download. The round timer is always free.
 *   - 1 free scoreboard match and 1 free mock tournament, then a $15.99
 *     one-time non-consumable IAP unlocks everything in White only
 *     (scoreboard, brackets, Bracket Roster, and all skins).
 *   - Restore Purchases is required (Apple 3.1.1).
 *   - No license keys.
 *   - US-storefront web-edition links and buttons are allowed only when
 *     `Storefront.current.countryCode == "USA"` (Apple 3.1.1(a)). Hide
 *     those links on every other storefront.
 *
 * The App Store Connect product id is registered later. The constant below
 * is a placeholder spelling, not a live product.
 */
export const WHITE_IAP_PLACEHOLDER_PRODUCT_ID = 'com.advantagebjjtimer.white.unlock';

export const WHITE_IAP_PRICE_LABEL = '$15.99';

export const WHITE_IAP_PRODUCT_TYPE = 'non-consumable' as const;

/** Apple Storefront country code for the United States. */
export const US_STOREFRONT_COUNTRY_CODE = 'USA';

export type NativeIapPurchaseResult = { ok: true } | { ok: false; error: string };

export type NativeIapRestoreResult =
  | { ok: true; unlocked: boolean }
  | { ok: false; error: string };

/**
 * Native bridge the iOS app will call once StoreKit is wired.
 * Keep web checkout out of this interface.
 */
export type NativeWhiteIapBridge = {
  purchaseWhiteUnlock(): Promise<NativeIapPurchaseResult>;
  restoreWhitePurchases(): Promise<NativeIapRestoreResult>;
  /** `Storefront.current.countryCode` once the plugin exists. */
  currentStorefrontCountryCode(): Promise<string | null>;
};

export function isUsStorefrontCountryCode(code: string | null | undefined): boolean {
  return code === US_STOREFRONT_COUNTRY_CODE;
}

/** True only when the native storefront reports the US. Used to gate web-edition links. */
export async function isUsStorefront(bridge: NativeWhiteIapBridge): Promise<boolean> {
  const code = await bridge.currentStorefrontCountryCode();
  return isUsStorefrontCountryCode(code);
}

const NOT_WIRED = 'In-app purchase is not wired yet.';

/** No-op stub. UI can call this today; it never charges or unlocks. */
export const nativeWhiteIapStub: NativeWhiteIapBridge = {
  async purchaseWhiteUnlock() {
    return { ok: false, error: NOT_WIRED };
  },
  async restoreWhitePurchases() {
    return { ok: false, error: NOT_WIRED };
  },
  async currentStorefrontCountryCode() {
    return null;
  },
};
