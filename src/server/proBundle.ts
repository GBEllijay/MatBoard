/**
 * Pro purchase bundle. Five free instructor seats and five free Student Edition
 * licenses are app rows. They are not Stripe charges.
 * The half-off row is one Student Edition promotion code per academy license.
 * Pro uses 100 redemptions. Instructor Edition uses 25. This module does not
 * create a Stripe price or charge those free seats.
 */

import type { D1Database } from './d1.ts';
import {
  BUNDLE_CEILING,
  FREE_INSTRUCTOR_SEATS,
  FREE_STUDENT_LICENSES,
  HALF_OFF_MAX_USES,
  INSTRUCTOR_HALF_OFF_MAX_USES,
  instructorSeatAllowance,
  studentLicenseAllowance,
} from '../lib/proBundleMath.ts';

export {
  BUNDLE_CEILING,
  FREE_INSTRUCTOR_SEATS,
  FREE_STUDENT_LICENSES,
  HALF_OFF_MAX_USES,
  INSTRUCTOR_HALF_OFF_MAX_USES,
  instructorSeatAllowance,
  studentLicenseAllowance,
};

export function halfOffUses(instructorUses: number, studentUses: number): number {
  return Math.max(0, instructorUses) + Math.max(0, studentUses);
}

/** True when one more use of this kind still fits the shared 100 and that kind's ceiling. */
export function halfOffUseAllowed(input: {
  kind: 'instructor' | 'student';
  instructorUses: number;
  studentUses: number;
}): boolean {
  if (halfOffUses(input.instructorUses, input.studentUses) >= HALF_OFF_MAX_USES) return false;
  if (input.kind === 'instructor') return instructorSeatAllowance(input.instructorUses + 1) <= BUNDLE_CEILING;
  return studentLicenseAllowance(input.studentUses + 1) <= BUNDLE_CEILING;
}

export type HalfOffRow = {
  licenseId: string;
  code: string;
  maxUses: number;
  instructorUses: number;
  studentUses: number;
  accountId?: string | null;
  couponId?: string | null;
  percentOff?: number | null;
  promoId?: string | null;
};

export type HalfOffWrite = {
  maxUses?: number;
  /** Customer-facing code. Omitted mints a local code (dev and tests without Stripe). */
  code?: string;
  couponId?: string | null;
  percentOff?: number | null;
  promoId?: string | null;
};

export function mintHalfOffCode(): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `ADVH-${raw}`;
}

/** Write the row once per license. A second call keeps the original code. Does not log the code. */
export async function ensureHalfOffCode(
  db: D1Database,
  licenseId: string,
  now = new Date(),
  options: HalfOffWrite = {},
): Promise<void> {
  if (!licenseId) return;
  const existing = await db
    .prepare(`SELECT license_id AS licenseId FROM half_off_codes WHERE license_id = ?`)
    .bind(licenseId)
    .first<{ licenseId: string }>();
  if (existing) return;
  const account = await db
    .prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ?`)
    .bind(licenseId)
    .first<{ accountId: string | null }>();
  const maxUses = options.maxUses && options.maxUses > 0 ? Math.floor(options.maxUses) : HALF_OFF_MAX_USES;
  await db
    .prepare(
      `INSERT INTO half_off_codes (
         license_id, code, max_uses, instructor_uses, student_uses, created_at, account_id, coupon_id, percent_off, promo_id
       ) VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?)`,
    )
    .bind(
      licenseId,
      options.code || mintHalfOffCode(),
      maxUses,
      now.toISOString(),
      account?.accountId ?? null,
      options.couponId || null,
      typeof options.percentOff === 'number' ? options.percentOff : null,
      options.promoId || null,
    )
    .run();
}

const HALF_OFF_COLUMNS = `license_id AS licenseId, code, max_uses AS maxUses, instructor_uses AS instructorUses, student_uses AS studentUses,
  account_id AS accountId, coupon_id AS couponId, percent_off AS percentOff, promo_id AS promoId`;

export async function readHalfOffCode(db: D1Database, licenseId: string): Promise<HalfOffRow | null> {
  try {
    return await db
      .prepare(`SELECT ${HALF_OFF_COLUMNS} FROM half_off_codes WHERE license_id = ?`)
      .bind(licenseId)
      .first<HalfOffRow>();
  } catch {
    try {
      return await db
        .prepare(
          `SELECT license_id AS licenseId, code, max_uses AS maxUses, instructor_uses AS instructorUses, student_uses AS studentUses
           FROM half_off_codes WHERE license_id = ?`,
        )
        .bind(licenseId)
        .first<HalfOffRow>();
    } catch {
      return null;
    }
  }
}

/** One Student Edition redemption of this promotion code. Stops at max_uses. Does not charge. */
export async function noteHalfOffRedemption(db: D1Database, promoId: string): Promise<void> {
  if (!promoId.startsWith('promo_')) return;
  try {
    await db
      .prepare(
        `UPDATE half_off_codes
         SET student_uses = student_uses + 1
         WHERE promo_id = ? AND instructor_uses + student_uses < max_uses`,
      )
      .bind(promoId)
      .run();
  } catch {
    /* The column arrives with migration 0006. A purchase still grants Student Edition. */
  }
}

export async function instructorAllowanceForLicense(db: D1Database, licenseId: string): Promise<number> {
  const row = await readHalfOffCode(db, licenseId);
  return instructorSeatAllowance(row?.instructorUses ?? 0);
}
