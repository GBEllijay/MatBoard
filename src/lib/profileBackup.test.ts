import assert from 'node:assert/strict';
import test from 'node:test';
import { handleProfileBackup, type ProfileBackupEnv } from '../server/profileBackup.ts';
import { issueToken } from '../server/tokenIssue.ts';
import type { InboxBucket } from '../server/studentInbox.ts';
import type { PrivateJwk } from './entitlementToken.ts';
import { replaceGymProfile, readGymProfile, emptyGymProfile } from './gymProfile.ts';
import { loadInstructorProfile, saveInstructorProfile } from './instructorProfile.ts';
import {
  applyProfileBackup,
  claimsCanBackUp,
  collectProfileBackup,
  pullProfileBackup,
  pushProfileBackup,
  type BackupDeps,
} from './profileBackup.ts';
import { PROFILE_BACKUP_KIND } from './profileBackupDoc.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport } from './studentEdition.ts';
import { bindStudentProfileStorage, ensureStudentProfileRecord, readStudentProfiles } from './studentProfiles.ts';

const NOW = new Date('2026-11-18T14:00:00.000Z');

function memoryStore() {
  const raw = new Map<string, string>();
  return {
    raw,
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => {
      raw.set(key, value);
    },
    removeItem: (key: string) => {
      raw.delete(key);
    },
    key: (index: number) => [...raw.keys()][index] ?? null,
    get length() {
      return raw.size;
    },
  };
}

function seedStudent(store: ReturnType<typeof memoryStore>, name: string, belt: 'blue' | 'purple', updatedAt = 1000) {
  const report = blankStudentReport(updatedAt);
  report.profile.displayName = name;
  report.profile.belt = belt;
  report.profile.startedOn = '2020-01-15';
  report.rank = { ...report.rank, tapeCount: 3, awardedOn: '2023-02-02' };
  saveStudentReport(store, report);
}

test('collect picks up name, belt, start date, stripes, instructor, and academy text only', () => {
  const store = memoryStore();
  seedStudent(store, 'Justin', 'blue');
  saveInstructorProfile({ name: 'Coach J', belt: 'black' }, store as unknown as Storage, 'owner');
  store.setItem('matboard.gymName.v1', JSON.stringify({ version: 1, name: 'Advantage Ellijay' }));
  replaceGymProfile({ ...emptyGymProfile(), foundedOn: '2012-06-01', founders: 'Justin Guise' }, store);
  const { doc } = collectProfileBackup(store, 5000);
  assert.equal(doc.students.length, 1);
  assert.equal(doc.students[0]?.basics.displayName, 'Justin');
  assert.equal(doc.students[0]?.basics.belt, 'blue');
  assert.equal(doc.students[0]?.basics.rank?.tapeCount, 3);
  assert.deepEqual(doc.instructor && { name: doc.instructor.name, belt: doc.instructor.belt }, { name: 'Coach J', belt: 'black' });
  assert.equal(doc.academy?.name, 'Advantage Ellijay');
  assert.equal(doc.academy?.foundedOn, '2012-06-01');
  assert.doesNotMatch(JSON.stringify(doc), /data:|pictures|logo/);
});

test('apply fills a wiped device and never overwrites a card that already has a name or belt', () => {
  const remote = {
    v: 1 as const,
    kind: PROFILE_BACKUP_KIND,
    updatedAt: 10,
    students: [
      { id: 'default', name: 'Me', updatedAt: 10, basics: { displayName: 'Backup name', gymName: 'Gym', belt: 'purple', startedOn: '2019-01-01' } },
      { id: 'pkidprofile01', name: 'Kid', updatedAt: 10, basics: { displayName: 'Kiddo', gymName: '', belt: 'grey', startedOn: '2024-01-01' } },
    ],
    instructor: { updatedAt: 10, name: 'Coach Backup', belt: 'brown' },
  };

  const wiped = memoryStore();
  const filled = applyProfileBackup(remote, wiped);
  assert.deepEqual(filled.students, ['default', 'pkidprofile01']);
  assert.equal(loadStudentReport(wiped).profile.displayName, 'Backup name');
  assert.equal(loadStudentReport(wiped).profile.belt, 'purple');
  assert.ok(readStudentProfiles(wiped).profiles.some((row) => row.id === 'pkidprofile01'));
  assert.equal(loadStudentReport(bindStudentProfileStorage(wiped, 'pkidprofile01')).profile.belt, 'grey');
  assert.equal(loadInstructorProfile(wiped as unknown as Storage, 'owner').name, 'Coach Backup');

  const kept = memoryStore();
  seedStudent(kept, 'Device name', 'blue');
  saveInstructorProfile({ name: 'Device coach', belt: 'black' }, kept as unknown as Storage, 'owner');
  const none = applyProfileBackup(remote, kept);
  assert.deepEqual(none.students, ['pkidprofile01']);
  assert.equal(none.instructor, false);
  assert.equal(loadStudentReport(kept).profile.displayName, 'Device name');
  assert.equal(loadStudentReport(kept).profile.belt, 'blue');
  assert.equal(loadInstructorProfile(kept as unknown as Storage, 'owner').name, 'Device coach');
});

