-- Phase 3 instructor seats. Apply after 0001. Do not edit 0001.
-- The email column is a label for the invited person, not a login.
-- Paste this file into the D1 console, or:
--   npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0002_seats.sql

ALTER TABLE seats ADD COLUMN email_label TEXT;
ALTER TABLE seats ADD COLUMN invite_expires_at TEXT;
ALTER TABLE seats ADD COLUMN claimed_at TEXT;
ALTER TABLE seats ADD COLUMN legacy INTEGER NOT NULL DEFAULT 0;
ALTER TABLE seats ADD COLUMN sunset_at TEXT;
ALTER TABLE seats ADD COLUMN invite_nonce TEXT;
