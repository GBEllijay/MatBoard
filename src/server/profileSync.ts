/**
 * Signed-in account sync. GET/PUT /api/login/sync, authenticated by the
 * login session cookie (Path=/api/login).
 *
 * JSON documents live in the existing GYM_MEDIA bucket, on new keys only:
 *   groups/{licenseId}/account-sync/academy-profile.json
 *   accounts/{accountId}/account-sync/academy-profile.json   (no license yet)
 *   accounts/{accountId}/account-sync/profiles.json
 *   accounts/{accountId}/account-sync/profiles/{profileId}/student.json
 *   accounts/{accountId}/account-sync/technique-tree.json   (coach's own trees)
 *   groups/{licenseId}/account-sync/class-schedule.json      (owner's Class Schedule)
 *   accounts/{accountId}/account-sync/class-schedule.json    (no license yet)
 *
 * No D1 migration. Last write wins per document by updatedAt, except the
 * Technique Tree doc, which is merged per tree and per link (see
 * techniqueTreeSync.ts). The tree doc is per account only; it is never put in
 * a student doc, so nothing flows from an instructor to a student. An empty
 * incoming document never overwrites a document that already has data.
 * Only the academy owner can read or write the academy profile, so every
 * owner device on that license shares it. Student docs are per account and
 * per family profile. Videos are not stored here.
 */

import type { D1Database } from './d1.ts';
import { primaryLicenseForAccount } from './accountId.ts';
import {
  academyDocIsEmpty,
  preserveStudentBasics,
  profilesDocIsEmpty,
  studentBasicsIsMeaningful,
  studentDocIsEmpty,
  type AcademySyncDoc,
  type ProfilesSyncDoc,
  type StudentSyncBasics,
  type StudentSyncDoc,
  type StudentSyncRank,
} from '../lib/signedInSyncDocs.ts';
import {
  mergeTreeDocs,
  sameTreeContent,
  sanitizeTreeSyncDoc,
  treeSyncDocIsEmpty,
  TREE_SYNC_MAX_BYTES,
  type TreeSyncDoc,
} from '../lib/techniqueTreeSync.ts';
import {
  sanitizeScheduleSyncDoc,
  scheduleSyncDocIsEmpty,
  SCHEDULE_SYNC_MAX_BYTES,
  type ScheduleSyncDoc,
} from '../lib/scheduleSyncDoc.ts';
import { LOGIN_UNAVAILABLE, readLoginSession, type LoginEnv } from './loginAccount.ts';
import type { InboxBucket } from './studentInbox.ts';

export const ACCOUNT_SYNC_PATH = '/api/login/sync';
export const ACADEMY_SYNC_MAX_BYTES = 700_000;
export const STUDENT_SYNC_MAX_BYTES = 1_500_000;
export const PROFILES_SYNC_MAX_BYTES = 80_000;
export const SYNC_BODY_MAX_CHARS = 2_500_000;
export { TREE_SYNC_MAX_BYTES };
const LOGO_MAX_CHARS = 350_000;
const DEFAULT_STUDENT_PROFILE_ID = 'default';
const PROFILE_ID_RE = /^p[a-z0-9]{10,20}$/;
const GYM_PROFILE_OPT_IN = ['assistant-coach', 'program-director', 'custom'] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FACE_IDS = new Set([
  'guard-control',
  'passing',
  'sweeps',
  'takedowns',
  'escapes-defense',
  'submissions',
  'conditioning',
  'mindset',
  'other',
]);

function isStudentProfileId(id: string): boolean {
  return id === DEFAULT_STUDENT_PROFILE_ID || PROFILE_ID_RE.test(id);
}

function cleanStudentProfileName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, 40);
}