test('seats and empty passes never back up', () => {
  assert.equal(claimsCanBackUp(null), false);
  assert.equal(claimsCanBackUp({ sub: 'seat-1', src: 'seat', tier: 'seat', grants: ['coach'] }), false);
  assert.equal(claimsCanBackUp({ sub: 'lic-1', src: 'stripe', tier: 'student', grants: [] }), false);
  assert.equal(claimsCanBackUp({ sub: 'lic-1', src: 'stripe', tier: 'student', grants: ['student'] }), true);
});

async function server() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const secret = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const objects = new Map<string, string>();
  const bucket = {
    async get(k: string) {
      const t = objects.get(k);
      return t == null ? null : { text: async () => t };
    },
    async put(k: string, v: string) {
      objects.set(k, v);
      return {};
    },
    async delete(k: string) {
      objects.delete(k);
    },
    async list() {
      return { objects: [] };
    },
  } as unknown as InboxBucket;
  const env: ProfileBackupEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  let calls = 0;
  const fetchFn = async (input: string, init?: RequestInit) => {
    calls += 1;
    return handleProfileBackup(new Request(`https://advantagebjjtimer.com${input}`, init), env, () => NOW);
  };
  const token = (await issueToken(secret, {
    licenseId: 'lic-roundtrip1',
    grants: ['white', 'student'],
    tier: 'student',
    src: 'stripe',
    deviceId: 'd1',
    now: NOW,
    kind: 'onetime',
  })) as string;
  return { objects, fetchFn, token, calls: () => calls };
}

function deps(store: ReturnType<typeof memoryStore>, s: Awaited<ReturnType<typeof server>>): BackupDeps {
  return {
    store,
    claims: () => ({ sub: 'lic-roundtrip1', src: 'stripe', tier: 'student', grants: ['white', 'student'] }),
    token: () => s.token,
    fetch: s.fetchFn,
    demo: () => false,
    now: () => 5000,
  };
}

test('save on one phone, restore on a wiped phone: the profile comes back automatically', async () => {
  const s = await server();
  const phone = memoryStore();
  seedStudent(phone, 'Justin', 'blue');
  ensureStudentProfileRecord(phone, { id: 'pkidprofile02', name: 'Kid' });
  assert.equal(await pushProfileBackup(deps(phone, s)), 'saved');
  assert.ok(s.objects.has('groups/lic-roundtrip1/profiles/backup.json'));
  // Unchanged profile: no second upload.
  assert.equal(await pushProfileBackup(deps(phone, s)), 'unchanged');

  const wiped = memoryStore();
  const report = await pullProfileBackup(deps(wiped, s));
  assert.deepEqual(report?.students, ['default']);
  assert.equal(loadStudentReport(wiped).profile.displayName, 'Justin');
  assert.equal(loadStudentReport(wiped).rank.tapeCount, 3);
  // Already read for this license and no longer blank: no extra read.
  const before = s.calls();
  assert.equal(await pullProfileBackup(deps(wiped, s)), null);
  assert.equal(s.calls(), before);
});

test('demo mode and missing passes skip the network entirely', async () => {
  const s = await server();
  const phone = memoryStore();
  seedStudent(phone, 'Demo', 'blue');
  assert.equal(await pushProfileBackup({ ...deps(phone, s), demo: () => true }), 'skipped');
  assert.equal(await pushProfileBackup({ ...deps(phone, s), token: () => '' }), 'skipped');
  assert.equal(await pushProfileBackup({ ...deps(phone, s), claims: () => ({ sub: 'x', src: 'seat', tier: 'seat', grants: ['coach'] }) }), 'skipped');
  assert.equal(s.calls(), 0);
  assert.equal(readGymProfile(phone).foundedOn, '');
});
