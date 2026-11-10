/**
 * One opaque account id per purchaser or user.
 * The id is created once and never rewritten. Licenses, grants, the owner
 * academy, and instructor seats hang off it. License keys and R2 prefixes
 * (groups/{license}/...) are not renamed.
 * A verified email can change later. The id stays, so the same academy is found.
 * The id is not a password. Recovery is the emailed code the restore page
 * already sends. The id alone, or an email that has not been verified, does
 * not sign a device in.
 */

import { keyedHash, normalizeEmail } from './codeCrypto.ts';
import type { D1Database } from './d1.ts';
import { API_PRODUCT_PRO } from './routes.ts';

const OWNER_ACADEMY_REF = 'owner-academy';

export type AccountLink = {
  accountId: string;
  /** Normalized address stored on the account, when one is known. */
  email: string | null;
};

function stampOf(now: Date): string {
  return now.toISOString();
}

/** Empty when the address cannot be stored. Gmail dots and plus-tags collapse. */
export function accountEmail(raw: string | undefined | null): string {
  if (typeof raw !== 'string') return '';
  const normalized = normalizeEmail(raw);
  if (!normalized.includes('@') || /\s/.test(normalized) || normalized.length > 320) return '';
  return normalized;
}

async function emailHash(email: string, pepper: string | undefined): Promise<string | null> {
  const pepperTrimmed = pepper?.trim() ?? '';
  if (!email || !pepperTrimmed) return null;
  return keyedHash(email, pepperTrimmed, 'email');
}

function isUniqueConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unique/i.test(message);
}

type AccountRow = { id: string; email: string | null; emailHash: string | null };

async function accountById(db: D1Database, accountId: string): Promise<AccountRow | null> {
  return db
    .prepare(`SELECT id, email_normalized AS email, email_hash AS emailHash FROM accounts WHERE id = ? LIMIT 1`)
    .bind(accountId)
    .first<AccountRow>();
}

async function accountByEmail(db: D1Database, email: string, hash: string | null): Promise<AccountRow | null> {
  if (hash) {
    const byHash = await db
      .prepare(`SELECT id, email_normalized AS email, email_hash AS emailHash FROM accounts WHERE email_hash = ? LIMIT 1`)
      .bind(hash)
      .first<AccountRow>();
    if (byHash) return byHash;
  }
  if (!email) return null;
  return db
    .prepare(`SELECT id, email_normalized AS email, email_hash AS emailHash FROM accounts WHERE email_normalized = ? LIMIT 1`)
    .bind(email)
    .first<AccountRow>();
}

/**
 * The license this account already has. The owner academy wins when this
 * account has one, so recovery does not mint a second academy.
 * Null when the account has no license yet. Callers must not insert one.
 */
export async function primaryLicenseForAccount(db: D1Database, accountId: string): Promise<string | null> {
  const owner = await db
    .prepare(
      `SELECT l.id AS licenseId
       FROM licenses l
       JOIN grants g ON g.license_id = l.id
       WHERE l.account_id = ? AND g.source = 'owner' AND g.source_ref = ? AND g.product = ?
       LIMIT 1`,
    )
    .bind(accountId, OWNER_ACADEMY_REF, API_PRODUCT_PRO)
    .first<{ licenseId: string }>();
  if (owner?.licenseId) return owner.licenseId;
  const any = await db
    .prepare(`SELECT id AS licenseId FROM licenses WHERE account_id = ? ORDER BY created_at ASC LIMIT 1`)
    .bind(accountId)
    .first<{ licenseId: string }>();
  return any?.licenseId ?? null;
}

/** Verified email → the account and license already stored for it. Never creates a row. */
export async function licenseForVerifiedEmail(
  db: D1Database,
  email: string,
  pepper: string | undefined,
): Promise<{ accountId: string; licenseId: string } | null> {
  const normalized = accountEmail(email);
  if (!normalized) return null;
  const account = await accountByEmail(db, normalized, await emailHash(normalized, pepper));
  if (!account) return null;
  const licenseId = await primaryLicenseForAccount(db, account.id);
  if (!licenseId) return null;
  return { accountId: account.id, licenseId };
}

