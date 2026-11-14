-- Email + password sign-in, long-lived sessions, and what an instructor picked on an invite.
-- Email is the username. It is stored only as the same peppered email_hash used by identities,
-- accounts, and student_codes. No plaintext address is stored here; email_mask is a display hint
-- such as "pa•••@gmail.com".
--
-- Apply once, by hand, to the existing advantage-entitlements database BEFORE merging:
--   npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0009_email_login.sql
-- Do not apply this from a deploy, and do not create another database.

-- One password per email. password_hash is versioned: pbkdf2-sha256$<iterations>$<salt b64url>$<hash b64url>.
-- mfa_* columns are reserved for a later second factor. Nothing reads or writes them yet.
CREATE TABLE IF NOT EXISTS login_passwords (
  email_hash TEXT PRIMARY KEY,
  account_id TEXT,
  license_id TEXT,
  password_hash TEXT NOT NULL,
  email_mask TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  mfa_kind TEXT,
  mfa_secret TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Server-side sessions. The cookie carries a random token; only its hash is stored.
-- Sign out sets revoked_at. A password reset revokes every session for that email.
CREATE TABLE IF NOT EXISTS login_sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  mfa_verified_at TEXT
);
CREATE INDEX IF NOT EXISTS login_sessions_email ON login_sessions(email_hash);

-- Exactly what the instructor selected when making an invite (Student code or instructor seat).
-- Written at issue time, marked at redemption, read on every sign-in.
-- invite_kind: 'student-code' (invite_ref = student_codes.code) or 'seat' (invite_ref = seats.id).
-- editions and features are JSON. Revocation is read from student_codes / seats, not copied here.
CREATE TABLE IF NOT EXISTS invite_selections (
  invite_kind TEXT NOT NULL,
  invite_ref TEXT NOT NULL,
  gym_license_id TEXT NOT NULL,
  issuer_id TEXT,
  email_hash TEXT,
  preset TEXT,
  editions TEXT NOT NULL,
  features TEXT NOT NULL,
  created_at TEXT NOT NULL,
  redeemed_at TEXT,
  redeemed_license_id TEXT,
  PRIMARY KEY (invite_kind, invite_ref)
);
CREATE INDEX IF NOT EXISTS invite_selections_email ON invite_selections(email_hash);