function sanitizeGymProfile(raw: unknown): AcademySyncDoc['profile'] {
  const row = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const founded = typeof row.foundedOn === 'string' ? row.foundedOn.trim().slice(0, 10) : '';
  const rawOptIn = Array.isArray(row.optIn) ? row.optIn : [];
  const profile: AcademySyncDoc['profile'] = {
    v: 1,
    foundedOn: DATE_RE.test(founded) ? founded : '',
    founders: typeof row.founders === 'string' ? row.founders.slice(0, 120) : '',
    lineage: typeof row.lineage === 'string' ? row.lineage.slice(0, 240) : '',
    optIn: GYM_PROFILE_OPT_IN.filter((id) => rawOptIn.includes(id)).map((id) => id),
  };
  if (typeof row.lineageVisible === 'boolean') profile.lineageVisible = row.lineageVisible;
  return profile;
}

function sanitizeIndexCards(raw: unknown): StudentSyncDoc['indexCards'] {
  const cardsIn =
    raw && typeof raw === 'object' && Array.isArray((raw as { cards?: unknown }).cards)
      ? (raw as { cards: unknown[] }).cards
      : [];
  const cards: StudentSyncDoc['indexCards']['cards'] = [];
  const seen = new Set<string>();
  for (const item of cardsIn) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const id = typeof row.id === 'string' ? row.id.trim().slice(0, 80) : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const faceId = typeof row.faceId === 'string' && FACE_IDS.has(row.faceId) ? row.faceId : 'other';
    const card: StudentSyncDoc['indexCards']['cards'][number] = { id, faceId, tree: null };
    if (typeof row.name === 'string') card.name = row.name.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (typeof row.userName === 'string') card.userName = row.userName.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (typeof row.userFace === 'string' && FACE_IDS.has(row.userFace) && row.userFace !== 'other') card.userFace = row.userFace;
    if (row.rating === 1 || row.rating === 2 || row.rating === 3 || row.rating === 4 || row.rating === 5) card.rating = row.rating;
    if (typeof row.addedAt === 'number' && Number.isFinite(row.addedAt)) card.addedAt = row.addedAt;
    if (row.video && typeof row.video === 'object') {
      const video = row.video as { href?: unknown; title?: unknown };
      const href = typeof video.href === 'string' ? video.href.trim().slice(0, 500) : '';
      if (/^https?:\/\//i.test(href)) {
        const title = typeof video.title === 'string' ? video.title.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
        card.video = { title, href };
      }
    }
    if (typeof row.notes === 'string') {
      const notes = row.notes.replace(/\r\n?/g, '\n').trim().slice(0, 1000);
      if (notes) card.notes = notes;
    }
    if (Array.isArray(row.links)) {
      const links: { to: string; relation: 'leads' | 'defense'; name?: string }[] = [];
      const seenLinks = new Set<string>();
      for (const raw of row.links) {
        if (!raw || typeof raw !== 'object') continue;
        const link = raw as Record<string, unknown>;
        const to = typeof link.to === 'string' ? link.to.trim() : '';
        const relation = link.relation === 'leads' || link.relation === 'defense' ? link.relation : null;
        if (!to || to.length > 80 || to === id || !relation || seenLinks.has(`${relation}:${to}`)) continue;
        const name = typeof link.name === 'string' ? link.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
        if (to.startsWith('gl.') && !name) continue;
        seenLinks.add(`${relation}:${to}`);
        links.push(name ? { to, relation, name } : { to, relation });
        if (links.length >= 24) break;
      }
      if (links.length) card.links = links;
    }
    cards.push(card);
    if (cards.length >= 400) break;
  }
  return { version: 1, cards };
}

function sanitizeAdditions(raw: unknown): StudentSyncDoc['glossaryAdditions'] {
  const rows =
    raw && typeof raw === 'object' && Array.isArray((raw as { additions?: unknown }).additions)
      ? (raw as { additions: unknown[] }).additions
      : [];
  return { version: 1, additions: rows.filter((row) => row && typeof row === 'object').slice(0, 400) };
}

function sanitizeAssessments(raw: unknown): StudentSyncDoc['assessments'] {
  const rows =
    raw && typeof raw === 'object' && Array.isArray((raw as { entries?: unknown }).entries)
      ? (raw as { entries: unknown[] }).entries
      : [];
  return { entries: rows.filter((row) => row && typeof row === 'object').slice(0, 400) };
}

