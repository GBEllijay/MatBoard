import { keyedHash } from './codeCrypto.ts';
import type { D1Database } from './d1.ts';
import { grantsForProduct } from './grantMatrix.ts';
import { normalizeEmail } from './entitlements.ts';

export type PurchaseSource = 'stripe_payment' | 'stripe_subscription' | 'code' | 'free' | 'owner';

export type PurchaseWrite = {
  email: string;
  product: string;
  source: PurchaseSource;
  sourceRef: string;
  sessionId: string;
  subscriptionId?: string;
  stripeCustomerId?: string;
  endsAt?: string | null;
  status?: 'active' | 'inactive';
  pepper: string;
  now: Date;
};

export type StoredGrant = {
  licenseId: string;
  product: string;
  source: string;
  sourceRef: string | null;
  status: string;
  endsAt: string | null;
  revokedAt: string | null;
};

function id(): string {
  return crypto.randomUUID();
}

async function emailHash(email: string, pepper: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized || !pepper) return null;
  return keyedHash(normalized, pepper, 'email');
}

export async function emailHint(email: string, pepper: string): Promise<string | undefined> {
  const hash = await emailHash(email, pepper);
  return hash ? hash.slice(0, 16) : undefined;
}

/**
 * Insert one grant row. Two overlapping checkouts write two rows.
 * The same session and product is stored once.
 */
export async function recordPurchase(db: D1Database, input: PurchaseWrite): Promise<{ licenseId: string }> {
  const now = input.now.toISOString();
  const hash = await emailHash(input.email, input.pepper);
  const existing = await db
    .prepare(
      `SELECT license_id AS licenseId FROM grants WHERE source = ? AND source_ref = ? AND product = ? LIMIT 1`,
    )
    .bind(input.source, input.sourceRef, input.product)
    .first<{ licenseId: string }>();
  let licenseId = existing?.licenseId ?? '';
  if (!licenseId && hash) {
    const identity = await db
      .prepare(`SELECT license_id AS licenseId FROM identities WHERE email_hash = ? LIMIT 1`)
      .bind(hash)
      .first<{ licenseId: string }>();
    licenseId = identity?.licenseId ?? '';
  }
  if (!licenseId && input.subscriptionId) {
    const subscription = await db
      .prepare(`SELECT license_id AS licenseId FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1`)
      .bind(input.subscriptionId)
      .first<{ licenseId: string }>();
    licenseId = subscription?.licenseId ?? '';
  }
  if (!licenseId) {
    licenseId = id();
    await db.prepare(`INSERT INTO licenses (id, created_at) VALUES (?, ?)`).bind(licenseId, now).run();
  }
  if (hash) {
    const identity = await db
      .prepare(`SELECT id FROM identities WHERE email_hash = ? LIMIT 1`)
      .bind(hash)
      .first<{ id: number }>();
    if (!identity) {
      await db
        .prepare(`INSERT INTO identities (license_id, email_hash, stripe_customer_id, created_at) VALUES (?, ?, ?, ?)`)
        .bind(licenseId, hash, input.stripeCustomerId || null, now)
        .run();
    }
  } else if (input.stripeCustomerId) {
    const identity = await db
      .prepare(`SELECT id FROM identities WHERE stripe_customer_id = ? LIMIT 1`)
      .bind(input.stripeCustomerId)
      .first<{ id: number }>();
    if (!identity) {
      await db
        .prepare(`INSERT INTO identities (license_id, stripe_customer_id, created_at) VALUES (?, ?, ?)`)
        .bind(licenseId, input.stripeCustomerId, now)
        .run();
    }
  }
  const status = input.status ?? 'active';
  await db
    .prepare(
      `INSERT INTO grants (id, license_id, product, source, source_ref, status, created_at, ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source, source_ref, product) DO UPDATE SET
         status = excluded.status,
         ends_at = excluded.ends_at,
         revoked_at = CASE WHEN excluded.status = 'inactive' THEN excluded.created_at ELSE grants.revoked_at END`,
    )
    .bind(id(), licenseId, input.product, input.source, input.sourceRef, status, now, input.endsAt ?? null)
    .run();
  if (input.subscriptionId) {
    await db
      .prepare(
        `INSERT INTO subscriptions (
           stripe_subscription_id, license_id, status, cancel_at_period_end, last_event_at, last_synced_at
         ) VALUES (?, ?, ?, 0, ?, ?)
         ON CONFLICT(stripe_subscription_id) DO UPDATE SET
           status = excluded.status,
           last_event_at = excluded.last_event_at,
           last_synced_at = excluded.last_synced_at`,
      )
      .bind(input.subscriptionId, licenseId, status, now, now)
      .run();
  }
  return { licenseId };
}

