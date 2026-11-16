import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyAdditions } from './glossaryAdditions.ts';
import { emptyGymProfile } from './gymProfile.ts';
import { writeIndexCards, type IndexCardFile, type StoredIndexCard } from './indexCards.ts';
import { emptyAssessments } from './studentAssessment.ts';
import { bindStudentProfileStorage, DEFAULT_STUDENT_PROFILE_ID } from './studentProfiles.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport } from './studentEdition.ts';
import {
  academyDocIsEmpty,
  applyStudentDoc,
  collectStudentDoc,
  mergeAcademy,
  mergeProfiles,
  mergeStudent,
  pickWinningDoc,
  shortLicenseId,
  studentDocIsEmpty,
  syncStatusLabel,
  type AcademySyncDoc,
  type StudentSyncDoc,
  getSyncStatus,
} from './signedInSync.ts';

const OTHER_PROFILE = 'pabcde123456';

function academy(partial: Partial<AcademySyncDoc> & { updatedAt: number; name?: string }): AcademySyncDoc {
  return {
    v: 1,
    name: partial.name ?? '',
    logoDataUrl: partial.logoDataUrl ?? null,
    profile: partial.profile ?? emptyGymProfile(),
    updatedAt: partial.updatedAt,
  };
}

function card(name: string, id: string): StoredIndexCard {
  return { id, faceId: 'takedowns', name, tree: null, addedAt: 1, rating: 4 };
}

function student(profileId: string, updatedAt: number, cards: StoredIndexCard[]): StudentSyncDoc {
  const file: IndexCardFile = { version: 1, cards };
  return {
    v: 1,
    updatedAt,
    profileId,
    indexCards: file,
    glossaryAdditions: emptyAdditions(),
    assessments: emptyAssessments(),
  };
}

test('an empty remote uploads local academy and student work', () => {
  const localAcademy = academy({
    updatedAt: 100,
    name: 'Gracie Barra Ellijay',
    profile: { ...emptyGymProfile(), founders: 'Carlos and Helio', lineage: 'GB lineage' },
  });
  const localStudent = student(DEFAULT_STUDENT_PROFILE_ID, 100, [card('Monkey King', 'custom:monkey-king')]);

  const academyPick = mergeAcademy(localAcademy, null);
  assert.equal(academyPick.source, 'local');
  assert.equal(academyPick.shouldUpload, true);
  assert.equal(academyPick.winner?.name, 'Gracie Barra Ellijay');

  const studentPick = mergeStudent(localStudent, null);
  assert.equal(studentPick.source, 'local');
  assert.equal(studentPick.shouldUpload, true);
  assert.equal(studentPick.winner?.indexCards.cards[0]?.name, 'Monkey King');

  const emptyRemote = academy({ updatedAt: 999, name: '' });
  assert.equal(academyDocIsEmpty(emptyRemote), true);
  const againstEmpty = mergeAcademy(localAcademy, emptyRemote);
  assert.equal(againstEmpty.source, 'local');
  assert.equal(againstEmpty.shouldUpload, true);
  assert.equal(againstEmpty.winner?.name, 'Gracie Barra Ellijay');
});

test('a newer remote document wins', () => {
  const local = academy({ updatedAt: 100, name: 'Old academy' });
  const remote = academy({ updatedAt: 200, name: 'Newer academy' });
  const pick = mergeAcademy(local, remote);
  assert.equal(pick.source, 'remote');
  assert.equal(pick.shouldUpload, false);
  assert.equal(pick.winner?.name, 'Newer academy');

  const localStudent = student(DEFAULT_STUDENT_PROFILE_ID, 100, [card('Old move', 'custom:old')]);
  const remoteStudent = student(DEFAULT_STUDENT_PROFILE_ID, 200, [card('New move', 'custom:new')]);
  const studentPick = mergeStudent(localStudent, remoteStudent);
  assert.equal(studentPick.source, 'remote');
  assert.equal(studentPick.shouldUpload, false);
  assert.equal(studentPick.winner?.indexCards.cards[0]?.name, 'New move');
});