const PROGRESS_BELTS = new Set(['white', 'blue', 'purple', 'brown', 'black', 'grey', 'yellow', 'orange', 'green', 'coral', 'redWhite', 'red']);
const PHOTO_KEYS = new Set(['pictures', 'pictureNote', 'pictureCount', 'image', 'photo', 'photoId']);

function dropPhotoFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropPhotoFields);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (PHOTO_KEYS.has(key) || (typeof item === 'string' && item.startsWith('data:'))) continue;
    out[key] = dropPhotoFields(item);
  }
  return out;
}

function sanitizeBasics(raw: unknown): StudentSyncBasics | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const row = dropPhotoFields(raw) as Record<string, unknown>;
  const beltRaw = typeof row.belt === 'string' ? row.belt.trim() : 'white';
  const started = typeof row.startedOn === 'string' ? row.startedOn.trim().slice(0, 10) : '';
  const basics: StudentSyncBasics = {
    displayName: typeof row.displayName === 'string' ? row.displayName.trim().replace(/\s+/g, ' ').slice(0, 80) : '',
    gymName: typeof row.gymName === 'string' ? row.gymName.trim().replace(/\s+/g, ' ').slice(0, 80) : '',
    belt: PROGRESS_BELTS.has(beltRaw) ? beltRaw : 'white',
    startedOn: DATE_RE.test(started) ? started : '',
  };
  if (row.rank && typeof row.rank === 'object') basics.rank = row.rank as StudentSyncRank;
  return studentBasicsIsMeaningful(basics) ? basics : undefined;
}

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

export type ProfileSyncEnv = LoginEnv & { GYM_MEDIA?: InboxBucket };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function safeSegment(value: string, max = 80): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || trimmed.includes('..') || trimmed.includes('/')) return null;
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) return null;
  return trimmed;
}

function academyKeyFor(licenseId: string | null, accountId: string): string | null {
  if (licenseId) {
    const id = safeSegment(licenseId, 80);
    return id ? `groups/${id}/account-sync/academy-profile.json` : null;
  }
  const id = safeSegment(accountId, 90);
  return id ? `accounts/${id}/account-sync/academy-profile.json` : null;
}

/** The owner's Class Schedule sits beside the academy profile, so the same owner devices share it. */
function scheduleKeyFor(licenseId: string | null, accountId: string): string | null {
  const academy = academyKeyFor(licenseId, accountId);
  return academy ? academy.replace(/academy-profile\.json$/, 'class-schedule.json') : null;
}

function profilesKey(accountId: string): string | null {
  const id = safeSegment(accountId, 90);
  return id ? `accounts/${id}/account-sync/profiles.json` : null;
}

function treeKey(accountId: string): string | null {
  const id = safeSegment(accountId, 90);
  return id ? `accounts/${id}/account-sync/technique-tree.json` : null;
}

function studentKey(accountId: string, profileId: string): string | null {
  const account = safeSegment(accountId, 90);
  const profile = isStudentProfileId(profileId) ? profileId : null;
  if (!account || !profile) return null;
  return `accounts/${account}/account-sync/profiles/${profile}/student.json`;
}

async function objectText(object: { text?: () => Promise<string>; body?: ReadableStream | null }): Promise<string> {
  if (typeof object.text === 'function') return object.text();
  if (object.body) return new Response(object.body).text();
  return '';
}

