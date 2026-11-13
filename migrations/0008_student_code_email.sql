-- Student Edition invite emails. The address is stored only as a hash so
-- Restore can find the license after the student claims. No plaintext email.
-- Apply once, by hand, to the existing advantage-entitlements database:
--   npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0008_student_code_email.sql
-- Apply this before merging. Do not apply it from a deploy.

ALTER TABLE student_codes ADD COLUMN email_hash TEXT;
CREATE INDEX IF NOT EXISTS student_codes_email_hash ON student_codes(email_hash);
