import {
  WHITE_LAUNCH_PRICE_CENTS,
  WHITE_LIST_PRICE_CENTS,
  formatUsdFromCents,
} from './whitePurchase.ts';

/** Launch window length after WHITE_LAUNCH_DATE (YYYY-MM-DD). */
export const WHITE_LAUNCH_MONTHS = 2;

/** All White launch cutovers use Eastern Time, including midnight on the end date. */
export const WHITE_PRICING_TIME_ZONE = 'America/New_York';

export type CalendarDate = { year: number; month: number; day: number };

/**
 * Public White pricing. Amounts only — never Stripe price ids.
 * /api/config and Checkout both call whitePublicPricing so the buy page
 * and the session cannot disagree.
 */
export type WhitePublicPricing = {
  listPriceCents: number;
  launchPriceCents: number;
  activePriceCents: number;
  launchActive: boolean;
  /** Last calendar day the launch price is charged, in America/New_York. */
  launchThrough: string | null;
  /** "Launch price $15.99 through January 23, 2027, then $19.99", or null. */
  launchCopy: string | null;
};

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** YYYY-MM-DD only. Invalid or missing values return null (standard price). */
export function parseWhiteLaunchDate(raw: string | undefined | null): CalendarDate | null {
  const value = raw?.trim() ?? '';
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1) return null;
  if (day > lastDayOfMonth(year, month)) return null;
  return { year, month, day };
}

export function addCalendarMonths(date: CalendarDate, months: number): CalendarDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const day = Math.min(date.day, lastDayOfMonth(year, month));
  return { year, month, day };
}

export function calendarDayBefore(date: CalendarDate): CalendarDate {
  if (date.day > 1) return { year: date.year, month: date.month, day: date.day - 1 };
  if (date.month > 1) {
    const month = date.month - 1;
    return { year: date.year, month, day: lastDayOfMonth(date.year, month) };
  }
  return { year: date.year - 1, month: 12, day: 31 };
}

export function formatMonthDayYear(date: CalendarDate): string {
  return `${MONTH_NAMES[date.month - 1]} ${date.day}, ${date.year}`;
}

function timezoneOffsetMs(timeZone: string, instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour'),
    value('minute'),
    value('second'),
  );
  return asUtc - instant.getTime();
}

/** Epoch ms of 00:00:00 on this calendar date in the given zone (default Eastern). */
export function zonedMidnightMs(
  date: CalendarDate,
  timeZone = WHITE_PRICING_TIME_ZONE,
): number {
  const utcGuess = Date.UTC(date.year, date.month - 1, date.day, 0, 0, 0);
  let instant = utcGuess - timezoneOffsetMs(timeZone, new Date(utcGuess));
  instant = utcGuess - timezoneOffsetMs(timeZone, new Date(instant));
  return instant;
}

export function whiteLaunchWindow(launchDateRaw: string | undefined | null): {
  startMs: number;
  endMs: number;
  through: CalendarDate;
} | null {
  const start = parseWhiteLaunchDate(launchDateRaw);
  if (!start) return null;
  const end = addCalendarMonths(start, WHITE_LAUNCH_MONTHS);
  return {
    startMs: zonedMidnightMs(start),
    endMs: zonedMidnightMs(end),
    through: calendarDayBefore(end),
  };
}

/**
 * True when now is in [launch 00:00 ET, launch + 2 calendar months 00:00 ET).
 * A future launch date does not start the sale early. Unset or invalid dates
 * stay on the standard price.
 */
export function isWhiteLaunchWindowActive(
  launchDateRaw: string | undefined | null,
  nowMs = Date.now(),
): boolean {
  const window = whiteLaunchWindow(launchDateRaw);
  if (!window) return false;
  return nowMs >= window.startMs && nowMs < window.endMs;
}

export function whiteActivePriceCents(
  launchDateRaw: string | undefined | null,
  nowMs = Date.now(),
): number {
  return isWhiteLaunchWindowActive(launchDateRaw, nowMs)
    ? WHITE_LAUNCH_PRICE_CENTS
    : WHITE_LIST_PRICE_CENTS;
}

export function whiteLaunchCopyFor(through: CalendarDate): string {
  return `Launch price ${formatUsdFromCents(WHITE_LAUNCH_PRICE_CENTS)} through ${formatMonthDayYear(through)}, then ${formatUsdFromCents(WHITE_LIST_PRICE_CENTS)}`;
}

export function whitePublicPricing(
  launchDateRaw: string | undefined | null,
  nowMs = Date.now(),
): WhitePublicPricing {
  const window = whiteLaunchWindow(launchDateRaw);
  const launchActive = Boolean(window && nowMs >= window.startMs && nowMs < window.endMs);
  return {
    listPriceCents: WHITE_LIST_PRICE_CENTS,
    launchPriceCents: WHITE_LAUNCH_PRICE_CENTS,
    activePriceCents: launchActive ? WHITE_LAUNCH_PRICE_CENTS : WHITE_LIST_PRICE_CENTS,
    launchActive,
    launchThrough: launchActive && window ? formatMonthDayYear(window.through) : null,
    launchCopy: launchActive && window ? whiteLaunchCopyFor(window.through) : null,
  };
}

export function readWhitePublicPricing(raw: unknown): WhitePublicPricing | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;
  const listPriceCents = body.listPriceCents;
  const launchPriceCents = body.launchPriceCents;
  const activePriceCents = body.activePriceCents;
  if (listPriceCents !== WHITE_LIST_PRICE_CENTS) return null;
  if (launchPriceCents !== WHITE_LAUNCH_PRICE_CENTS) return null;
  if (activePriceCents !== WHITE_LIST_PRICE_CENTS && activePriceCents !== WHITE_LAUNCH_PRICE_CENTS) {
    return null;
  }
  const launchActive = body.launchActive === true;
  const launchThrough = typeof body.launchThrough === 'string' && body.launchThrough.trim() ? body.launchThrough : null;
  const launchCopy = typeof body.launchCopy === 'string' && body.launchCopy.trim() ? body.launchCopy : null;
  if (launchActive) {
    if (activePriceCents !== WHITE_LAUNCH_PRICE_CENTS || !launchThrough || !launchCopy) return null;
    if (/was|regularly/i.test(launchCopy) || launchCopy.includes('~~')) return null;
  } else if (activePriceCents !== WHITE_LIST_PRICE_CENTS || launchThrough || launchCopy) {
    return null;
  }
  return {
    listPriceCents,
    launchPriceCents,
    activePriceCents,
    launchActive,
    launchThrough: launchActive ? launchThrough : null,
    launchCopy: launchActive ? launchCopy : null,
  };
}

export function whiteCheckoutPriceEnvKey(
  launchDateRaw: string | undefined | null,
  nowMs = Date.now(),
): 'STRIPE_PRICE_WHITE_LAUNCH' | 'STRIPE_PRICE_WHITE' {
  return isWhiteLaunchWindowActive(launchDateRaw, nowMs)
    ? 'STRIPE_PRICE_WHITE_LAUNCH'
    : 'STRIPE_PRICE_WHITE';
}