async function insertAccount(
  db: D1Database,
  input: { email: string; hash: string | null; now: Date },
): Promise<string> {
  const id = crypto.randomUUID();
  const stamp = stampOf(input.now);
  try {
    await db
      .prepare(
        `INSERT INTO accounts (id, email_normalized, email_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(id, input.email || null, input.hash, stamp, stamp)
      .run();
    return id;
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const existing = await accountByEmail(db, input.email, input.hash);
    if (existing) return existing.id;
    throw error;
  }
}

/** True when this account holds the address. A different account keeps its own. */
async function claimEmail(
  db: D1Database,
  accountId: string,
  email: string,
  hash: string | null,
  now: Date,
  replace: boolean,
): Promise<boolean> {
  if (!email) return false;
  const taken = await accountByEmail(db, email, hash);
  if (taken && taken.id !== accountId) return false;
  const account = await accountById(db, accountId);
  if (!account) return false;
  if (account.email === email && account.emailHash === hash) return true;
  if (account.email && !replace) return false;
  const stamp = stampOf(now);
  try {
    await db
      .prepare(
        `UPDATE accounts
         SET email_normalized = ?, email_hash = ?, updated_at = ?
         WHERE id = ? AND (? = 1 OR email_normalized IS NULL)`,
      )
      .bind(email, hash, stamp, accountId, replace ? 1 : 0)
      .run();
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    return false;
  }
  return true;
}

async function rememberIdentity(
  db: D1Database,
  input: { licenseId: string; accountId: string; hash: string | null; now: Date },
): Promise<void> {
  if (!input.hash) return;
  const existing = await db
    .prepare(`SELECT id, license_id AS licenseId FROM identities WHERE email_hash = ? LIMIT 1`)
    .bind(input.hash)
    .first<{ id: number; licenseId: string }>();
  if (!existing) {
    try {
      await db
        .prepare(
          `INSERT INTO identities (license_id, email_hash, created_at, account_id) VALUES (?, ?, ?, ?)`,
        )
        .bind(input.licenseId, input.hash, stampOf(input.now), input.accountId)
        .run();
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
    }
    return;
  }
  if (existing.licenseId !== input.licenseId) return;
  await db
    .prepare(`UPDATE identities SET account_id = ? WHERE id = ? AND (account_id IS NULL OR account_id = ?)`)
    .bind(input.accountId, existing.id, input.accountId)
    .run();
}

async function linkSeats(db: D1Database, licenseId: string, accountId: string): Promise<void> {
  await db
    .prepare(`UPDATE seats SET account_id = ? WHERE gym_license_id = ? AND account_id IS NULL`)
    .bind(accountId, licenseId)
    .run();
}

/**
 * Link this existing license to one account id.
 * Does not insert a license, does not change a license id, and does not move
 * a license that already has a different account id.
 * replaceEmail is for a verified address change on this same account.
 */
export async function ensureAccountForLicense(
  db: D1Database,
  input: { licenseId: string; email?: string; pepper?: string; now: Date; replaceEmail?: boolean },
): Promise<AccountLink | null> {
  const license = await db
    .prepare(`SELECT id, account_id AS accountId FROM licenses WHERE id = ? LIMIT 1`)
    .bind(input.licenseId)
    .first<{ id: string; accountId: string | null }>();
  if (!license) return null;
  const email = accountEmail(input.email);
  const hash = await emailHash(email, input.pepper);
  let accountId = license.accountId ?? '';
  if (!accountId && (email || hash)) {
    const taken = await accountByEmail(db, email, hash);
    if (taken) {
      const takenLicense = await primaryLicenseForAccount(db, taken.id);
      if (!takenLicense || takenLicense === input.licenseId) accountId = taken.id;
    }
  }
  if (!accountId) {
    accountId = await insertAccount(db, {
      email: '',
      hash: null,
      now: input.now,
    });
  }
  await db
    .prepare(`UPDATE licenses SET account_id = ? WHERE id = ? AND (account_id IS NULL OR account_id = ?)`)
    .bind(accountId, input.licenseId, accountId)
    .run();
  const linked = await db
    .prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ?`)
    .bind(input.licenseId)
    .first<{ accountId: string | null }>();
  if (linked?.accountId) accountId = linked.accountId;
  const claimed = await claimEmail(db, accountId, email, hash, input.now, input.replaceEmail === true);
  if (claimed) await rememberIdentity(db, { licenseId: input.licenseId, accountId, hash, now: input.now });
  await linkSeats(db, input.licenseId, accountId);
  const account = await accountById(db, accountId);
  return { accountId, email: account?.email ?? null };
}
