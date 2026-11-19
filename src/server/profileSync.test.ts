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
import { SYNC_BODY_MAX_CHARS } from './profileSync.ts';
import { pullAndMergeSignedIn } from '../lib/signedInSync.ts';
import { LOGIN_HINT_KEY } from '../lib/emailLogin.ts';
import { TECHNIQUE_TREE_STORAGE_KEY } from '../lib/techniqueTreeStore.ts';
import { GLOSSARY_BASE_STORAGE_KEY } from '../lib/glossaryBaseCards.ts';

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

function treeSyncDoc(updatedAt: number, trees: { id: string; name: string; base: string; at: number }[]) {
  return {
    v: 1,
    updatedAt,
    activeId: trees[0]?.id ?? '',
    trees: trees.map((row) => ({
      at: row.at,
      tree: {
        id: row.id,
        name: row.name,
        root: { id: `${row.id}-root`, slotId: `${row.id}-slot`, kind: 'root', title: row.base, notes: '', collapsed: false, children: [] },
      },
    })),
    removedTrees: {},
    links: [],
    removedLinks: {},
  };
}

test('the Technique Tree saves per account, merges across devices, and never lands in a student doc', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'coach@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_tree_sync',
    sessionId: 'cs_tree_sync',
    pepper: PEPPER,
    now: NOW,
  });
  const phone = await openSession(f, 'coach@gym.test', licenseId);

  const first = await call(
    f,
    put('/api/login/sync', { profileId: 'default', tree: treeSyncDoc(100, [{ id: 't1', name: 'Guard', base: 'Closed guard', at: 100 }]) }, phone.cookie),
  );
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.tree.trees[0].tree.root.title, 'Closed guard');

  // Second device saves a different tree; the server keeps both.
  const second = await call(
    f,
    put('/api/login/sync', { profileId: 'default', tree: treeSyncDoc(200, [{ id: 't2', name: 'Passing', base: 'Half guard', at: 200 }]) }, phone.cookie),
  );
  assert.deepEqual(second.body.tree.trees.map((row: { tree: { id: string } }) => row.tree.id), ['t1', 't2']);

  // An older edit of t1 does not overwrite the newer one.
  const stale = await call(
    f,
    put('/api/login/sync', { profileId: 'default', tree: treeSyncDoc(50, [{ id: 't1', name: 'Guard', base: 'Old name', at: 50 }]) }, phone.cookie),
  );
  assert.equal(stale.body.tree.trees[0].tree.root.title, 'Closed guard');

  // An empty incoming tree doc never wipes the stored one.
  const empty = await call(f, put('/api/login/sync', { profileId: 'default', tree: treeSyncDoc(999, []) }, phone.cookie));
  assert.equal(empty.body.tree.trees.length, 2);

  const fromGet = await call(f, get('/api/login/sync?profile=default', phone.cookie));
  assert.equal(fromGet.body.tree.trees.length, 2);

  const keys = [...f.bucket.objects.keys()];
  assert.deepEqual(keys.filter((key) => key.includes('technique-tree')), [`accounts/${phone.accountId}/account-sync/technique-tree.json`]);
  for (const key of keys.filter((row) => row.endsWith('student.json'))) {
    assert.equal(f.bucket.objects.get(key)!.includes('Closed guard'), false, 'not copied into a student doc');
  }

  // A different person (another account) never sees this tree.
  const other = await recordPurchase(f.db, {
    email: 'kid@gym.test',
    product: 'advantage-student',
    source: 'stripe_payment',
    sourceRef: 'cs_tree_other',
    sessionId: 'cs_tree_other',
    pepper: PEPPER,
    now: NOW,
  });
  const kid = await openSession(f, 'kid@gym.test', other.licenseId);
  assert.notEqual(kid.accountId, phone.accountId);
  const kidGet = await call(f, get('/api/login/sync?profile=default', kid.cookie));
  assert.equal(kidGet.body.tree, null);
});

