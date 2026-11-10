/**
 * Student packet: one file, checksums, secrets left out, and a clear-then-import round trip.
 * Instructor, academy, and media packets validate and do not restore.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { PODIUM_PHOTO_KEY } from '../podiumPhotos.ts';
import { buildStudentBackup } from '../studentBackup.ts';
import { saveAssessment, writeAssessments, ASSESSMENT_STORAGE_KEY } from '../studentAssessment.ts';
import { blankStudentReport, loadStudentReport, saveStudentReport, setStudentProfile } from '../studentEdition.ts';
import { PARENT_GATE_KEY } from '../parentGate.ts';
import { INBOX_PASS_KEY } from '../studentInboxClient.ts';
import { loadIndexCards, writeIndexCards } from '../indexCards.ts';
import { emptyRankPhotoStore } from '../rankPhotos.ts';
import { setRankBelt, setRankTapeCount } from '../studentRank.ts';
import {
  addStudentProfile,
  installStudentProfileScope,
  readActiveStudentProfile,
  switchStudentProfile,
} from '../studentProfiles.ts';
import { addJournalEntry } from '../studentEdition.ts';
import { applyCoachFile, PACKET_PICKER_MESSAGE } from '../studentTools.ts';
import { STREAK_TARGET_KEY } from '../trainingStreak.ts';
import { parsePacket } from './core.ts';
import { applyStudentRestore, buildStudentPacket, readRestoreChoice } from './student.ts';
import { buildDesignedPacket, PACKET_PLANS } from './stubs.ts';

const SECRET_PASS = 'super-secret-inbox-pass';
const SECRET_PIN = 'deadbeef-pin-hash';
const WHEN = new Date('2026-10-24T15:00:00.000Z');

function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    get length() {
      return values.size;
    },
  };
}

function wipe(store: ReturnType<typeof memory>) {
  for (const key of [...store.values.keys()]) store.values.delete(key);
}

function scores(value: 2 | 3 | 4 | 5) {
  return {
    guard: value,
    passing: value,
    takedowns: value,
    escapes: value,
    submissions: value,
    conditioning: value,
    mindset: value,
  } as const;
}

function journal(note: string, belt: 'blue' | 'white', stripes: number, minutes: number, now: number) {
  const named = setStudentProfile(blankStudentReport(now), {
    displayName: note,
    gymName: 'Gym',
    startedOn: '2020-01-01',
  });
  const ranked = setRankTapeCount(setRankBelt(named, belt, now), stripes, now + 1);
  return addJournalEntry(
    ranked,
    {
      date: '2026-10-17',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [{ id: '', name: 'Armbar' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: note,
    },
    now + 2,
  );
}

function cards(name: string) {
  return {
    version: 1 as const,
    cards: [{ id: `term.${name}`, faceId: 'sweeps' as const, name, tree: null, rating: 4 as const }],
  };
}

function plantSecrets(store: ReturnType<typeof memory>) {
  store.setItem(INBOX_PASS_KEY, SECRET_PASS);
  store.setItem(PARENT_GATE_KEY, JSON.stringify({ version: 1, on: true, pinHash: SECRET_PIN, held: [], declined: [] }));
  store.setItem('advantage.studentEditionUnlocked', '1');
  store.setItem('advantage.account.reference', '11111111-1111-4111-8111-111111111111');
}

test('a student packet round-trips after the phone is cleared', async () => {
  const store = memory();
  plantSecrets(store);
  const blue = setRankTapeCount(setRankBelt(setStudentProfile(blankStudentReport(20), {
    displayName: 'hip escape',
    gymName: 'Gym',
    startedOn: '2020-01-01',
  }), 'blue', 21), 2, 22);
  saveStudentReport(store, addJournalEntry(setRankBelt(blue, 'purple', 23), {
    date: '2026-10-17',
    className: 'Fundamentals',
    gameTag: '',
    techniques: [{ id: '', name: 'Armbar' }],
    partners: '',
    drills: '',
    rolls: '',
    notes: 'hip escape',
  }, 24));
  writeAssessments(store, saveAssessment({ entries: [] }, { date: '2026-10-17', note: 'calm rounds', scores: scores(4) }, 30));
  writeIndexCards(store, cards('Hip bump'));
  store.setItem(STREAK_TARGET_KEY, '3');
  store.setItem(PODIUM_PHOTO_KEY, JSON.stringify({ byStudent: { 'student-local': { result: ['data:image/jpeg;base64,aaaa'] } } }));

  const first = await buildStudentPacket({ storage: store, includeVideos: false, now: WHEN });
  assert.equal(first.packet.format, 'advantage-packet');
  assert.equal(first.packet.kind, 'student');
  assert.equal(first.packet.version, 1);
  assert.equal(first.packet.profileId, 'default');
  assert.equal(first.packet.accountId, '11111111-1111-4111-8111-111111111111');
  assert.equal(first.filename, 'advantage-student-packet-2026-10-24.advantage');
  assert.equal(first.text.includes(SECRET_PASS), false);
  assert.equal(first.text.includes(SECRET_PIN), false);
  assert.equal(first.text.includes('studentEditionUnlocked'), false);
  assert.match(first.text, /hip escape/);
  assert.match(first.text, /calm rounds/);
  assert.match(first.text, /Hip bump/);
  assert.match(first.text, /Self-assessment/);
  const checked = await parsePacket(first.text);
  assert.equal(checked.ok, true);

  const choice = await readRestoreChoice(first.text);
  assert.equal(choice.ok, true);
  if (!choice.ok || !choice.choice.restorable) return;
  assert.match(choice.choice.preview.lines.join('\n'), /journal cards/);
  assert.match(choice.choice.preview.lines.join('\n'), /promotion records/);
  assert.match(choice.choice.preview.lines.join('\n'), /Nothing is written until you choose/);

  wipe(store);
  assert.equal(store.getItem('advantage.studentEditionUnlocked'), null);
  applyStudentRestore(store, choice.choice, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const restored = loadStudentReport(store);
  assert.match(JSON.stringify(restored), /hip escape/);
  assert.equal(restored.profile.belt, 'purple');
  assert.equal(restored.rank?.history.some((row) => row.belt === 'blue' && row.tapeCount === 2), true);
  assert.match(store.getItem(ASSESSMENT_STORAGE_KEY) ?? '', /calm rounds/);
  assert.equal(loadIndexCards(store).cards.some((card) => card.name === 'Hip bump'), true);
  assert.equal(store.getItem(STREAK_TARGET_KEY), '3');
  assert.match(store.getItem(PODIUM_PHOTO_KEY) ?? '', /result/);
  assert.equal(store.getItem(INBOX_PASS_KEY), null);
  assert.equal(store.getItem(PARENT_GATE_KEY), null);
  assert.equal(store.getItem('advantage.studentEditionUnlocked'), null);

  const second = await buildStudentPacket({ storage: store, includeVideos: false, now: WHEN, accountId: first.packet.accountId });
  assert.deepEqual(second.packet.sections, first.packet.sections);
});

test('merge keeps a note that exists only on this phone, and replace does not', async () => {
  const store = memory();
  saveStudentReport(store, journal('from the packet', 'blue', 1, 40, 20));
  writeIndexCards(store, cards('Hip bump'));
  const built = await buildStudentPacket({ storage: store, includeVideos: false, now: WHEN });
  saveStudentReport(store, journal('only on this phone', 'white', 0, 15, 80));
  writeIndexCards(store, cards('Scissor sweep'));
  const choice = await readRestoreChoice(built.text);
  assert.equal(choice.ok, true);
  if (!choice.ok || !choice.choice.restorable) return;
  applyStudentRestore(store, choice.choice, 'merge', { rank: emptyRankPhotoStore(), bracket: {} });
  const merged = JSON.stringify(loadStudentReport(store));
  assert.match(merged, /only on this phone/);
  assert.match(merged, /from the packet/);
  const names = loadIndexCards(store).cards.map((card) => card.name).sort();
  assert.deepEqual(names, ['Hip bump', 'Scissor sweep']);

  applyStudentRestore(store, choice.choice, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const replaced = JSON.stringify(loadStudentReport(store));
  assert.equal(replaced.includes('only on this phone'), false);
  assert.match(replaced, /from the packet/);
  assert.deepEqual(loadIndexCards(store).cards.map((card) => card.name), ['Hip bump']);
});

test('every family profile survives a clear and an import', async () => {
  const store = memory();
  installStudentProfileScope(store);
  saveStudentReport(store, journal('alex journal', 'blue', 2, 95, 20));
  writeIndexCards(store, cards('Hip bump'));
  const added = addStudentProfile(store, { name: 'Sam' });
  assert.equal(added.ok, true);
  if (!added.ok) return;
  assert.equal(switchStudentProfile(store, added.profile.id), true);
  saveStudentReport(store, journal('sam journal', 'white', 1, 40, 50));
  writeIndexCards(store, cards('Scissor sweep'));
  const first = await buildStudentPacket({ storage: store, scope: 'all', includeVideos: false, now: WHEN });
  assert.equal(first.packet.sections.scope, 'all');
  assert.equal(typeof first.packet.sections['bundle:default'], 'object');
  assert.equal(typeof first.packet.sections[`bundle:${added.profile.id}`], 'object');

  wipe(store);
  const choice = await readRestoreChoice(first.text);
  assert.equal(choice.ok, true);
  if (!choice.ok || !choice.choice.restorable) return;
  applyStudentRestore(store, choice.choice, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.equal(readActiveStudentProfile(store).name, 'Sam');
  assert.match(JSON.stringify(loadStudentReport(store)), /sam journal/);
  assert.equal(loadIndexCards(store).cards[0]?.name, 'Scissor sweep');
  assert.equal(switchStudentProfile(store, 'default'), true);
  assert.match(JSON.stringify(loadStudentReport(store)), /alex journal/);
  assert.equal(loadIndexCards(store).cards[0]?.name, 'Hip bump');

  assert.equal(switchStudentProfile(store, added.profile.id), true);
  const second = await buildStudentPacket({ storage: store, scope: 'all', includeVideos: false, now: WHEN });
  assert.deepEqual(second.packet.sections, first.packet.sections);
});

test('a tampered section is refused and a secret field is refused', async () => {
  const store = memory();
  saveStudentReport(store, journal('hip escape', 'blue', 1, 30, 20));
  const built = await buildStudentPacket({ storage: store, includeVideos: false, now: WHEN });
  const tampered = JSON.parse(built.text) as { sections: { 'bundle:default': { journal: { profile: { displayName: string } } } }; checksums: Record<string, string> };
  tampered.sections['bundle:default'].journal.profile.displayName = 'someone else';
  const bad = await parsePacket(JSON.stringify(tampered));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /checksum/);

  const poisoned = JSON.parse(built.text) as { sections: Record<string, unknown> };
  poisoned.sections.pinHash = SECRET_PIN;
  const refused = await parsePacket(JSON.stringify(poisoned));
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /secret/);

  const newer = JSON.parse(built.text) as { version: number };
  newer.version = 2;
  const future = await parsePacket(JSON.stringify(newer));
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.error, /newer Advantage/);
});

test('an older JSON backup still restores, and a packet is not a coach file', async () => {
  const store = memory();
  const report = journal('from the older file', 'blue', 1, 20, 20);
  const legacy = await buildStudentBackup({
    report,
    assessment: { entries: [] },
    scouting: [],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [],
    includeVideos: false,
    now: WHEN,
    recordStamp: false,
    prints: false,
  });
  const choice = await readRestoreChoice(legacy.json);
  assert.equal(choice.ok, true);
  if (!choice.ok) return;
  assert.equal(choice.choice.source, 'legacy');
  assert.equal(choice.choice.restorable, true);
  wipe(store);
  if (!choice.choice.restorable) return;
  const applied = applyStudentRestore(store, choice.choice, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  assert.match(applied.note, /replaced the journal/);
  assert.match(JSON.stringify(loadStudentReport(store)), /from the older file/);

  const packet = await buildStudentPacket({ storage: store, includeVideos: false, now: WHEN });
  const coach = applyCoachFile(loadStudentReport(store), { plan: null, feedback: null }, packet.text);
  assert.equal(coach.error, PACKET_PICKER_MESSAGE);
});

test('academy is the next designed packet, and designed packets do not restore', async () => {
  assert.match(PACKET_PLANS.academy.priority, /Next/);
  assert.match(PACKET_PLANS.academy.summary, /lineage/);
  assert.equal(PACKET_PLANS.academy.sections.some((section) => section.name === 'roster'), true);
  assert.equal(PACKET_PLANS.academy.excluded.includes('Stripe'), true);
  assert.match(PACKET_PLANS.media.summary, /Plus Cloud/);
  assert.match(PACKET_PLANS.instructor.summary, /character sheet/);

  const academy = await buildDesignedPacket('academy', WHEN);
  const parsed = await parsePacket(academy.text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.packet.kind, 'academy');
  assert.equal(parsed.packet.sections.status, 'designed');
  const choice = await readRestoreChoice(academy.text);
  assert.equal(choice.ok, true);
  if (!choice.ok) return;
  assert.equal(choice.choice.restorable, false);
  assert.match(choice.choice.preview.lines.join('\n'), /does not restore/);

  const store = memory();
  saveStudentReport(store, journal('keep me', 'white', 0, 10, 20));
  const before = store.getItem('matboard.studentEdition.v1');
  assert.throws(() => applyStudentRestore(store, choice.choice, 'replace', { rank: emptyRankPhotoStore(), bracket: {} }), /does not restore/);
  assert.equal(store.getItem('matboard.studentEdition.v1'), before);
});
