-- Extra Student profile slots, and academy half-off code details.
-- One row per paid extra profile. The first profile is free and has no row.
-- Switching profiles does not add or remove a row.
-- half_off_codes gains the account, the Stripe coupon id, that coupon's percent,
-- and the promotion code id. A later coupon id can replace the percent.
--
-- Apply once, by hand, to the existing advantage-entitlements database:
--   npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0006_profile_slots.sql
-- Do not apply this from a deploy, and do not create another database.

CREATE TABLE IF NOT EXISTS profile_slots (
  session_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS profile_slots_account ON profile_slots(account_id);

ALTER TABLE half_off_codes ADD COLUMN account_id TEXT;
ALTER TABLE half_off_codes ADD COLUMN coupon_id TEXT;
ALTER TABLE half_off_codes ADD COLUMN percent_off INTEGER;
ALTER TABLE half_off_codes ADD COLUMN promo_id TEXT;
