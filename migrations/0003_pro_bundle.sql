-- Pro bundle. One half-off code per Pro license, plus student codes.
-- The webhook writes the half-off row. This file does not create a Stripe coupon.
-- Apply with: npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0003_pro_bundle.sql

CREATE TABLE IF NOT EXISTS half_off_codes (
  license_id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 100,
  instructor_uses INTEGER NOT NULL DEFAULT 0,
  student_uses INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_codes (
  code TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  issuing_seat_id TEXT,
  status TEXT NOT NULL,
  claimed_device TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS student_codes_license ON student_codes(license_id);
