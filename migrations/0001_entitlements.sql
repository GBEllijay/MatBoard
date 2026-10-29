-- Advantage entitlement records. One row per license, grant, device, and restore code.
-- Apply with: npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0001_entitlements.sql
-- Do not put secrets, emails, or unlock codes in this file.

CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS identities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  license_id TEXT NOT NULL,
  email_hash TEXT,
  stripe_customer_id TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS identities_email_hash ON identities(email_hash) WHERE email_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS identities_stripe_customer ON identities(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  product TEXT NOT NULL,
  source TEXT NOT NULL,
  source_ref TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  ends_at TEXT,
  revoked_at TEXT,
  reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS grants_source_product ON grants(source, source_ref, product);

CREATE TABLE IF NOT EXISTS subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  status TEXT NOT NULL,
  price_id TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  current_period_end TEXT,
  past_due_since TEXT,
  last_event_at TEXT,
  last_synced_at TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  license_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  public_key_thumbprint TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  revoked_at TEXT,
  PRIMARY KEY (license_id, device_id)
);

-- Seat rows are reserved for Phase 3. Phase 2 does not enforce them.
CREATE TABLE IF NOT EXISTS seats (
  id TEXT PRIMARY KEY,
  gym_license_id TEXT NOT NULL,
  preset TEXT,
  status TEXT NOT NULL,
  claimed_device TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS restore_challenges (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  email_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_counters (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
