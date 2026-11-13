import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { handleWebhook } from './handlers.ts';
import { memoryEntitlementStore } from './entitlements.ts';
import { API_PRODUCT_PRO } from './routes.ts';
import { readFileSync } from 'node:fs';
import {
  BUNDLE_CEILING,
  FREE_INSTRUCTOR_SEATS,
  FREE_STUDENT_LICENSES,
  HALF_OFF_MAX_USES,
  OWNER_ALPHA_LICENSE_ID,
  OWNER_FREE_INSTRUCTOR_SEATS,
  OWNER_FREE_STUDENT_LICENSES,
  ensureHalfOffCode,
  halfOffUseAllowed,
  instructorAllowanceForLicense,
  instructorSeatAllowance,
  readHalfOffCode,
  studentLicenseAllowance,
} from './proBundle.ts';
import { sqliteD1 } from './sqliteD1.ts';

test('seat and student allowances share 100 half-off uses and stop at 105', () => {
  assert.equal(instructorSeatAllowance(0), FREE_INSTRUCTOR_SEATS);
  assert.equal(studentLicenseAllowance(0), FREE_STUDENT_LICENSES);
  assert.equal(instructorSeatAllowance(100), BUNDLE_CEILING);
  assert.equal(studentLicenseAllowance(100), BUNDLE_CEILING);
  assert.equal(instructorSeatAllowance(3), 8);
  assert.equal(studentLicenseAllowance(0), 5);
  assert.equal(halfOffUseAllowed({ kind: 'instructor', instructorUses: 100, studentUses: 0 }), false);
  assert.equal(halfOffUseAllowed({ kind: 'student', instructorUses: 40, studentUses: 60 }), false);
  assert.equal(halfOffUseAllowed({ kind: 'student', instructorUses: 40, studentUses: 59 }), true);
  assert.equal(HALF_OFF_MAX_USES, 100);
});

test('checkout.session.completed for Pro writes one half-off row and does not mint another', async () => {
  const db = sqliteD1();
  const now = new Date('2026-11-02T12:00:00.000Z');
  const payload = JSON.stringify({
    id: 'evt_pro_bundle',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_pro_bundle',
        object: 'checkout.session',
        mode: 'subscription',
        payment_status: 'paid',
        amount_total: 9999,
        currency: 'usd',
        subscription: 'sub_pro_bundle',
        customer_details: { email: 'owner@gym.test' },
        metadata: { product: API_PRODUCT_PRO },
      },
    },
  });
  const timestamp = Math.floor(now.getTime() / 1000);
  const signature = createHmac('sha256', 'whsec_test').update(`${timestamp}.${payload}`).digest('hex');
  const response = await handleWebhook(
    new Request('http://localhost/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` },
      body: payload,
    }),
    { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
    memoryEntitlementStore(),
    () => now,
    { db, pepper: 'test-pepper' },
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { halfOffCode?: string };
  assert.equal(body.halfOffCode, undefined);
  const license = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ?`)
    .bind('cs_test_pro_bundle')
    .first<{ licenseId: string }>();
  assert.ok(license?.licenseId);
  const row = await readHalfOffCode(db, license.licenseId);
  assert.ok(row);
  assert.equal(row.maxUses, 100);
  assert.equal(row.instructorUses, 0);
  assert.equal(row.studentUses, 0);
  assert.match(row.code, /^ADVH-[A-Z0-9]{12}$/);
  await ensureHalfOffCode(db, license.licenseId, now);
  const again = await readHalfOffCode(db, license.licenseId);
  assert.equal(again?.code, row.code);
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM half_off_codes`).first<{ total: number }>();
  assert.equal(Number(count?.total), 1);
});

test('regular Pro stays at 5 seats and 5 student licenses; only the owner alpha license is raised', async () => {
  assert.equal(FREE_INSTRUCTOR_SEATS, 5);
  assert.equal(FREE_STUDENT_LICENSES, 5);
  assert.equal(instructorSeatAllowance(0), 5);
  assert.equal(studentLicenseAllowance(0), 5);
  assert.equal(instructorSeatAllowance(0, 'paid-pro-license'), 5);
  assert.equal(studentLicenseAllowance(0, 'paid-pro-license'), 5);
  assert.equal(OWNER_FREE_INSTRUCTOR_SEATS, 20);
  assert.equal(OWNER_FREE_STUDENT_LICENSES, 25);
  assert.equal(instructorSeatAllowance(0, OWNER_ALPHA_LICENSE_ID), 20);
  assert.equal(studentLicenseAllowance(0, OWNER_ALPHA_LICENSE_ID), 25);
  const db = sqliteD1();
  assert.equal(await instructorAllowanceForLicense(db, 'paid-pro-license'), 5);
  assert.equal(await instructorAllowanceForLicense(db, OWNER_ALPHA_LICENSE_ID), 20);
});

test('Stripe checkout source does not import or change owner or Pro seat caps', () => {
  const checkout = readFileSync(new URL('./stripeCheckout.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    checkout,
    /OWNER_ALPHA_LICENSE_ID|OWNER_FREE_INSTRUCTOR_SEATS|OWNER_FREE_STUDENT_LICENSES|FREE_INSTRUCTOR_SEATS|FREE_STUDENT_LICENSES|instructorSeatAllowance|studentLicenseAllowance/,
  );
  const confirm = readFileSync(new URL('./checkoutConfirm.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    confirm,
    /OWNER_ALPHA_LICENSE_ID|OWNER_FREE_INSTRUCTOR_SEATS|OWNER_FREE_STUDENT_LICENSES/,
  );
});