async function readJson(bucket: InboxBucket, key: string): Promise<unknown | null> {
  const object = await bucket.get(key);
  if (!object) return null;
  try {
    const raw = await objectText(object);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

async function writeJson(bucket: InboxBucket, key: string, value: unknown, maxBytes: number): Promise<Response | null> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  if (bytes.byteLength > maxBytes) return json(413, { ok: false, error: 'That profile is too large to sync.' });
  await bucket.put(key, new TextDecoder().decode(bytes), { httpMetadata: { contentType: 'application/json' } });
  return null;
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function sanitizeAcademyDoc(raw: unknown): AcademySyncDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const name = typeof row.name === 'string' ? row.name.normalize('NFC').trim().slice(0, 80) : '';
  let logoDataUrl: string | null = null;
  if (typeof row.logoDataUrl === 'string' && row.logoDataUrl.startsWith('data:image/') && row.logoDataUrl.length <= LOGO_MAX_CHARS) {
    logoDataUrl = row.logoDataUrl;
  }
  return {
    v: 1,
    updatedAt: asNumber(row.updatedAt),
    name,
    logoDataUrl,
    profile: sanitizeGymProfile(row.profile),
  };
}

export function sanitizeStudentDoc(raw: unknown, fallbackId: string): StudentSyncDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const profileId = typeof row.profileId === 'string' && isStudentProfileId(row.profileId) ? row.profileId : fallbackId;
  if (!isStudentProfileId(profileId)) return null;
  const doc: StudentSyncDoc = {
    v: 1,
    updatedAt: asNumber(row.updatedAt),
    profileId,
    indexCards: sanitizeIndexCards(row.indexCards),
    glossaryAdditions: sanitizeAdditions(row.glossaryAdditions),
    assessments: sanitizeAssessments(row.assessments),
  };
  const basics = sanitizeBasics(row.basics);
  if (basics) doc.basics = basics;
  return doc;
}

export function sanitizeProfilesDoc(raw: unknown): ProfilesSyncDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const list = Array.isArray(row.profiles) ? row.profiles : [];
  const profiles: ProfilesSyncDoc['profiles'] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as { id?: unknown; name?: unknown; createdAt?: unknown };
    if (typeof rec.id !== 'string' || !isStudentProfileId(rec.id) || seen.has(rec.id)) continue;
    const name = typeof rec.name === 'string' ? cleanStudentProfileName(rec.name) : '';
    if (!name) continue;
    const createdAt = typeof rec.createdAt === 'string' ? rec.createdAt.slice(0, 40) : '';
    seen.add(rec.id);
    profiles.push({ id: rec.id, name, createdAt });
    if (profiles.length >= 25) break;
  }
  return { v: 1, updatedAt: asNumber(row.updatedAt), profiles };
}

function pickStored<T>(
  incoming: T | null,
  stored: T | null,
  isEmpty: (doc: T | null | undefined) => boolean,
  updatedAt: (doc: T) => number,
): T | null {
  if (!incoming) return stored;
  if (isEmpty(incoming) && stored && !isEmpty(stored)) return stored;
  if (!stored || isEmpty(stored)) return incoming;
  return updatedAt(incoming) >= updatedAt(stored) ? incoming : stored;
}

async function resolveAccount(
  db: D1Database,
  emailHash: string,
): Promise<{ accountId: string; licenseId: string | null; canWriteAcademy: boolean }> {
  const password = await db
    .prepare(`SELECT account_id AS accountId, license_id AS licenseId FROM login_passwords WHERE email_hash = ? LIMIT 1`)
    .bind(emailHash)
    .first<{ accountId: string | null; licenseId: string | null }>();

  const accountRow =
    (password?.accountId
      ? { id: password.accountId }
      : await db.prepare(`SELECT id FROM accounts WHERE email_hash = ? LIMIT 1`).bind(emailHash).first<{ id: string }>()) ??
    null;

  let accountId = accountRow?.id ?? '';
  if (!accountId) {
    const identity = await db
      .prepare(`SELECT account_id AS accountId FROM identities WHERE email_hash = ? LIMIT 1`)
      .bind(emailHash)
      .first<{ accountId: string | null }>();
    accountId = identity?.accountId ?? '';
  }

  let licenseId: string | null = null;
  if (accountId) licenseId = await primaryLicenseForAccount(db, accountId);
  if (!licenseId) {
    const identity = await db
      .prepare(`SELECT license_id AS licenseId FROM identities WHERE email_hash = ? LIMIT 1`)
      .bind(emailHash)
      .first<{ licenseId: string | null }>();
    licenseId = identity?.licenseId ?? password?.licenseId ?? null;
  }
  if (!accountId && licenseId) {
    const linked = await db
      .prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ? LIMIT 1`)
      .bind(licenseId)
      .first<{ accountId: string | null }>();
    accountId = linked?.accountId ?? '';
  }

  // No accounts row yet (invite-only sign-in). Still sync under a stable, opaque folder.
  if (!accountId) accountId = `eh-${emailHash}`;

  let canWriteAcademy = false;
  if (licenseId) {
    const owned = await db
      .prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ? LIMIT 1`)
      .bind(licenseId)
      .first<{ accountId: string | null }>();
    const ownsLicense = !owned?.accountId || owned.accountId === accountId;
    if (ownsLicense) {
      const grants = await db
        .prepare(`SELECT product, status FROM grants WHERE license_id = ?`)
        .bind(licenseId)
        .all<{ product: string; status: string }>();
      canWriteAcademy = (grants.results ?? []).some((row) => {
        const product = (row.product ?? '').toLowerCase();
        const active = !row.status || row.status === 'active';
        return active && (product === 'advantage-pro' || product === 'pro' || product.endsWith('-pro'));
      });
    }
  }

  return { accountId, licenseId, canWriteAcademy };
}

