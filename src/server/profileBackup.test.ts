import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import { PROFILE_BACKUP_KIND, profileBackupKey, type ProfileBackupDoc } from '../lib/profileBackupDoc.ts';
import { handleProfileBackup, type ProfileBackupEnv } from './profileBackup.ts';
import { recordPurchase } from './purchaseRecords.ts';
import { sqliteD1 } from './sqliteD1.ts';
import type { InboxBucket } from './studentInbox.ts';
import { issueToken } from './tokenIssue.ts';

const NOW = new Date('2026-11-18T14:00:00.000Z');
const ORIGIN = 'https://advantagebjjtimer.com';
const PEPPER = 'backup-test-pepper';

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

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

type Input = Parameters<typeof issueToken>[1];

async function pass(secret: string, input: Partial<Input> & { licenseId: string }): Promise<string> {
  const token = await issueToken(secret, {
    grants: ['white', 'student'],
    tier: 'student',
    src: 'stripe',
    deviceId: 'device-1',
    now: NOW,
    kind: 'onetime',
    ...input,
  } as Input);
  assert.ok(token);
  return token;
}

function backup(updatedAt: number, name: string, extra: Partial<ProfileBackupDoc> = {}): ProfileBackupDoc {
  return {
    v: 1,
    kind: PROFILE_BACKUP_KIND,
    updatedAt,
    students: [
      {
        id: 'default',
        name: 'Me',
        updatedAt,
        basics: {
          displayName: name,
          gymName: 'Advantage Ellijay',
          belt: 'blue',
          startedOn: '2021-03-01',
          rank: { tapeCount: 2, awardedOn: '2024-05-04', tapeDates: ['2024-11-01', '2025-06-01', '', ''], history: [] },
        },
      },
    ],
    ...extra,
  };
}

async function call(env: ProfileBackupEnv, method: 'GET' | 'PUT', token: string, body?: unknown, headers: Record<string, string> = {}) {
  const init: RequestInit = { method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await handleProfileBackup(new Request(`${ORIGIN}/api/profile-backup`, init), env, () => NOW);
  return { status: response.status, body: (await response.json()) as Record<string, any> };
}

test('the backup key sits in the buyer license folder and refuses unsafe ids', () => {
  assert.equal(profileBackupKey('lic_abc123'), 'groups/lic_abc123/profiles/backup.json');
  assert.equal(profileBackupKey('../other'), null);
  assert.equal(profileBackupKey('a/b'), null);
  assert.equal(profileBackupKey(''), null);
});

test('a buyer saves a profile and a wiped device reads it back from the license folder', async () => {
  const secret = await signingSecret();
  const bucket = memoryBucket();
  const env: ProfileBackupEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const phone = await pass(secret, { licenseId: 'lic-buyer-0001' });

  const saved = await call(env, 'PUT', phone, { backup: backup(100, 'Justin') });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.saved, true);
  assert.deepEqual([...bucket.objects.keys()], ['groups/lic-buyer-0001/profiles/backup.json']);

  const newPhone = await pass(secret, { licenseId: 'lic-buyer-0001', deviceId: 'device-2' });
  const read = await call(env, 'GET', newPhone);
  assert.equal(read.status, 200);
  assert.equal(read.body.backup.students[0].basics.displayName, 'Justin');
  assert.equal(read.body.backup.students[0].basics.belt, 'blue');
  assert.equal(read.body.backup.students[0].basics.rank.tapeCount, 2);
});

test('photos, logos, and videos never reach the stored file', async () => {
  const secret = await signingSecret();
  const bucket = memoryBucket();
  const env: ProfileBackupEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const phone = await pass(secret, { licenseId: 'lic-media-0001' });
  const doc = backup(100, 'Photo test') as any;
  doc.students[0].basics.rank.pictures = [{ belt: 'blue', image: 'data:image/png;base64,AAAA' }];
  doc.students[0].photo = 'data:image/jpeg;base64,BBBB';
  doc.students[0].video = { href: 'https://example.com/kid.mp4' };
  doc.academy = { updatedAt: 100, name: 'Gym', logoDataUrl: 'data:image/png;base64,CCCC', foundedOn: '2010-01-01', founders: '', lineage: '' };
  const saved = await call(env, 'PUT', phone, { backup: doc });
  assert.equal(saved.status, 200);
  const stored = bucket.objects.get('groups/lic-media-0001/profiles/backup.json') ?? '';
  assert.ok(stored.length > 0);
  assert.doesNotMatch(stored, /data:|pictures|video|logo|mp4/i);
  assert.match(stored, /"name":"Gym"/);
});

