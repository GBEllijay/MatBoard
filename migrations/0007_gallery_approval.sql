-- License-level gallery approval for Advantage Cloud uploads.
-- Default is on: if no row exists, coach and Instructors seat uploads stay pending.
-- Only the gym owner can change this. Seats cannot.
-- Apply once, by hand, to the existing advantage-entitlements database:
--   npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0007_gallery_approval.sql
-- Do not apply this from a deploy, and do not create another database.

CREATE TABLE IF NOT EXISTS gallery_approval (
  license_id TEXT PRIMARY KEY,
  required INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
