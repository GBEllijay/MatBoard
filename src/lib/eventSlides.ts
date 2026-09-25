import { buyLinkForQr } from './shopSlides.ts';
import {
  DEFAULT_SHOP_CAST_MODE,
  SHOP_CAST_MODE_OPTIONS,
  SHOP_CAST_MODES,
  normalizeShopCastMode,
  type ShopCastMode,
} from './shopSlides.ts';

/**
 * Events cast pages.
 * Each event or tournament photo is one TV page, like Gallery.
 * Optional links become QR codes beside that photo, like Pro Shop.
 */

export const EVENTS_FOLDER_ID = 'events';

/** How many QR targets one event photo can show beside itself. */
export const EVENT_QR_CAP = 6;

export const EVENTS_CAST_MODES = SHOP_CAST_MODES;
export type EventsCastMode = ShopCastMode;

/** Images + QR is the owner default. Logo stays opt-in until a gym mark is saved. */
export const DEFAULT_EVENTS_CAST_MODE: EventsCastMode = DEFAULT_SHOP_CAST_MODE;

export const EVENTS_CAST_MODE_OPTIONS = SHOP_CAST_MODE_OPTIONS;

export const normalizeEventsCastMode = normalizeShopCastMode;

/** Keep real links, in order, capped. Bare domains become https links. */
export function normalizeQrLinks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const links: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const href = buyLinkForQr(item);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    links.push(href);
    if (links.length >= EVENT_QR_CAP) break;
  }
  return links;
}

/** Short TV caption so two codes beside one photo can be told apart. */
export function qrLinkCaption(raw: unknown): string {
  const href = buyLinkForQr(raw);
  if (!href) return '';
  try {
    const url = new URL(href);
    const host = url.hostname.replace(/^www\./, '');
    const leaf = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? '';
    if (!leaf) return host;
    let label = leaf;
    try {
      label = decodeURIComponent(leaf);
    } catch {
      label = leaf;
    }
    label = label.replace(/[-_]+/g, ' ');
    return label.length > 22 ? `${label.slice(0, 21)}…` : label;
  } catch {
    return href.replace(/^https?:\/\//, '').slice(0, 22);
  }
}