test('a blank device never wipes the stored backup, and a missing profile is kept', async () => {
  const secret = await signingSecret();
  const bucket = memoryBucket();
  const env: ProfileBackupEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const phone = await pass(secret, { licenseId: 'lic-keep-0001' });
  const first = backup(100, 'Keep me');
  first.students.push({ id: 'pabcde123456', name: 'Kid', updatedAt: 100, basics: { displayName: 'Kid', gymName: '', belt: 'grey', startedOn: '2024-01-01' } });
  await call(env, 'PUT', phone, { backup: first });

  const blank = await call(env, 'PUT', phone, { backup: { v: 1, kind: PROFILE_BACKUP_KIND, updatedAt: 999, students: [] } });
  assert.equal(blank.status, 200);
  assert.equal(blank.body.saved, false);

  // A newer edit of one profile keeps the other profile.
  const edit = await call(env, 'PUT', phone, { backup: backup(200, 'Renamed') });
  assert.equal(edit.status, 200);
  const ids = edit.body.backup.students.map((row: { id: string }) => row.id);
  assert.deepEqual(ids, ['default', 'pabcde123456']);
  assert.equal(edit.body.backup.students[0].basics.displayName, 'Renamed');

  // An older phone cannot win over the newer edit.
  const stale = await call(env, 'PUT', phone, { backup: backup(150, 'Old phone') });
  assert.equal(stale.body.backup.students[0].basics.displayName, 'Renamed');
});

test('instructor seats are refused, so a coach cannot read or write a profile backup', async () => {
  const secret = await signingSecret();
  const bucket = memoryBucket();
  const env: ProfileBackupEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const owner = await pass(secret, { licenseId: 'lic-gym-00001', grants: ['white', 'student', 'coach', 'pro'], tier: 'pro', kind: 'pro' });
  await call(env, 'PUT', owner, { backup: backup(100, 'Owner') });
  const seat = await pass(secret, {
    licenseId: 'seat-row-001',
    gym: 'lic-gym-00001',
    sid: 'seat-row-001',
    preset: 'coach',
    grants: ['white', 'student', 'coach'],
    tier: 'seat',
    src: 'seat',
    kind: 'seat',
  } as Partial<Input> & { licenseId: string });
  const read = await call(env, 'GET', seat);
  assert.equal(read.status, 403);
  const write = await call(env, 'PUT', seat, { backup: backup(500, 'Coach push') });
  assert.equal(write.status, 403);
  const stored = JSON.parse(bucket.objects.get('groups/lic-gym-00001/profiles/backup.json') ?? '{}');
  assert.equal(stored.students[0].basics.displayName, 'Owner');
  assert.equal(bucket.objects.size, 1);
});

test('a free Student license backs up under its own license id, not the academy folder', async () => {
  const secret = await signingSecret();
  const bucket = memoryBucket();
  const env: ProfileBackupEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const student = await pass(secret, { licenseId: 'stu-lic-0001', gym: 'lic-gym-00001', preset: 'student-license', src: 'free' });
  const saved = await call(env, 'PUT', student, { backup: backup(100, 'Free student') });
  assert.equal(saved.status, 200);
  assert.deepEqual([...bucket.objects.keys()], ['groups/stu-lic-0001/profiles/backup.json']);
  const gymOwner = await pass(secret, { licenseId: 'lic-gym-00001', tier: 'pro', kind: 'pro', grants: ['white', 'student', 'coach', 'pro'] });
  const ownerRead = await call(env, 'GET', gymOwner);
  assert.equal(ownerRead.body.backup, null);
});

test('signed out, cross-site, and unbound requests are refused', async () => {
  const secret = await signingSecret();
  const env: ProfileBackupEnv = { GYM_MEDIA: memoryBucket(), ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  assert.equal((await call(env, 'GET', '')).status, 401);
  assert.equal((await call(env, 'GET', 'not-a-token')).status, 401);
  const phone = await pass(secret, { licenseId: 'lic-x-000001' });
  assert.equal((await call(env, 'PUT', phone, { backup: backup(1, 'x') }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ ...env, GYM_MEDIA: undefined }, 'GET', phone)).status, 503);
  const other = await signingSecret();
  const forged = await pass(other, { licenseId: 'lic-x-000001' });
  assert.equal((await call(env, 'GET', forged)).status, 401);
});

test('a refunded license is refused; a license with an open grant is served', async () => {
  const secret = await signingSecret();
  const db = sqliteD1();
  const { licenseId } = await recordPurchase(db, {
    email: 'buyer@gym.test',
    product: 'advantage-student',
    source: 'stripe_payment',
    sourceRef: 'cs_backup_1',
    sessionId: 'cs_backup_1',
    pepper: PEPPER,
    now: NOW,
  });
  const env: ProfileBackupEnv = { GYM_MEDIA: memoryBucket(), ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db };
  const phone = await pass(secret, { licenseId });
  assert.equal((await call(env, 'PUT', phone, { backup: backup(1, 'Paid') })).status, 200);
  await db.prepare(`UPDATE grants SET revoked_at = ? WHERE license_id = ?`).bind(NOW.toISOString(), licenseId).run();
  assert.equal((await call(env, 'GET', phone)).status, 403);
});
