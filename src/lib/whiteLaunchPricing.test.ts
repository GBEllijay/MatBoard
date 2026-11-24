import assert from 'node:assert/strict';
import test from 'node:test';
import { handlePublicConfig } from '../server/publicConfig.ts';
import {
  WHITE_LAUNCH_PRICE_CENTS,
  WHITE_LIST_PRICE_CENTS,
  WHITE_PRICE_LABEL,
  formatUsdFromCents,
} from './whitePurchase.ts';
import {
  addCalendarMonths,
  calendarDayBefore,
  isWhiteLaunchWindowActive,
  parseWhiteLaunchDate,
  readWhitePublicPricing,
  whiteActivePriceCents,
  whiteCheckoutPriceEnvKey,
  whiteLaunchCopyFor,
  whiteLaunchWindow,
  whitePublicPricing,
  zonedMidnightMs,
} from './whiteLaunchPricing.ts';

test('unset or invalid WHITE_LAUNCH_DATE uses the standard $19.99 price', () => {
  const now = Date.parse('2026-12-01T12:00:00.000Z');
  for (const raw of [undefined, null, '', '  ', '11/24/2026', '2026-13-01', '2026-02-31', '2026-11-24T00:00:00Z']) {
    assert.equal(isWhiteLaunchWindowActive(raw, now), false, String(raw));
    assert.equal(whiteActivePriceCents(raw, now), WHITE_LIST_PRICE_CENTS);
    assert.equal(whiteCheckoutPriceEnvKey(raw, now), 'STRIPE_PRICE_WHITE');
    assert.equal(whitePublicPricing(raw, now).launchActive, false);
    assert.equal(whitePublicPricing(raw, now).activePriceCents, 1999);
    assert.equal(whitePublicPricing(raw, now).launchCopy, null);
  }
  assert.equal(parseWhiteLaunchDate('2026-11-24')?.day, 24);
  assert.equal(WHITE_PRICE_LABEL, '$19.99');
  assert.equal(formatUsdFromCents(WHITE_LIST_PRICE_CENTS), '$19.99');
  assert.equal(formatUsdFromCents(WHITE_LAUNCH_PRICE_CENTS), '$15.99');
});

test('launch window is [launch 00:00 ET, launch + 2 calendar months 00:00 ET)', () => {
  const launch = '2026-11-24';
  const window = whiteLaunchWindow(launch);
  assert.ok(window);
  // 2026-11-24 00:00 America/New_York is EST (UTC-5).
  assert.equal(window.startMs, Date.parse('2026-11-24T05:00:00.000Z'));
  // 2027-01-24 00:00 America/New_York is EST (UTC-5).
  assert.equal(window.endMs, Date.parse('2027-01-24T05:00:00.000Z'));
  assert.deepEqual(window.through, { year: 2027, month: 1, day: 23 });
  assert.equal(
    whitePublicPricing(launch, window.startMs).launchCopy,
    'Launch price $15.99 through January 23, 2027, then $19.99',
  );

  assert.equal(isWhiteLaunchWindowActive(launch, window.startMs - 1), false);
  assert.equal(whiteActivePriceCents(launch, window.startMs - 1), 1999);
  assert.equal(whiteCheckoutPriceEnvKey(launch, window.startMs - 1), 'STRIPE_PRICE_WHITE');

  assert.equal(isWhiteLaunchWindowActive(launch, window.startMs), true);
  assert.equal(whiteActivePriceCents(launch, window.startMs), 1599);
  assert.equal(whiteCheckoutPriceEnvKey(launch, window.startMs), 'STRIPE_PRICE_WHITE_LAUNCH');

  const lastLaunchMs = Date.parse('2027-01-24T04:59:59.999Z');
  assert.equal(isWhiteLaunchWindowActive(launch, lastLaunchMs), true);
  assert.equal(whiteActivePriceCents(launch, lastLaunchMs), 1599);

  assert.equal(isWhiteLaunchWindowActive(launch, window.endMs), false);
  assert.equal(whiteActivePriceCents(launch, window.endMs), 1999);
  assert.equal(whiteCheckoutPriceEnvKey(launch, window.endMs), 'STRIPE_PRICE_WHITE');
  assert.equal(whitePublicPricing(launch, window.endMs).launchCopy, null);
});