test('a newer local document wins and is uploaded', () => {
  const local = academy({ updatedAt: 300, name: 'Phone academy' });
  const remote = academy({ updatedAt: 100, name: 'Older computer copy' });
  const pick = mergeAcademy(local, remote);
  assert.equal(pick.source, 'local');
  assert.equal(pick.shouldUpload, true);
  assert.equal(pick.winner?.name, 'Phone academy');

  const localStudent = student(DEFAULT_STUDENT_PROFILE_ID, 300, [card('Monkey King', 'custom:monkey-king')]);
  const remoteStudent = student(DEFAULT_STUDENT_PROFILE_ID, 50, [card('Older move', 'custom:older')]);
  const studentPick = mergeStudent(localStudent, remoteStudent);
  assert.equal(studentPick.source, 'local');
  assert.equal(studentPick.shouldUpload, true);
  assert.equal(studentPick.winner?.indexCards.cards[0]?.name, 'Monkey King');
});

test('two student profiles stay isolated', () => {
  const raw = new Map<string, string>();
  const store = {
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => {
      raw.set(key, value);
    },
    removeItem: (key: string) => {
      raw.delete(key);
    },
  };
  const defaultStore = bindStudentProfileStorage(store, DEFAULT_STUDENT_PROFILE_ID);
  const otherStore = bindStudentProfileStorage(store, OTHER_PROFILE);
  writeIndexCards(defaultStore, { version: 1, cards: [card('Monkey King', 'custom:monkey-king')] });
  writeIndexCards(otherStore, { version: 1, cards: [card('Drop seoi', 'custom:drop-seoi')] });

  const fromDefault: StudentSyncDoc = student(DEFAULT_STUDENT_PROFILE_ID, 100, JSON.parse(defaultStore.getItem('matboard.studentEdition.indexCards.v1') ?? '{"cards":[]}').cards);
  const fromOther: StudentSyncDoc = student(OTHER_PROFILE, 100, JSON.parse(otherStore.getItem('matboard.studentEdition.indexCards.v1') ?? '{"cards":[]}').cards);

  assert.equal(fromDefault.indexCards.cards[0]?.name, 'Monkey King');
  assert.equal(fromOther.indexCards.cards[0]?.name, 'Drop seoi');
  assert.equal(
    fromDefault.indexCards.cards.some((row) => row.name === 'Drop seoi'),
    false,
  );
  assert.equal(
    fromOther.indexCards.cards.some((row) => row.name === 'Monkey King'),
    false,
  );

  const mergedDefault = mergeStudent(fromDefault, fromOther);
  assert.equal(mergedDefault.winner?.profileId, DEFAULT_STUDENT_PROFILE_ID);
  assert.equal(mergedDefault.winner?.indexCards.cards[0]?.name, 'Monkey King');
});

test('equal timestamps keep local data and do not re-upload', () => {
  const local = academy({ updatedAt: 100, name: 'Same time' });
  const remote = academy({ updatedAt: 100, name: 'Also same time' });
  const pick = mergeAcademy(local, remote);
  assert.equal(pick.source, 'local');
  assert.equal(pick.shouldUpload, false);
  assert.equal(pick.winner?.name, 'Same time');
});

test('an empty local document takes a remote that has work', () => {
  const local = academy({ updatedAt: 500, name: '' });
  const remote = academy({ updatedAt: 10, name: 'From the other device' });
  assert.equal(academyDocIsEmpty(local), true);
  const pick = mergeAcademy(local, remote);
  assert.equal(pick.source, 'remote');
  assert.equal(pick.shouldUpload, false);
  assert.equal(pick.winner?.name, 'From the other device');
});

test('a student document without cards, additions, or assessments is empty', () => {
  assert.equal(studentDocIsEmpty(student(DEFAULT_STUDENT_PROFILE_ID, 1, [])), true);
  assert.equal(studentDocIsEmpty(student(DEFAULT_STUDENT_PROFILE_ID, 1, [card('Monkey King', 'custom:monkey-king')])), false);
});