test('a too-large Technique Tree doc is refused, nothing stored', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'big@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_tree_big',
    sessionId: 'cs_tree_big',
    pepper: PEPPER,
    now: NOW,
  });
  const session = await openSession(f, 'big@gym.test', licenseId);
  const huge = { profileId: 'default', tree: treeSyncDoc(1, [{ id: 't1', name: 'Guard', base: 'x', at: 1 }]), pad: 'x'.repeat(SYNC_BODY_MAX_CHARS + 10) };
  const refused = await call(f, put('/api/login/sync', huge, session.cookie));
  assert.equal(refused.status, 400);
  assert.equal([...f.bucket.objects.keys()].some((key) => key.includes('technique-tree')), false);
});

test('two devices: the Technique Tree survives a signed-in sync round trip (mocked fetch, in-memory server)', async () => {
  const f = await fixture();
  const { licenseId } = await recordPurchase(f.db, {
    email: 'roundtrip@gym.test',
    product: 'advantage-pro',
    source: 'stripe_payment',
    sourceRef: 'cs_tree_rt',
    sessionId: 'cs_tree_rt',
    pepper: PEPPER,
    now: NOW,
  });
  const session = await openSession(f, 'roundtrip@gym.test', licenseId);
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), ORIGIN);
    const headers = new Headers(init?.headers);
    headers.set('cookie', session.cookie);
    const request = new Request(url, { method: init?.method ?? 'GET', headers, body: init?.body ?? null });
    return handleLogin(request, f.env, f.db, () => NOW, async () => new Response('{}', { status: 404 }));
  }) as typeof fetch;

  const mem = (seed: Record<string, string> = {}) => {
    const map = new Map(Object.entries(seed));
    return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), removeItem: (key: string) => void map.delete(key) };
  };
  const g = globalThis as { localStorage?: unknown };
  const previous = g.localStorage;
  g.localStorage = mem({ [LOGIN_HINT_KEY]: 'roundtrip@gym.test' });
  try {
    const guard = {
      version: 2,
      activeId: 'tA',
      trees: [
        {
          id: 'tA',
          name: 'Guard game',
          root: {
            id: 'rA', slotId: 'sA', kind: 'root', title: 'Base Position', notes: '', collapsed: false, glossaryCardId: 'gbase.closed-guard',
            children: [{ id: 'cA', slotId: 'sB', kind: 'branch', title: 'Scissor sweep', notes: '', collapsed: false, children: [] }],
          },
        },
      ],
    };
    const phone = mem({
      [TECHNIQUE_TREE_STORAGE_KEY]: JSON.stringify(guard),
      [GLOSSARY_BASE_STORAGE_KEY]: JSON.stringify({
        version: 1,
        cards: [],
        links: [{ id: 'gl1', from: { type: 'card', cardId: 'gbase.closed-guard' }, toCardId: 'gbase.kimura', relation: 'branch', label: '' }],
        collisions: [],
        skipped: [],
      }),
    });
    const pushed = await pullAndMergeSignedIn({ profileId: 'default', store: phone, fetchImpl, now: 1000 });
    assert.equal(pushed.kind, 'synced', JSON.stringify(pushed));

    const laptop = mem();
    const pulled = await pullAndMergeSignedIn({ profileId: 'default', store: laptop, fetchImpl, now: 2000 });
    assert.equal(pulled.kind, 'synced');
    const archive = JSON.parse(laptop.getItem(TECHNIQUE_TREE_STORAGE_KEY)!);
    assert.equal(archive.trees[0].root.title, 'Base Position');
    assert.equal(archive.trees[0].root.glossaryCardId, 'gbase.closed-guard');
    assert.equal(archive.trees[0].root.children[0].title, 'Scissor sweep');
    const catalog = JSON.parse(laptop.getItem(GLOSSARY_BASE_STORAGE_KEY)!);
    assert.deepEqual(catalog.links.map((row: { id: string }) => row.id), ['gl1']);
    assert.ok([...f.bucket.objects.keys()].includes(`accounts/${session.accountId}/account-sync/technique-tree.json`));
  } finally {
    g.localStorage = previous;
  }
});
