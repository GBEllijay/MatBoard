import { normalizeQrUrl } from './gymCalendar.ts';

/**
 * Pro Shop cast pages.
 * A slide may hold several product cards. Each card keeps its own buy-link QR.
 * There is no single-QR cap.
 */

export const SHOP_FOLDER_ID = 'shop';

/** On-device inventory ceiling. Gallery has no cap; shop images plus QR text stay bounded. */
export const SHOP_ITEM_CAP = 40;

export const SHOP_BUY_URL_MAX = 500;

export const SHOP_CAST_MODES = ['images', 'images-qr', 'images-qr-logo'] as const;
export type ShopCastMode = (typeof SHOP_CAST_MODES)[number];

/** Images + QR is the owner default. Logo stays opt-in until a gym mark is saved. */
export const DEFAULT_SHOP_CAST_MODE: ShopCastMode = 'images-qr';

export const SHOP_CAST_MODE_OPTIONS: readonly { id: ShopCastMode; label: string }[] = [
  { id: 'images', label: 'Images only' },
  { id: 'images-qr', label: 'Images + QR' },
  { id: 'images-qr-logo', label: 'Images + QR + logo' },
];

export type ShopSlideItem = {
  id: string;
  folderId: string;
  /** False joins the previous Pro Shop card on one TV page. Missing means a new slide. */
  startsSlide?: boolean;
};

export type CastSlide<T extends ShopSlideItem> =
  | { kind: 'media'; id: string; item: T }
  | { kind: 'shop'; id: string; items: T[] };

export function normalizeShopCastMode(raw: unknown): ShopCastMode {
  return SHOP_CAST_MODES.includes(raw as ShopCastMode)
    ? (raw as ShopCastMode)
    : DEFAULT_SHOP_CAST_MODE;
}

export function shopSlotsLeft(existingCount: number, cap = SHOP_ITEM_CAP): number {
  if (!Number.isFinite(existingCount) || existingCount <= 0) return cap;
  return Math.max(0, cap - Math.floor(existingCount));
}

export function normalizeBuyUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim().slice(0, SHOP_BUY_URL_MAX);
}

/** Text encoded in the card QR. Bare domains become https links, matching Class Schedule. */
export function buyLinkForQr(raw: unknown): string {
  const trimmed = normalizeBuyUrl(raw);
  if (!trimmed) return '';
  return normalizeQrUrl(trimmed).slice(0, SHOP_BUY_URL_MAX);
}

export function normalizeStartsSlide(raw: unknown): boolean {
  return raw !== false;
}

/**
 * Slide numbers follow list order, including Play Off cards.
 * A Play Off card still splits the page so the next "Same slide" card does not
 * jump onto the group above it.
 */
export function shopSlideNumbers<T extends { id: string; startsSlide?: boolean }>(
  shopItemsInListOrder: readonly T[],
): Map<string, number> {
  const numbers = new Map<string, number>();
  let slide = 0;
  shopItemsInListOrder.forEach((item, index) => {
    const joined = index > 0 && item.startsSlide === false;
    if (!joined) slide += 1;
    numbers.set(item.id, slide);
  });
  return numbers;
}

export function slideMarksForList<T extends { id: string; startsSlide?: boolean }>(
  items: readonly T[],
): Map<string, { slide: number; joined: boolean }> {
  const marks = new Map<string, { slide: number; joined: boolean }>();
  let slide = 0;
  items.forEach((item, index) => {
    const joined = index > 0 && item.startsSlide === false;
    if (!joined) slide += 1;
    marks.set(item.id, { slide, joined });
  });
  return marks;
}

/**
 * Turn a play queue into TV pages.
 * Gallery and Events stay one item per page.
 * Pro Shop cards that share a list slide stay on one page, each with its own QR later.
 */
export function buildCastSlides<T extends ShopSlideItem>(
  queue: readonly T[],
  shopItemsInListOrder?: readonly T[],
  shopFolderId = SHOP_FOLDER_ID,
): CastSlide<T>[] {
  const list =
    shopItemsInListOrder ?? queue.filter((item) => item.folderId === shopFolderId);
  const numbers = shopSlideNumbers(list);
  const slides: CastSlide<T>[] = [];
  for (const item of queue) {
    if (item.folderId !== shopFolderId) {
      slides.push({ kind: 'media', id: item.id, item });
      continue;
    }
    const slideNo = numbers.get(item.id);
    const last = slides[slides.length - 1];
    const lastNo = last?.kind === 'shop' ? numbers.get(last.items[0]?.id ?? '') : undefined;
    if (last?.kind === 'shop' && slideNo != null && slideNo === lastNo) {
      last.items.push(item);
      continue;
    }
    slides.push({ kind: 'shop', id: item.id, items: [item] });
  }
  return slides;
}
