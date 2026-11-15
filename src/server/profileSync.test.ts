import assert from 'node:assert/strict';
import test from 'node:test';
import { keyedHash } from './codeCrypto.ts';
import { handleLogin, type LoginEnv } from './loginAccount.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { sqliteD1 } from './sqliteD1.ts';
import type { D1Database } from './d1.ts';
import type { InboxBucket } from './studentInbox.ts';
import { DEFAULT_STUDENT_PROFILE_ID } from '../lib/studentProfiles.ts';
import type { AcademySyncDoc, StudentSyncDoc } from '../lib/signedInSyncDocs.ts';
import { emptyGymProfile } from '../lib/gymProfile.ts';

const PEPPER = 'sync-test-pepper';
const NOW = new Date('2026-11-14T23:20:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const OTHER_PROFILE = 'pabcde123456';

function memoryBucket(): InboxBucket & { objects: Map<string, string> } {
  const objects = new Map<string, string>();
  return {
    objects,
    async get(key: string) {
      const text = objects.get(key);
      return text == null ? null : { text: async () => text };
    },
    async put(key: string, value: string) {
      objects.set(key, String(value));
      return {};
    },
    async delete(key: string) {
      objects.delete(key);
    },
    async list(options: { prefix: string }) {
      return { objects: [...objects.keys()].filter((key) => key.startsWith(options.prefix)).map((key) => ({ key })) };
    },
  } as InboxBucket & { objects: Map<string, string> };
}

type Fixture = { db: D1Database; env: LoginEnv; bucket: ReturnType<typeof memoryBucket> };

async function fixture(): Promise<Fixture> {
  const db = sqliteD1();
  const bucket = memoryBucket();
  const env: LoginEnv = {
    CODE_HASH_PEPPER: PEPPER,
    GYM_MEDIA: bucket,
  };
  return { db, env, bucket };
}

async function call(f: Fixture, request: Request, at: Date = NOW): Promise<{ status: number; body: Record<string, any> }> {
  const response = await handleLogin(request, f.env, f.db, () => at, async () => new Response('{}', { status: 404 }));
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

async function openSession(f: Fixture, email: string, licenseId: string): Promise<{ cookie: string; accountId: string; licenseId: string }> {
  const account = await f.db
    .prepare(`SELECT account_id AS accountId FROM licenses WHERE id = ? LIMIT 1`)
    .bind(licenseId)
    .first<{ accountId: string | null }>();
  const row = await f.db
    .prepare(`SELECT email_hash AS emailHash, id FROM accounts WHERE id = ? LIMIT 1`)
    .bind(account?.accountId ?? '')
    .first<{ emailHash: string; id: string }>();
  if (!row?.emailHash) throw new Error(`no account for ${email}`);
  const token = `tok-${email.replace(/[^a-z0-9]/g, '')}-aaaaaaaaaaaaaaaa`;
  const tokenHash = await keyedHash(token, PEPPER, 'session');
  const stamp = NOW.toISOString();
  const expires = new Date(NOW.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
  await f.db
    .prepare(
      `INSERT INTO login_sessions (id, token_hash, email_hash, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(crypto.randomUUID(), tokenHash, row.emailHash, stamp, stamp, expires)
    .run();
  return { cookie: `adv_session=${token}`, accountId: row.id, licenseId };
}

function get(path: string, cookie = ''): Request {
  return new Request(`${ORIGIN}${path}`, { headers: cookie ? { cookie } : {} });
}

function put(path: string, body: unknown, cookie = ''): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
}

function academyDoc(updatedAt: number, name: string, founders = ''): AcademySyncDoc {
  return {
    v: 1,
    updatedAt,
    name,
    logoDataUrl: null,
    profile: { ...emptyGymProfile(), founders },
  };
}

function studentDoc(profileId: string, updatedAt: number, move: string): StudentSyncDoc {
  return {
    v: 1,
    updatedAt,
    profileId,
    indexCards: {
      version: 1,
      cards: [{ id: `custom:${move.replace(/\s+/g, '-').toLowerCase()}`, faceId: 'takedowns', name: move, tree: null, addedAt: updatedAt, rating: 5 }],
    },
    glossaryAdditions: { version: 1, additions: [] },
    assessments: { entries: [] },
  };
}

test('GET /api/login/sync returns 401 without a session', async () => {
  const f = await fixture();
  const missing = await call(f, get('/api/login/sync'));
  assert.equal(missing.status, 401);
  assert.equal(missing.body.ok, false);
  const bad = await call(f, get('/api/login/sync', 'adv_session=not-a-real-session'));
  assert.equal(bad.status, 401);
});

test('PUT /api/login/sync returns 401 without a session', async () => {
  const f = await fixture();
  const denied = await call(f, put('/api/login/sync', { profileId: 'default', academy: academyDoc(1, 'Nope') }));
  assert.equal(denied.status, 401);
});

test('the academy profile is shared across two owner devices on the same license', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'owner@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_owner_sync',
    sessionId: 'cs_owner_sync',
    pepper: PEPPER,
    now: NOW,
  });
  const phone = await openSession(f, 'owner-phone@gym.test', licenseId);
  const computer = await openSession(f, 'owner-computer@gym.test', licenseId);
  assert.equal(phone.accountId, computer.accountId);

  const saved = await call(
    f,
    put(
      '/api/login/sync',
      { profileId: 'default', academy: academyDoc(1_700_000_000_000, 'Gracie Barra Ellijay', 'Carlos and Helio') },
      phone.cookie,
    ),
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.ok, true);
  assert.equal(saved.body.canWriteAcademy, true);
  assert.equal(saved.body.academy.name, 'Gracie Barra Ellijay');
  assert.equal(saved.body.licenseId, licenseId);

  const fromComputer = await call(f, get('/api/login/sync?profile=default', computer.cookie));
  assert.equal(fromComputer.status, 200);
  assert.equal(fromComputer.body.academy.name, 'Gracie Barra Ellijay');
  assert.equal(fromComputer.body.academy.profile.founders, 'Carlos and Helio');
  assert.equal(fromComputer.body.accountId, phone.accountId);

  const academyKeys = [...f.bucket.objects.keys()].filter((key) => key.includes('academy-profile.json'));
  assert.deepEqual(academyKeys, [`groups/${licenseId}/account-sync/academy-profile.json`]);
});

test('an empty incoming academy document does not wipe a stored one', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'keep@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_keep_sync',
    sessionId: 'cs_keep_sync',
    pepper: PEPPER,
    now: NOW,
  });
  const session = await openSession(f, 'keep@gym.test', licenseId);
  const first = await call(f, put('/api/login/sync', { profileId: 'default', academy: academyDoc(100, 'Keep this name') }, session.cookie));
  assert.equal(first.status, 200);
  const wiped = await call(f, put('/api/login/sync', { profileId: 'default', academy: academyDoc(200, '') }, session.cookie));
  assert.equal(wiped.status, 200);
  assert.equal(wiped.body.academy.name, 'Keep this name');
});

test('a newer academy write wins; an older write is kept out', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'lww@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_lww_sync',
    sessionId: 'cs_lww_sync',
    pepper: PEPPER,
    now: NOW,
  });
  const session = await openSession(f, 'lww@gym.test', licenseId);
  await call(f, put('/api/login/sync', { profileId: 'default', academy: academyDoc(200, 'Newer') }, session.cookie));
  const older = await call(f, put('/api/login/sync', { profileId: 'default', academy: academyDoc(50, 'Older') }, session.cookie));
  assert.equal(older.body.academy.name, 'Newer');
  const later = await call(f, put('/api/login/sync', { profileId: 'default', academy: academyDoc(300, 'Latest') }, session.cookie));
  assert.equal(later.body.academy.name, 'Latest');
});

test('student D8 documents for two profiles stay isolated', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'student@gym.test',
    product: 'advantage-student',
    source: 'stripe_payment',
    sourceRef: 'cs_student_sync',
    sessionId: 'cs_student_sync',
    pepper: PEPPER,
    now: NOW,
  });
  const session = await openSession(f, 'student@gym.test', licenseId);
  const first = await call(
    f,
    put('/api/login/sync', { profileId: DEFAULT_STUDENT_PROFILE_ID, student: studentDoc(DEFAULT_STUDENT_PROFILE_ID, 100, 'Monkey King') }, session.cookie),
  );
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const second = await call(
    f,
    put('/api/login/sync', { profileId: OTHER_PROFILE, student: studentDoc(OTHER_PROFILE, 100, 'Drop seoi') }, session.cookie),
  );
  assert.equal(second.status, 200, JSON.stringify(second.body));

  const defaultGet = await call(f, get(`/api/login/sync?profile=${DEFAULT_STUDENT_PROFILE_ID}`, session.cookie));
  const otherGet = await call(f, get(`/api/login/sync?profile=${OTHER_PROFILE}`, session.cookie));
  assert.equal(defaultGet.body.student.indexCards.cards[0].name, 'Monkey King');
  assert.equal(otherGet.body.student.indexCards.cards[0].name, 'Drop seoi');
  assert.equal(
    defaultGet.body.student.indexCards.cards.some((row: { name: string }) => row.name === 'Drop seoi'),
    false,
  );
});
