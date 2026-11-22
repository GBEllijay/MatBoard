-- Published class schedule, student "I plan to attend" / "I was here" marks,
-- and absentee recap requests. One gym (license) has one published schedule.
-- Apply with: npx wrangler d1 execute advantage-entitlements --remote --file=migrations/0010_gym_schedule.sql
-- No new binding. This table is in the existing D1 database advantage-entitlements,
-- already bound as ENTITLEMENTS_DB. Do not create another database.
-- This file is not applied by the draft PR. The gym owner applies it on Zoe.

CREATE TABLE IF NOT EXISTS gym_schedule (
  license_id TEXT PRIMARY KEY,
  schedule_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  published_by TEXT NOT NULL
);

-- status: planned | cancelled | attended | missed
-- student_id is the Student Edition stable id, never an email.
-- display_name is a short name only; never store an email address here.
CREATE TABLE IF NOT EXISTS gym_class_rsvps (
  license_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  class_date TEXT NOT NULL,
  student_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (license_id, slot_id, class_date, student_id)
);

CREATE INDEX IF NOT EXISTS gym_class_rsvps_license_date
  ON gym_class_rsvps (license_id, class_date, slot_id);

-- Binds a signed-in student license (claims.sub) to one Student Edition id per gym.
CREATE TABLE IF NOT EXISTS gym_schedule_identities (
  license_id TEXT NOT NULL,
  student_license_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (license_id, student_license_id),
  UNIQUE (license_id, student_id)
);

-- status: requested | sent | declined
-- reason: missed | traveling | ''
CREATE TABLE IF NOT EXISTS gym_class_absentee_requests (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  slot_id TEXT NOT NULL,
  class_date TEXT NOT NULL,
  student_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS gym_class_absentee_license_date
  ON gym_class_absentee_requests (license_id, class_date, slot_id);
