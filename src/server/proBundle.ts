/**
 * Pro purchase bundle. Five free instructor seats, five free Student Edition
 * licenses, and one half-off code with 100 uses shared by those two products.
 * The code is an app row. This module does not create a Stripe price, coupon, or product.
 */

import type { D1Database } from './d1.ts';
import {
  BUNDLE_CEILING,
  FREE_INSTRUCTOR_SEATS,
  FREE_STUDENT_LICENSES,
  HALF_OFF_MAX_USES,
  instructorSeatAllowance,
  studentLicenseAllowance,
} from '../lib/proBundleMath.ts';

export {
  BUNDLE_CEILING,
  FREE_INSTRUCTOR_SEATS,
  FREE_STUDENT_LICENSES,
  HALF_OFF_MAX_USES,
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
};

function mintCode(): string {
  const raw = crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
  return `ADVH-${raw}`;
}

/** Write the row once per Pro license. A second call keeps the original code. Does not log the code. */
export async function ensureHalfOffCode(db: D1Database, licenseId: string, now = new Date()): Promise<void> {
  if (!licenseId) return;
  const existing = await db
    .prepare(`SELECT license_id AS licenseId FROM half_off_codes WHERE license_id = ?`)
    .bind(licenseId)
    .first<{ licenseId: string }>();
  if (existing) return;
  await db
    .prepare(
      `INSERT INTO half_off_codes (license_id, code, max_uses, instructor_uses, student_uses, created_at)
       VALUES (?, ?, ?, 0, 0, ?)`,
    )
    .bind(licenseId, mintCode(), HALF_OFF_MAX_USES, now.toISOString())
    .run();
}

export async function readHalfOffCode(db: D1Database, licenseId: string): Promise<HalfOffRow | null> {
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

export async function instructorAllowanceForLicense(db: D1Database, licenseId: string): Promise<number> {
  const row = await readHalfOffCode(db, licenseId);
  return instructorSeatAllowance(row?.instructorUses ?? 0);
}
