/**
 * Shared edition progression. The server owns upgrade credit (/api/upgrade-quote).
 * This module only decides which rungs are open, current, or for sale, and
 * which server price to show. It never subtracts a credit of its own.
 */
import { MEDIA_EDITION_NAME, MEDIA_EDITION_PATH } from './mediaEdition.ts';
import {
  COACH_UNLIMITED_PATH,
  INSTRUCTOR_HOME_TITLE,
  PRO_PLUS_CLOUD_INFO_PATH,
  PRO_PLUS_CLOUD_NAME,
  PRO_PLUS_CLOUD_PATH,
  STUDENT_EDITION_NAME,
} from './productNames.ts';
import {
  INSTRUCTOR_DISPLAY_PRICE_LINE,
  MEDIA_PRICE_LINE,
  PRO_PLUS_CLOUD_PRICE_LINE,
  PRO_PRICE_LINE,
  STUDENT_PRICE_LINE,
} from './productPrices.ts';
import { PURCHASE_CREDIT_NOTE, type UpgradeQuoteResult, type UpgradeTier } from './upgradeQuoteClient.ts';
import { formatUsdFromCents } from './whitePurchase.ts';
import { TIER_BUY_PATHS } from './tierBuyPages.ts';

export { PURCHASE_CREDIT_NOTE };

/** Top to bottom, lowest belt first. */
export const LADDER_ORDER = ['white', 'student', 'media', 'instructor', 'pro', 'pro-cloud'] as const;

export type LadderId = (typeof LADDER_ORDER)[number];

export type LadderRole = 'open' | 'active' | 'buy' | 'soon';

export type LadderPlanRung = {
  id: LadderId;
  role: LadderRole;
  href: string | null;
  /** Checkout product sent to /api/upgrade-quote. Pro Plus Cloud has none. */
  quoteTier: UpgradeTier | null;
};

export const LADDER_NAME: Record<LadderId, string> = {
  white: 'Advantage White',
  student: STUDENT_EDITION_NAME,
  media: MEDIA_EDITION_NAME,
  instructor: INSTRUCTOR_HOME_TITLE,
  pro: 'Advantage Pro',
  'pro-cloud': PRO_PLUS_CLOUD_NAME,
};

/** Existing list-price lines. Used only when the quote API has not answered. */
export const LADDER_LIST_LABEL: Record<Exclude<LadderId, 'white'>, string> = {
  student: STUDENT_PRICE_LINE,
  media: MEDIA_PRICE_LINE,
  instructor: INSTRUCTOR_DISPLAY_PRICE_LINE,
  pro: PRO_PRICE_LINE,
  'pro-cloud': PRO_PLUS_CLOUD_PRICE_LINE,
};

const OPEN_PATH: Record<LadderId, string> = {
  white: '/white',
  student: '/student',
  media: MEDIA_EDITION_PATH,
  instructor: COACH_UNLIMITED_PATH,
  pro: '/pro',
  'pro-cloud': PRO_PLUS_CLOUD_PATH,
};

const BUY_PATH: Record<Exclude<LadderId, 'white' | 'pro-cloud'>, string> = {
  student: TIER_BUY_PATHS.student,
  media: TIER_BUY_PATHS.media,
  instructor: TIER_BUY_PATHS.instructor,
  pro: TIER_BUY_PATHS.pro,
};

const QUOTE_TIER: Record<Exclude<LadderId, 'white' | 'pro-cloud'>, UpgradeTier> = {
  student: 'student',
  media: 'media',
  instructor: 'coach',
  pro: 'pro',
};

function usableEmail(raw: string | null): string | null {
  const email = raw?.trim() ?? '';
  if (!email || email.length > 320 || !email.includes('@') || /\s/.test(email)) return null;
  return email;
}

/** Purchase email already on this address. The entitlement token stores only a hash hint. */
export function readKnownPurchaseEmail(search?: string): string | null {
  let raw = search;
  if (raw === undefined) {
    if (typeof window === 'undefined') return null;
    raw = window.location.search;
  }
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  return usableEmail(params.get('upgradeEmail')) ?? usableEmail(params.get('email'));
}

export function withUpgradeEmail(path: string, email: string | null): string {
  if (!email) return path;
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('upgradeEmail', email);
  const next = params.toString();
  return next ? `${base}?${next}` : base;
}

export function highestEdition(unlocked: Partial<Record<LadderId, boolean>>): LadderId | null {
  for (let index = LADDER_ORDER.length - 1; index >= 0; index -= 1) {
    const id = LADDER_ORDER[index];
    if (unlocked[id]) return id;
  }
  return null;
}

/**
 * Current page is highlighted. Unlocked editions are open links.
 * Buy links are only for locked editions above this page, and never for a seat.
 * Pro Plus Cloud stays a Coming soon link. A bar with only the current rung is hidden.
 */
export function planEditionLadder(input: {
  page: LadderId;
  unlocked: Partial<Record<LadderId, boolean>>;
  seated: boolean;
  email: string | null;
}): { show: boolean; rungs: LadderPlanRung[] } {
  const pageAt = LADDER_ORDER.indexOf(input.page);
  const rungs: LadderPlanRung[] = [];
  LADDER_ORDER.forEach((id, index) => {
    if (id === input.page) {
      rungs.push({ id, role: 'active', href: null, quoteTier: null });
      return;
    }
    const unlocked = Boolean(input.unlocked[id]);
    if (unlocked) {
      rungs.push({ id, role: 'open', href: OPEN_PATH[id], quoteTier: null });
      return;
    }
    if (index < pageAt || input.seated) return;
    if (id === 'pro-cloud') {
      rungs.push({ id, role: 'soon', href: PRO_PLUS_CLOUD_INFO_PATH, quoteTier: null });
      return;
    }
    if (id === 'white') return;
    const quoteTier = QUOTE_TIER[id];
    rungs.push({
      id,
      role: 'buy',
      href: withUpgradeEmail(BUY_PATH[id], input.email),
      quoteTier,
    });
  });
  const show = rungs.some((rung) => rung.role !== 'active');
  return { show, rungs: show ? rungs : [] };
}

/**
 * Server upgradePriceCents when a quote came back. Otherwise the existing list line.
 * `note` asks for the credit sentence. This does not compute list minus credit.
 */
export function ladderBuyPrice(
  listLabel: string,
  quote: UpgradeQuoteResult | null,
  asked: boolean,
): { price: string; note: boolean } {
  if (asked && quote?.kind === 'quote') {
    return { price: formatUsdFromCents(quote.upgradePriceCents), note: false };
  }
  return { price: listLabel, note: true };
}