export async function grantsForLicense(db: D1Database, licenseId: string, now: Date): Promise<StoredGrant[]> {
  const rows = await db
    .prepare(
      `SELECT license_id AS licenseId, product, source, source_ref AS sourceRef, status, ends_at AS endsAt, revoked_at AS revokedAt
       FROM grants WHERE license_id = ?`,
    )
    .bind(licenseId)
    .all<StoredGrant>();
  return rows.results.filter((row) => grantOpen(row, now));
}

export function grantOpen(row: StoredGrant, now: Date): boolean {
  if (row.revokedAt) return false;
  if (row.status === 'inactive') return false;
  if (row.endsAt && Date.parse(row.endsAt) <= now.getTime()) return false;
  return true;
}

export async function licenseIdForEmail(db: D1Database, email: string, pepper: string): Promise<string | null> {
  const hash = await emailHash(email, pepper);
  if (!hash) return null;
  const row = await db
    .prepare(`SELECT license_id AS licenseId FROM identities WHERE email_hash = ? LIMIT 1`)
    .bind(hash)
    .first<{ licenseId: string }>();
  return row?.licenseId ?? null;
}

export async function licenseIdForSource(db: D1Database, sourceRef: string): Promise<string | null> {
  const row = await db
    .prepare(`SELECT license_id AS licenseId FROM grants WHERE source_ref = ? LIMIT 1`)
    .bind(sourceRef)
    .first<{ licenseId: string }>();
  return row?.licenseId ?? null;
}

export function doorsFromStored(rows: readonly StoredGrant[]): string[] {
  const doors = new Set<string>();
  for (const row of rows) {
    for (const door of grantsForProduct(row.product)) doors.add(door);
  }
  return [...doors];
}

export async function countActiveDevices(db: D1Database, licenseId: string, now: Date, activeDays: number): Promise<number> {
  const since = new Date(now.getTime() - activeDays * 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total FROM devices
       WHERE license_id = ? AND revoked_at IS NULL AND last_seen >= ?`,
    )
    .bind(licenseId, since)
    .first<{ total: number }>();
  return Number(row?.total ?? 0);
}

export async function touchDevice(
  db: D1Database,
  input: { licenseId: string; deviceId: string; thumbprint: string | null; now: Date },
): Promise<{ known: boolean }> {
  const stamp = input.now.toISOString();
  const existing = await db
    .prepare(`SELECT device_id AS deviceId, revoked_at AS revokedAt FROM devices WHERE license_id = ? AND device_id = ?`)
    .bind(input.licenseId, input.deviceId)
    .first<{ deviceId: string; revokedAt: string | null }>();
  if (existing?.revokedAt) return { known: false };
  if (existing) {
    await db
      .prepare(
        `UPDATE devices SET last_seen = ?, public_key_thumbprint = COALESCE(?, public_key_thumbprint)
         WHERE license_id = ? AND device_id = ?`,
      )
      .bind(stamp, input.thumbprint, input.licenseId, input.deviceId)
      .run();
    return { known: true };
  }
  await db
    .prepare(
      `INSERT INTO devices (license_id, device_id, public_key_thumbprint, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(input.licenseId, input.deviceId, input.thumbprint, stamp, stamp)
    .run();
  return { known: false };
}

export async function revokeOtherDevices(db: D1Database, licenseId: string, deviceId: string, now: Date): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE devices SET revoked_at = ? WHERE license_id = ? AND device_id <> ? AND revoked_at IS NULL`,
    )
    .bind(now.toISOString(), licenseId, deviceId)
    .run();
  return result.meta.changes;
}

export async function bumpRate(
  db: D1Database,
  bucket: string,
  limit: number,
  nowMs: number,
  windowMs: number,
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT count, reset_at AS resetAt FROM rate_counters WHERE bucket = ?`)
    .bind(bucket)
    .first<{ count: number; resetAt: number }>();
  if (!row || Number(row.resetAt) <= nowMs) {
    await db
      .prepare(
        `INSERT INTO rate_counters (bucket, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(bucket) DO UPDATE SET count = 1, reset_at = excluded.reset_at`,
      )
      .bind(bucket, nowMs + windowMs)
      .run();
    return true;
  }
  if (Number(row.count) >= limit) return false;
  const updated = await db
    .prepare(`UPDATE rate_counters SET count = count + 1 WHERE bucket = ? AND count < ?`)
    .bind(bucket, limit)
    .run();
  return updated.meta.changes > 0;
}
