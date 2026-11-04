/**
 * Edition progression bar. Buy rungs stay above the current page.
 * Quoted prices are the server's upgradePriceCents. No client-side credit math.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  LADDER_LIST_LABEL,
  LADDER_ORDER,
  PURCHASE_CREDIT_NOTE,
  highestEdition,
  ladderBuyPrice,
  planEditionLadder,
  readKnownPurchaseEmail,
  withUpgradeEmail,
} from './editionLadder.ts';
import { STUDENT_PRICE_LINE } from './productPrices.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const none = { white: false, student: false, media: false, instructor: false, pro: false, 'pro-cloud': false };

test('ladder order is White through Pro Plus Cloud', () => {
  assert.deepEqual(LADDER_ORDER, ['white', 'student', 'media', 'instructor', 'pro', 'pro-cloud']);
  assert.equal(
    PURCHASE_CREDIT_NOTE,
    "Your earlier purchase is credited. Enter the email you bought with, and you'll only pay the difference.",
  );
});

test('a White page links upward to buy, and a Student page opens White', () => {
  const white = planEditionLadder({ page: 'white', unlocked: { ...none, white: true }, seated: false, email: null });
  assert.deepEqual(
    white.rungs.map((rung) => [rung.id, rung.role]),
    [
      ['white', 'active'],
      ['student', 'buy'],
      ['media', 'buy'],
      ['instructor', 'buy'],
      ['pro', 'buy'],
      ['pro-cloud', 'soon'],
    ],
  );
  assert.equal(white.rungs.find((rung) => rung.id === 'instructor')?.quoteTier, 'coach');
  assert.equal(white.rungs.find((rung) => rung.id === 'pro-cloud')?.quoteTier, null);
  assert.equal(white.rungs.find((rung) => rung.id === 'pro-cloud')?.href, '/editions/pro-cloud');

  const student = planEditionLadder({
    page: 'student',
    unlocked: { ...none, white: true, student: true },
    seated: false,
    email: 'buyer@gym.test',
  });
  assert.equal(student.rungs.find((rung) => rung.id === 'white')?.role, 'open');
  assert.equal(student.rungs.find((rung) => rung.id === 'white')?.href, '/white');
  assert.equal(student.rungs.find((rung) => rung.id === 'student')?.role, 'active');
  assert.equal(student.rungs.find((rung) => rung.id === 'student')?.href, null);
  assert.match(student.rungs.find((rung) => rung.id === 'media')?.href ?? '', /^\/media\?upgradeEmail=buyer%40gym\.test$/);
});

test('owned tiers above the page are open links, not buy rungs', () => {
  const onWhite = planEditionLadder({
    page: 'white',
    unlocked: { white: true, student: true, media: true, instructor: false, pro: false, 'pro-cloud': false },
    seated: false,
    email: null,
  });
  assert.deepEqual(
    onWhite.rungs.map((rung) => [rung.id, rung.role]),
    [
      ['white', 'active'],
      ['student', 'open'],
      ['media', 'open'],
      ['instructor', 'buy'],
      ['pro', 'buy'],
      ['pro-cloud', 'soon'],
    ],
  );
});

test('the top tier has no buy rungs, and a bar with nothing else stays hidden', () => {
  const cloud = planEditionLadder({
    page: 'pro-cloud',
    unlocked: { white: true, student: true, media: true, instructor: true, pro: true, 'pro-cloud': true },
    seated: false,
    email: 'buyer@gym.test',
  });
  assert.equal(cloud.show, true);
  assert.equal(cloud.rungs.some((rung) => rung.role === 'buy' || rung.role === 'soon'), false);
  assert.equal(cloud.rungs.at(-1)?.role, 'active');
  assert.deepEqual(
    cloud.rungs.filter((rung) => rung.role === 'open').map((rung) => rung.href),
    ['/white', '/student', '/media', '/coach-unlimited', '/pro'],
  );

  const alone = planEditionLadder({ page: 'pro-cloud', unlocked: { 'pro-cloud': true }, seated: false, email: null });
  assert.equal(alone.show, false);
  assert.deepEqual(alone.rungs, []);
});

test('a seat gets quick links and no buy rungs', () => {
  const seated = planEditionLadder({
    page: 'media',
    unlocked: { white: true, student: true, media: true, instructor: false, pro: false, 'pro-cloud': false },
    seated: true,
    email: 'buyer@gym.test',
  });
  assert.deepEqual(
    seated.rungs.map((rung) => [rung.id, rung.role]),
    [
      ['white', 'open'],
      ['student', 'open'],
      ['media', 'active'],
    ],
  );
  const only = planEditionLadder({ page: 'white', unlocked: { white: true }, seated: true, email: null });
  assert.equal(only.show, false);
});

test('a quote price is the server amount; no email keeps the list line and the credit note flag', () => {
  const quoted = ladderBuyPrice(STUDENT_PRICE_LINE, {
    kind: 'quote',
    listPriceCents: 1999,
    upgradePriceCents: 1000,
    creditApplied: 999,
  }, true);
  assert.equal(quoted.price, '$10.00');
  assert.equal(quoted.note, false);
  assert.notEqual(quoted.price, '$9.99');
  const fallback = ladderBuyPrice(LADDER_LIST_LABEL.instructor, null, false);
  assert.equal(fallback.price, LADDER_LIST_LABEL.instructor);
  assert.equal(fallback.note, true);
  const failed = ladderBuyPrice(LADDER_LIST_LABEL.pro, { kind: 'error', message: 'offline' }, true);
  assert.equal(failed.price, LADDER_LIST_LABEL.pro);
  assert.equal(failed.note, true);
});

test('purchase email is read from the address, not invented', () => {
  assert.equal(readKnownPurchaseEmail(''), null);
  assert.equal(readKnownPurchaseEmail('upgradeEmail=buyer@gym.test'), 'buyer@gym.test');
  assert.equal(readKnownPurchaseEmail('email=buyer@gym.test'), 'buyer@gym.test');
  assert.equal(withUpgradeEmail('/editions/pro', null), '/editions/pro');
  assert.equal(withUpgradeEmail('/editions/pro', 'buyer@gym.test'), '/editions/pro?upgradeEmail=buyer%40gym.test');
  assert.equal(highestEdition({ white: true, pro: true, student: true }), 'pro');
  assert.equal(highestEdition({ 'pro-cloud': true, pro: true }), 'pro-cloud');
  assert.equal(highestEdition({}), null);
});

test('the ladder, credit note, and Pro Plus Cloud card do not hardcode a credit or a new checkout', () => {
  const ladder = read('./editionLadder.ts');
  const view = read('../components/EditionLadder.tsx');
  const quote = read('../components/UpgradeQuote.tsx');
  const buy = read('../pages/BuyWhite.tsx');
  const parts = read('../components/TierBuyParts.tsx');
  const tier = read('../pages/BuyTier.tsx');
  assert.doesNotMatch(ladder, /\$\d/);
  assert.doesNotMatch(view, /\$\d/);
  assert.doesNotMatch(`${ladder}\n${view}`, /listPriceCents\s*-|creditApplied\s*-/);
  assert.match(quote, /PURCHASE_CREDIT_NOTE/);
  assert.match(quote, /data-testid="purchase-credit-note"/);
  assert.match(tier, /readKnownPurchaseEmail\(params\.toString\(\)\)/);
  assert.match(buy, /<ProCloudBuyCard \/>/);
  assert.match(parts, /This product is in alpha/);
  assert.match(parts, /to=\{PRO_PLUS_CLOUD_INFO_PATH\}/);
  assert.doesNotMatch(parts.slice(parts.indexOf('function ProCloudBuyCard'), parts.indexOf('function HigherTierList')), /fetch\(|WHITE_CHECKOUT_API/);
  assert.match(read('../pages/White.tsx'), /<WhiteUpgradePrompt \/>[\s\S]*<EditionLadder page="white" \/>/);
  assert.match(read('../pages/student/StudentMenus.tsx'), /s-ghost[\s\S]*<EditionLadder page="student" \/>/);
  assert.match(read('../components/SeatSessionBar.tsx'), /export function SeatSessionBar\(\) \{\s*return null;/);
  assert.match(read('../components/SeatSessionBar.tsx'), /<SignedInUpgradeBar \/>/);
  assert.doesNotMatch(read('../components/SeatSessionBar.tsx'), /Signed in as/);
});
