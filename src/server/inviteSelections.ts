/**
 * What the instructor selected when making an invite, stored server-side.
 *
 * Before this, a Student code stored only its gym and email hash, and an
 * instructor seat stored only its preset name. The owner's permission switches
 * lived in the owner's browser (instructorSeats.ts) and never reached the
 * instructor's device. This table keeps the exact selection so every sign-in
 * restores it (loginAccount.ts).
 *
 * Every write is best-effort: before migrations/0009_email_login.sql is applied
 * the table is missing, and issuing an invite must keep working exactly as it
 * does today.
 */

import type { D1Database } from './d1.ts';

export type InviteKind = 'student-code' | 'seat';

/** Same keys as InstructorPermissions in src/lib/instructorSeats.ts. Unknown keys are dropped. */
export const INVITE_FEATURE_KEYS = [
  'galleryUpload',
  'dailyLessonPlanAccess',
  'rosterSubmit',
  'rosterPull',
  'downloadTodaysVideos',
  'uploadForDistribution',
  'eventsAccess',
  'proShopAccess',
  'dailyVideoUpload',
] as const;

export type InviteFeatures = Partial<Record<(typeof INVITE_FEATURE_KEYS)[number], boolean>>;

const ALL_ON: InviteFeatures = Object.fromEntries(INVITE_FEATURE_KEYS.map((key) => [key, true]));

/**
 * Factory switches per seat preset. Mirrors INSTRUCTOR_PRESETS in src/lib/instructorSeats.ts
 * (kept here so server code does not import browser modules). Used only when a seat was
 * issued before switches were stored server-side, so the seat restores its preset's menus.
 */
export const SEAT_PRESET_FEATURES: Record<string, InviteFeatures> = {
  'assistant-coach': {
    galleryUpload: false, dailyLessonPlanAccess: true, rosterSubmit: false, rosterPull: false, downloadTodaysVideos: true,
    uploadForDistribution: true, eventsAccess: false, proShopAccess: false, dailyVideoUpload: false,
  },
  'program-director': {
    galleryUpload: true, dailyLessonPlanAccess: false, rosterSubmit: false, rosterPull: false, downloadTodaysVideos: false,
    uploadForDistribution: false, eventsAccess: true, proShopAccess: true, dailyVideoUpload: true,
  },
  coach: {
    galleryUpload: false, dailyLessonPlanAccess: true, rosterSubmit: true, rosterPull: true, downloadTodaysVideos: true,
    uploadForDistribution: true, eventsAccess: false, proShopAccess: false, dailyVideoUpload: false,
  },
  instructors: ALL_ON,
};

/** Stored switches when the owner's pick was saved, otherwise the preset's factory switches. */
export function seatFeatures(selection: Pick<InviteSelection, 'features' | 'preset'>): { features: InviteFeatures; source: 'stored' | 'preset' | 'none' } {
  if (Object.keys(selection.features).length) return { features: selection.features, source: 'stored' };
  const preset = selection.preset ? SEAT_PRESET_FEATURES[selection.preset] : undefined;
  return preset ? { features: { ...preset }, source: 'preset' } : { features: {}, source: 'none' };
}

const EDITION_KEYS = new Set(['white', 'student', 'coach', 'pro', 'media']);

export type InviteSelection = {
  kind: InviteKind;
  ref: string;
  gym: string;
  issuerId: string | null;
  emailHash: string | null;
  preset: string | null;
  editions: string[];
  features: InviteFeatures;
  createdAt: string;
  redeemedAt: string | null;
  redeemedLicenseId: string | null;
};

export function cleanFeatures(value: unknown): InviteFeatures {
  const out: InviteFeatures = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  const row = value as Record<string, unknown>;
  for (const key of INVITE_FEATURE_KEYS) {
    if (typeof row[key] === 'boolean') out[key] = row[key] as boolean;
  }
  return out;
}

/** Editions the invite may open, limited to `allowed` (what this kind of invite can grant). */
export function cleanEditions(value: unknown, allowed: readonly string[]): string[] {
  const list = Array.isArray(value) ? value : [];
  const picked = list.filter((item): item is string => typeof item === 'string' && EDITION_KEYS.has(item) && allowed.includes(item));
  const unique = [...new Set(picked)];
  return unique.length ? unique : [...allowed];
}

export async function recordInviteSelection(
  db: D1Database,
  input: Omit<InviteSelection, 'redeemedAt' | 'redeemedLicenseId' | 'createdAt'> & { now: Date },
): Promise<boolean> {
  try {
    await db
      .prepare(
        `INSERT INTO invite_selections
           (invite_kind, invite_ref, gym_license_id, issuer_id, email_hash, preset, editions, features, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(invite_kind, invite_ref) DO UPDATE SET
           issuer_id = excluded.issuer_id, email_hash = COALESCE(excluded.email_hash, invite_selections.email_hash),
           preset = excluded.preset, editions = excluded.editions, features = excluded.features`,
      )
      .bind(
        input.kind,
        input.ref,
        input.gym,
        input.issuerId,
        input.emailHash,
        input.preset,
        JSON.stringify(input.editions),
        JSON.stringify(input.features),
        input.now.toISOString(),
      )
      .run();
    return true;
  } catch {
    return false;
  }
}

export async function markInviteRedeemed(
  db: D1Database,
  kind: InviteKind,
  ref: string,
  licenseId: string | null,
  now: Date,
): Promise<void> {
  try {
    await db
      .prepare(
        `UPDATE invite_selections SET redeemed_at = COALESCE(redeemed_at, ?), redeemed_license_id = COALESCE(?, redeemed_license_id)
         WHERE invite_kind = ? AND invite_ref = ?`,
      )
      .bind(now.toISOString(), licenseId, kind, ref)
      .run();
  } catch {
    /* table not applied yet */
  }
}

type Row = {
  kind: InviteKind;
  ref: string;
  gym: string;
  issuerId: string | null;
  emailHash: string | null;
  preset: string | null;
  editions: string;
  features: string;
  createdAt: string;
  redeemedAt: string | null;
  redeemedLicenseId: string | null;
};

const COLUMNS = `invite_kind AS kind, invite_ref AS ref, gym_license_id AS gym, issuer_id AS issuerId, email_hash AS emailHash,
  preset, editions, features, created_at AS createdAt, redeemed_at AS redeemedAt, redeemed_license_id AS redeemedLicenseId`;

function fromRow(row: Row): InviteSelection {
  let editions: string[] = [];
  let features: InviteFeatures = {};
  try {
    const parsed = JSON.parse(row.editions) as unknown;
    editions = Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    editions = [];
  }
  try {
    features = cleanFeatures(JSON.parse(row.features));
  } catch {
    features = {};
  }
  return { ...row, editions, features };
}

export async function readInviteSelection(db: D1Database, kind: InviteKind, ref: string): Promise<InviteSelection | null> {
  try {
    const row = await db
      .prepare(`SELECT ${COLUMNS} FROM invite_selections WHERE invite_kind = ? AND invite_ref = ? LIMIT 1`)
      .bind(kind, ref)
      .first<Row>();
    return row ? fromRow(row) : null;
  } catch {
    return null;
  }
}

export async function inviteSelectionsForEmail(db: D1Database, emailHash: string, kind: InviteKind): Promise<InviteSelection[]> {
  try {
    const rows = await db
      .prepare(`SELECT ${COLUMNS} FROM invite_selections WHERE email_hash = ? AND invite_kind = ? ORDER BY created_at DESC`)
      .bind(emailHash, kind)
      .all<Row>();
    return rows.results.map(fromRow);
  } catch {
    return [];
  }
}
