/**
 * Shareable half-off link. The only code this path honors is MEIA.
 * Visitors cannot substitute another code through the query string or the
 * checkout flag. Stripe promotion code id (live): promo_1UUSYNARhGonKqrOgkxlh3wo.
 * Checkout looks the code up. It does not trust a client-supplied id.
 */

export const HALF_OFF_CODE = 'MEIA';

/** Live Stripe promotion code id for MEIA. Lookup still has to return an active code. */
export const HALF_OFF_PROMOTION_CODE_ID = 'promo_1UUSYNARhGonKqrOgkxlh3wo';

export const HALF_OFF_PATH = '/half-off';

export const HALF_OFF_QUERY_KEY = 'promo';

export const HALF_OFF_STORAGE_KEY = 'advantage-half-off';

export const HALF_OFF_NOTE = 'Half off code MEIA applied at checkout';

export const HALF_OFF_HOME_HREF = `/?${HALF_OFF_QUERY_KEY}=${HALF_OFF_CODE}`;

export const HALF_OFF_TITLE = 'Advantage - half off';

export const HALF_OFF_DESCRIPTION =
  'Jiu-jitsu round timer, scoreboard, and journal for students, and gym management software for pros. Half off with code MEIA.';

export const HALF_OFF_PAGE_URL = 'https://advantagebjjtimer.com/half-off';

export const HALF_OFF_OG_IMAGE_PATH = '/half-off-card.png';

export const HALF_OFF_OG_IMAGE_URL = `https://advantagebjjtimer.com${HALF_OFF_OG_IMAGE_PATH}`;

/** Share image pixel size. scripts/render-half-off-card.mjs writes this PNG. */
export const HALF_OFF_OG_IMAGE_WIDTH = 2400;

export const HALF_OFF_OG_IMAGE_HEIGHT = 1260;

const CHECKOUT_PRODUCTS = ['white', 'student', 'coach', 'pro'] as const;

export type HalfOffCheckoutProduct = (typeof CHECKOUT_PRODUCTS)[number];

/** True only for the allowlisted customer-facing code. */
export function isAllowlistedHalfOffCode(raw: unknown): boolean {
  return typeof raw === 'string' && raw.trim().toUpperCase() === HALF_OFF_CODE;
}

/**
 * Checkout request flag. Only boolean true. A string is not a promotion code
 * and is not applied.
 */
export function isHalfOffCheckoutFlag(raw: unknown): boolean {
  return raw === true;
}

type FlagStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function writeFlag(storage: FlagStore | null): void {
  if (!storage) return;
  try {
    storage.setItem(HALF_OFF_STORAGE_KEY, HALF_OFF_CODE);
  } catch {
    /* private mode or a full disk */
  }
}

function readFlag(storage: FlagStore | null): boolean {
  if (!storage) return false;
  try {
    return isAllowlistedHalfOffCode(storage.getItem(HALF_OFF_STORAGE_KEY));
  } catch {
    return false;
  }
}

export function rememberHalfOff(local: FlagStore | null, session: FlagStore | null): void {
  writeFlag(local);
  writeFlag(session);
}

export function halfOffStored(local: FlagStore | null, session: FlagStore | null): boolean {
  return readFlag(local) || readFlag(session);
}

/** `?promo=MEIA` remembers the arrival. Any other value is ignored. */
export function captureHalfOffSearch(
  search: URLSearchParams,
  local: FlagStore | null,
  session: FlagStore | null,
): boolean {
  if (!isAllowlistedHalfOffCode(search.get(HALF_OFF_QUERY_KEY))) return false;
  rememberHalfOff(local, session);
  return true;
}

function browserStores(): { local: FlagStore | null; session: FlagStore | null } {
  return {
    local: typeof localStorage === 'undefined' ? null : localStorage,
    session: typeof sessionStorage === 'undefined' ? null : sessionStorage,
  };
}

export function rememberHalfOffArrival(): void {
  const stores = browserStores();
  rememberHalfOff(stores.local, stores.session);
}

export function halfOffArrivalActive(): boolean {
  const stores = browserStores();
  return halfOffStored(stores.local, stores.session);
}

export function captureHalfOffQuery(search: URLSearchParams): boolean {
  const stores = browserStores();
  return captureHalfOffSearch(search, stores.local, stores.session);
}

/** Full page loads remember `?promo=MEIA` before the buy page paints. */
export function consumeHalfOffQueryNow(): void {
  if (typeof window === 'undefined') return;
  captureHalfOffQuery(new URLSearchParams(window.location.search));
}

/**
 * Body for the existing checkout endpoint.
 * Half off is a boolean. A typed unlock or promo code keeps today's behavior.
 * MEIA typed on a half-off visit stays on the allowlisted flag so a dead code
 * falls back instead of erroring.
 */
export function buyCheckoutBody(input: {
  product?: HalfOffCheckoutProduct;
  typedPromo?: string;
  halfOffActive: boolean;
}): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.product && input.product !== 'white') body.product = input.product;
  const typed = typeof input.typedPromo === 'string' ? input.typedPromo.trim() : '';
  if (typed) {
    if (input.halfOffActive && isAllowlistedHalfOffCode(typed)) {
      body.halfOff = true;
      return body;
    }
    body.promotionCode = typed;
    return body;
  }
  if (input.halfOffActive) body.halfOff = true;
  return body;
}
