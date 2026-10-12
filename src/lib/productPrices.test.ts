import assert from 'node:assert/strict';
import test from 'node:test';
import { SITE_FEEDBACK_EMAIL } from './siteFooter.ts';
import { formatUsdFromCents } from './whitePurchase.ts';
import {
  ALPHA_ACCESS_NOTE,
  COACH_LIST_PRICE_CENTS,
  COACH_PRICE_LINE,
  PRO_LIST_PRICE_CENTS,
  PRO_MONTHLY_PRICE_CENTS,
  PRO_PRICE_LINE,
  STUDENT_ALPHA_ACCESS_NOTE,
  STUDENT_EDITION_LABEL,
  STUDENT_LIST_PRICE_CENTS,
  STUDENT_PRICE_LINE,
} from './productPrices.ts';

test('Coach is $29.99 one-time and Pro is $99.99 plus $5.99/month', () => {
  assert.equal(COACH_LIST_PRICE_CENTS, 2999);
  assert.equal(PRO_LIST_PRICE_CENTS, 9999);
  assert.equal(PRO_MONTHLY_PRICE_CENTS, 599);
  assert.notEqual(PRO_LIST_PRICE_CENTS, 6999);
  assert.equal(COACH_PRICE_LINE, `${formatUsdFromCents(COACH_LIST_PRICE_CENTS)} one-time`);
  assert.equal(COACH_PRICE_LINE, '$29.99 one-time');
  assert.equal(
    PRO_PRICE_LINE,
    `${formatUsdFromCents(PRO_LIST_PRICE_CENTS)} one-time, plus ${formatUsdFromCents(PRO_MONTHLY_PRICE_CENTS)}/month`,
  );
  assert.equal(PRO_PRICE_LINE, '$99.99 one-time, plus $5.99/month');
  assert.doesNotMatch(`${COACH_PRICE_LINE}\n${PRO_PRICE_LINE}`, /69\.99|6999|\$2\.99/);
});

test('Student Edition is $19.99 one-time', () => {
  assert.equal(STUDENT_LIST_PRICE_CENTS, 1999);
  assert.equal(STUDENT_PRICE_LINE, `${formatUsdFromCents(STUDENT_LIST_PRICE_CENTS)} one-time`);
  assert.equal(STUDENT_PRICE_LINE, '$19.99 one-time');
  assert.equal(STUDENT_EDITION_LABEL, 'Advantage – Student Edition');
  assert.equal(
    STUDENT_ALPHA_ACCESS_NOTE,
    'Student Edition is in free alpha testing. Email advantageappllc@gmail.com for a free alpha code.',
  );
  assert.doesNotMatch(STUDENT_PRICE_LINE, /Coach/);
});

test('alpha access uses the existing support address', () => {
  assert.equal(
    ALPHA_ACCESS_NOTE,
    'Coach and Pro are in free alpha testing. Email advantageappllc@gmail.com for a free alpha code.',
  );
  assert.equal(SITE_FEEDBACK_EMAIL, 'advantageappllc@gmail.com');
  assert.match(ALPHA_ACCESS_NOTE, new RegExp(SITE_FEEDBACK_EMAIL));
});