test('a future launch date does not start the sale early', () => {
  const before = Date.parse('2026-11-23T05:00:00.000Z');
  assert.equal(isWhiteLaunchWindowActive('2026-11-24', before), false);
  assert.equal(whiteActivePriceCents('2026-11-24', before), 1999);
});

test('calendar-month end clamps when the target month is shorter', () => {
  assert.deepEqual(addCalendarMonths({ year: 2026, month: 12, day: 31 }, 2), {
    year: 2027,
    month: 2,
    day: 28,
  });
  assert.deepEqual(calendarDayBefore({ year: 2027, month: 3, day: 1 }), {
    year: 2027,
    month: 2,
    day: 28,
  });
  const window = whiteLaunchWindow('2026-12-31');
  assert.ok(window);
  // 2027-02-28 00:00 America/New_York is EST (UTC-5).
  assert.equal(window.endMs, Date.parse('2027-02-28T05:00:00.000Z'));
  assert.deepEqual(window.through, { year: 2027, month: 2, day: 27 });
});

test('Eastern midnight around the 2027 DST spring-forward is still 00:00 ET', () => {
  // DST starts 2027-03-14 02:00 local, so March 15 is EDT (UTC-4).
  assert.equal(zonedMidnightMs({ year: 2027, month: 3, day: 14 }), Date.parse('2027-03-14T05:00:00.000Z'));
  assert.equal(zonedMidnightMs({ year: 2027, month: 3, day: 15 }), Date.parse('2027-03-15T04:00:00.000Z'));
  const window = whiteLaunchWindow('2027-01-15');
  assert.ok(window);
  assert.equal(window.endMs, Date.parse('2027-03-15T04:00:00.000Z'));
  assert.equal(isWhiteLaunchWindowActive('2027-01-15', window.endMs - 1), true);
  assert.equal(isWhiteLaunchWindowActive('2027-01-15', window.endMs), false);
});

test('launch copy never uses was, regularly, or strikethrough', () => {
  const copy = whiteLaunchCopyFor({ year: 2027, month: 1, day: 23 });
  assert.equal(copy, 'Launch price $15.99 through January 23, 2027, then $19.99');
  assert.doesNotMatch(copy, /was|regularly/i);
  assert.ok(!copy.includes('~~') && !copy.includes('— $19.99'));
});

test('readWhitePublicPricing accepts only the server-shaped payload', () => {
  const active = whitePublicPricing('2026-11-24', Date.parse('2026-11-24T05:00:00.000Z'));
  assert.deepEqual(readWhitePublicPricing(active), active);
  assert.equal(readWhitePublicPricing(null), null);
  assert.equal(readWhitePublicPricing({ ...active, listPriceCents: 999 }), null);
  assert.equal(readWhitePublicPricing({ ...active, launchCopy: 'Was $19.99, now $15.99' }), null);
  const standard = whitePublicPricing(undefined);
  assert.deepEqual(readWhitePublicPricing(standard), standard);
  assert.equal(readWhitePublicPricing({ ...standard, launchCopy: 'Launch price $15.99 through January 1, 2027, then $19.99' }), null);
});

test('GET /api/config includes White pricing and never Stripe price ids', async () => {
  const unset = handlePublicConfig(new Request('http://localhost/api/config'), {}, null);
  const unsetBody = (await unset.json()) as { whitePricing: ReturnType<typeof whitePublicPricing> };
  assert.equal(unsetBody.whitePricing.activePriceCents, 1999);
  assert.equal(unsetBody.whitePricing.launchActive, false);
  assert.equal(unsetBody.whitePricing.launchCopy, null);
  const text = JSON.stringify(unsetBody);
  assert.doesNotMatch(text, /price_/);
  assert.doesNotMatch(text, /sk_live|sk_test|whsec_/);

  const response = handlePublicConfig(
    new Request('http://localhost/api/config'),
    { WHITE_LAUNCH_DATE: '2026-11-24' },
    null,
  );
  // Freeze nothing here: this only checks the shape when the date is set. Window
  // activity depends on the real clock, so accept either valid state.
  const body = (await response.json()) as { whitePricing: ReturnType<typeof whitePublicPricing> };
  const parsed = readWhitePublicPricing(body.whitePricing);
  assert.ok(parsed);
  assert.equal(parsed?.listPriceCents, 1999);
  assert.equal(parsed?.launchPriceCents, 1599);
  assert.doesNotMatch(JSON.stringify(body), /price_/);
});