function crossSite(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  const raw = await request.text();
  if (raw.length > SYNC_BODY_MAX_CHARS) return null;
  if (!raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function handleProfileSync(
  request: Request,
  env: ProfileSyncEnv,
  db: D1Database | null,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'PUT') return json(405, { ok: false, error: 'Method not allowed.' });
  if (request.method === 'PUT' && crossSite(request)) return json(403, { ok: false, error: 'Forbidden.' });
  const pepper = env.CODE_HASH_PEPPER?.trim() ?? '';
  if (!db || !pepper) return json(503, { ok: false, error: LOGIN_UNAVAILABLE, setup: true });
  const bucket = env.GYM_MEDIA;
  if (!bucket) return json(503, { ok: false, error: 'Advantage Cloud storage is not bound.', unbound: true });

  const session = await readLoginSession(db, pepper, request, now());
  if (!session) return json(401, { ok: false, error: 'Not signed in.' });

  const resolved = await resolveAccount(db, session.emailHash);
  const accountId = safeSegment(resolved.accountId, 90);
  if (!accountId) return json(500, { ok: false, error: 'Account is missing.' });

  const url = new URL(request.url);
  let profileId = url.searchParams.get('profile') ?? DEFAULT_STUDENT_PROFILE_ID;
  if (request.method === 'PUT') {
    const body = await readBody(request);
    if (!body) return json(400, { ok: false, error: 'That profile could not be read.' });
    if (typeof body.profileId === 'string' && isStudentProfileId(body.profileId)) profileId = body.profileId;
    if (!isStudentProfileId(profileId)) return json(400, { ok: false, error: 'Unknown profile.' });

    const academyKey = academyKeyFor(resolved.licenseId, accountId);
    const pKey = profilesKey(accountId);
    const sKey = studentKey(accountId, profileId);
    if (!pKey || !sKey) return json(400, { ok: false, error: 'Unknown profile.' });

    let academy: AcademySyncDoc | null = null;
    if (resolved.canWriteAcademy && academyKey && body.academy) {
      const incoming = sanitizeAcademyDoc(body.academy);
      const stored = sanitizeAcademyDoc(await readJson(bucket, academyKey));
      const next = pickStored(incoming, stored, academyDocIsEmpty, (doc) => doc.updatedAt);
      if (next) {
        const failed = await writeJson(bucket, academyKey, next, ACADEMY_SYNC_MAX_BYTES);
        if (failed) return failed;
        academy = next;
      } else {
        academy = stored;
      }
    } else if (resolved.canWriteAcademy && academyKey) {
      academy = sanitizeAcademyDoc(await readJson(bucket, academyKey));
    }

    const scheduleKey = scheduleKeyFor(resolved.licenseId, accountId);
    let schedule: ScheduleSyncDoc | null = null;
    if (resolved.canWriteAcademy && scheduleKey) {
      const stored = sanitizeScheduleSyncDoc(await readJson(bucket, scheduleKey));
      const incoming = body.schedule ? sanitizeScheduleSyncDoc(body.schedule) : null;
      const next = incoming ? pickStored(incoming, stored, scheduleSyncDocIsEmpty, (doc) => doc.updatedAt) : stored;
      if (incoming && next === incoming) {
        const failed = await writeJson(bucket, scheduleKey, next, SCHEDULE_SYNC_MAX_BYTES);
        if (failed) return failed;
      }
      schedule = next;
    }

    let student: StudentSyncDoc | null = null;
    if (body.student) {
      const incoming = sanitizeStudentDoc(body.student, profileId);
      const stored = sanitizeStudentDoc(await readJson(bucket, sKey), profileId);
      const picked = pickStored(incoming, stored, studentDocIsEmpty, (doc) => doc.updatedAt);
      const next = picked ? preserveStudentBasics(picked, stored, incoming) : picked;
      if (next) {
        const failed = await writeJson(bucket, sKey, next, STUDENT_SYNC_MAX_BYTES);
        if (failed) return failed;
        student = next;
      } else {
        student = stored;
      }
    } else {
      student = sanitizeStudentDoc(await readJson(bucket, sKey), profileId);
    }

    let profiles: ProfilesSyncDoc | null = null;
    if (body.profiles) {
      const incoming = sanitizeProfilesDoc(body.profiles);
      const stored = sanitizeProfilesDoc(await readJson(bucket, pKey));
      const next = pickStored(incoming, stored, profilesDocIsEmpty, (doc) => doc.updatedAt);
      if (next) {
        const failed = await writeJson(bucket, pKey, next, PROFILES_SYNC_MAX_BYTES);
        if (failed) return failed;
        profiles = next;
      } else {
        profiles = stored;
      }
    } else {
      profiles = sanitizeProfilesDoc(await readJson(bucket, pKey));
    }

    const tKey = treeKey(accountId);
    let tree: TreeSyncDoc | null = tKey ? sanitizeTreeSyncDoc(await readJson(bucket, tKey)) : null;
    if (tKey && body.tree) {
      const incoming = sanitizeTreeSyncDoc(body.tree);
      if (incoming && !treeSyncDocIsEmpty(incoming)) {
        const merged = mergeTreeDocs(tree, incoming);
        if (!sameTreeContent(merged, tree)) {
          const failed = await writeJson(bucket, tKey, merged, TREE_SYNC_MAX_BYTES);
          if (failed) return failed;
        }
        tree = merged;
      }
    }

    if (body.academy && !resolved.canWriteAcademy) {
      // The student D8 still saves. The academy profile is owner-only.
    }

    return json(200, {
      ok: true,
      accountId,
      licenseId: resolved.licenseId,
      canWriteAcademy: resolved.canWriteAcademy,
      academy,
      student,
      profiles,
      tree,
      schedule,
    });
  }

  if (!isStudentProfileId(profileId)) return json(400, { ok: false, error: 'Unknown profile.' });
  const academyKey = academyKeyFor(resolved.licenseId, accountId);
  const pKey = profilesKey(accountId);
  const sKey = studentKey(accountId, profileId);
  if (!pKey || !sKey) return json(400, { ok: false, error: 'Unknown profile.' });

  const academy = resolved.canWriteAcademy && academyKey ? sanitizeAcademyDoc(await readJson(bucket, academyKey)) : null;
  const student = sanitizeStudentDoc(await readJson(bucket, sKey), profileId);
  const profiles = sanitizeProfilesDoc(await readJson(bucket, pKey));
  const tKey = treeKey(accountId);
  const tree = tKey ? sanitizeTreeSyncDoc(await readJson(bucket, tKey)) : null;
  const scheduleKey = scheduleKeyFor(resolved.licenseId, accountId);
  const schedule =
    resolved.canWriteAcademy && scheduleKey ? sanitizeScheduleSyncDoc(await readJson(bucket, scheduleKey)) : null;

  return json(200, {
    ok: true,
    accountId,
    licenseId: resolved.licenseId,
    canWriteAcademy: resolved.canWriteAcademy,
    academy,
    student,
    profiles,
    tree,
    schedule,
  });
}
