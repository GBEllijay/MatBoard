-- Stable account ids. One opaque id per purchaser or user.
-- The id is immutable. License keys and R2 prefixes are not rewritten.
-- A later verified email can change email_normalized. The id does not change.
-- Existing rows are not backfilled here. The next verified access or redeem
-- links a license that has no account id, and does not create a new license.
--
-- Apply once, by hand, to the existing advantage-entitlements database:
--   npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0005_accounts.sql
-- Do not apply this from a deploy, and do not create another database.

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email_normalized TEXT,
  email_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_normalized
  ON accounts(email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_hash
  ON accounts(email_hash)
  WHERE email_hash IS NOT NULL;

ALTER TABLE licenses ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS licenses_account_id ON licenses(account_id);

ALTER TABLE identities ADD COLUMN account_id TEXT;
CREATE INDEX IF NOT EXISTS identities_account_id ON identities(account_id);

ALTER TABLE seats ADD COLUMN account_id TEXT;
