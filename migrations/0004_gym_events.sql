-- Academy event log for Advantage Cloud seats.
-- One row per event id. A second push of the same id is ignored.
-- Apply with: npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0004_gym_events.sql
-- No new binding. This table is in the existing D1 database advantage-entitlements,
-- already bound as ENTITLEMENTS_DB. Do not create another database.

CREATE TABLE IF NOT EXISTS gym_events (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  seat_id TEXT NOT NULL,
  type TEXT NOT NULL,
  at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS gym_events_license_type_at ON gym_events (license_id, type, at);
CREATE INDEX IF NOT EXISTS gym_events_license_recorded ON gym_events (license_id, recorded_at);