test('a profiles document with only the default profile is treated as empty', () => {
  const onlyDefault = { v: 1 as const, updatedAt: 1, profiles: [{ id: DEFAULT_STUDENT_PROFILE_ID, name: 'My profile', createdAt: '2026-01-01' }] };
  const withExtra = {
    v: 1 as const,
    updatedAt: 2,
    profiles: [
      { id: DEFAULT_STUDENT_PROFILE_ID, name: 'My profile', createdAt: '2026-01-01' },
      { id: OTHER_PROFILE, name: 'Haven', createdAt: '2026-02-01' },
    ],
  };
  const pick = mergeProfiles(onlyDefault, withExtra);
  assert.equal(pick.source, 'remote');
  assert.equal(pick.winner?.profiles.some((row) => row.id === OTHER_PROFILE), true);
});

test('short license id is the first eight characters of the entitlement sub', () => {
  assert.equal(shortLicenseId('d134aa49-aaaa-bbbb-cccc-dddddddddddd'), 'd134aa49');
  assert.equal(shortLicenseId('  abcdefghij  '), 'abcdefgh');
  assert.equal(shortLicenseId(''), '');
  assert.equal(shortLicenseId(null), '');
});

test('sync status label covers signed out and a recent successful sync', () => {
  assert.equal(syncStatusLabel({ kind: 'signed-out', lastSyncAt: null, academySynced: false, error: null }), 'Not signed in — saved on this device only');
  const justNow = Date.now() - 10_000;
  assert.equal(syncStatusLabel({ kind: 'synced', lastSyncAt: justNow, academySynced: true, error: null }, justNow + 1_000), 'Synced just now');
});

test('pickWinningDoc never lets an empty remote wipe local data', () => {
  const local = { updatedAt: 1, value: 'keep me' };
  const pick = pickWinningDoc(local, { updatedAt: 99, value: '' }, (doc) => !doc || !doc.value, (doc) => doc.updatedAt);
  assert.equal(pick.source, 'local');
  assert.equal(pick.shouldUpload, true);
  assert.equal(pick.winner?.value, 'keep me');
});

test('getSyncStatus returns the same object while nothing changed, so the Account page does not re-render until it blanks', () => {
  assert.equal(getSyncStatus(), getSyncStatus());
});

function memoryStore() {
  const raw = new Map<string, string>();
  return {
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => {
      raw.set(key, value);
    },
    removeItem: (key: string) => {
      raw.delete(key);
    },
  };
}

test('profile basics (belt and start date) survive a collect and apply round trip', () => {
  const store = memoryStore();
  const report = blankStudentReport(1);
  report.profile.belt = 'blue';
  report.profile.startedOn = '2020-01-15';
  saveStudentReport(store, report);

  const doc = collectStudentDoc(DEFAULT_STUDENT_PROFILE_ID, store, 100);
  assert.equal(doc.basics?.belt, 'blue');
  assert.equal(doc.basics?.startedOn, '2020-01-15');
  assert.equal(studentDocIsEmpty(doc), false);

  const fresh = memoryStore();
  applyStudentDoc(doc, fresh);
  const loaded = loadStudentReport(fresh);
  assert.equal(loaded.profile.belt, 'blue');
  assert.equal(loaded.profile.startedOn, '2020-01-15');
});

test('a newer student document without basics does not erase stored basics', () => {
  const stored = student(DEFAULT_STUDENT_PROFILE_ID, 100, [card('Monkey King', 'custom:monkey-king')]);
  stored.basics = { displayName: 'Alex', gymName: 'Gracie Barra Ellijay', belt: 'blue', startedOn: '2020-01-15' };
  const incoming = student(DEFAULT_STUDENT_PROFILE_ID, 200, [card('Drop seoi', 'custom:drop-seoi')]);
  const pick = mergeStudent(incoming, stored);
  assert.equal(pick.source, 'local');
  assert.equal(pick.shouldUpload, true);
  assert.equal(pick.winner?.indexCards.cards[0]?.name, 'Drop seoi');
  assert.equal(pick.winner?.basics?.displayName, 'Alex');
  assert.equal(pick.winner?.basics?.belt, 'blue');
  assert.equal(pick.winner?.basics?.startedOn, '2020-01-15');
});
