import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCardShare,
  cardShareDecisions,
  declineCardShare,
  dismissTournamentNotice,
  importStudentToCoachText,
  noticesForCard,
  pendingCardShares,
  receiveCardShare,
  receiveTournamentNotice,
  type CardShareRoster,
} from './coachStudentInbox.ts';
import { ACADEMY_BINDING_KEY } from './academyPathway.ts';
import { getCardSyncState } from './cardSync.ts';
import { PARENT_GATE_KEY, enableParentGate } from './parentGate.ts';
import { readPhotoReviews } from './rosterPhotoApproval.ts';
import { studentFromInput, type Student, type StudentDraft } from './rosterStore.ts';
import { cardShareAllowed, createStudentCardShare, readStudentCardShare } from './studentCardShare.ts';
import {
  parentApproveStudentCardShare,
  recordTournamentSave,
  sendStudentCardShare,
  studentCardShareDraft,
} from './studentCoachOutbox.ts';
import { addTournament, updateTournament } from './studentCompetition.ts';
import { blankStudentReport } from './studentEdition.ts';
import {
  newTournamentRegistrations,
  readStudentOutbox,
  readTournamentRegistration,
  tournamentRegistrationFile,
} from './studentEvents.ts';
import { ACADEMY_LICENSE_KEY } from './studentInboxClient.ts';
import { TEST_LOGO, testMemory } from './testPackets.ts';

function card(partial: Partial<Student> & { id: string }): Student {
  return {
    name: 'Alex', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '',
    note: '', checkedIn: false, rosterList: 'student', ...partial,
  } as Student;
}

const draft = (name: string, status: 'entered' | 'considering') => ({
  name, date: '2026-12-05', location: 'Atlanta', division: 'Adult', weightClass: '', deadline: '', link: '',
  status, targetWeight: '', targetUnit: 'lb' as const,
});

function reportFor(studentId = 'stu-alex') {
  return { ...blankStudentReport(1), studentId };
}

test('tournament registration fires only on a transition to entered', () => {
  const start = reportFor();
  const considering = addTournament(start, draft('Fall Open', 'considering'), 10);
  assert.deepEqual(newTournamentRegistrations(start, considering, 11), []);
  const id = considering.competition!.tournaments[0].id;
  const entered = updateTournament(considering, id, draft('Fall Open', 'entered'));
  const events = newTournamentRegistrations(considering, entered, 12);
  assert.equal(events.length, 1);
  assert.deepEqual(Object.keys(events[0]).sort(), ['date', 'division', 'eventId', 'eventName', 'kind', 'sentAt', 'status', 'studentId', 'v']);
  assert.equal(events[0].eventName, 'Fall Open');
  assert.equal(events[0].status, 'entered');
  // Saving again while still entered sends nothing.
  assert.deepEqual(newTournamentRegistrations(entered, updateTournament(entered, id, draft('Fall Open', 'entered')), 13), []);
  // Added straight as entered fires.
  assert.equal(newTournamentRegistrations(start, addTournament(start, draft('Pan', 'entered'), 14), 15).length, 1);
  // Journal or notes never ride along.
  assert.equal(readTournamentRegistration({ ...events[0], journal: 'private' }), null);
  assert.equal(readTournamentRegistration({ ...events[0], status: 'considering' }), null);
});

test('only a gym-account phone queues a registration; without a pass it waits for the file', async () => {
  const before = reportFor();
  const after = addTournament(before, draft('Pan', 'entered'), 20);
  const loose = testMemory();
  assert.deepEqual(await recordTournamentSave(loose, before, after, { fetchImpl: async () => { throw new Error('no'); } }), []);
  assert.equal(readStudentOutbox(loose).length, 0);
  const gym = testMemory();
  gym.setItem(ACADEMY_BINDING_KEY, JSON.stringify({
    role: 'academy', provider: 'googleDrive', folderId: 'folder123456', folderName: 'Gym', gymName: 'Advantage',
  }));
  const queued = await recordTournamentSave(gym, before, after, { fetchImpl: async () => { throw new Error('offline'); } });
  assert.equal(queued.length, 1);
  assert.equal(readStudentOutbox(gym)[0].sent, false);
  const file = tournamentRegistrationFile(queued[0]);
  assert.match(file.name, /^advantage-handoff-student-tournament-registration-/);
});

test('coach notice: shows on both linked cards, dismiss hides it, guests and unlinked are ignored, roster unchanged', () => {
  const storage = testMemory();
  const student = card({ id: 'card-1', linkedStudentId: 'stu-alex' });
  const competitor = card({ id: 'comp-1', linkedStudentId: 'stu-alex', rosterList: undefined });
  const guest = card({ id: 'guest', guestId: 'g-1', linkedStudentId: 'stu-guest' });
  const roster = [student, competitor, guest];
  const snapshot = JSON.stringify(roster);
  const event = newTournamentRegistrations(reportFor(), addTournament(reportFor(), draft('Pan', 'entered'), 30), 31)[0];
  assert.equal(receiveTournamentNotice(storage, event, roster), 'stored');
  assert.equal(noticesForCard(storage, 'card-1', roster).length, 1);
  assert.equal(noticesForCard(storage, 'comp-1', roster).length, 1);
  assert.equal(getCardSyncState('card-1', { roster, storage, actor: 'coach' })?.notices.length, 1);
  assert.equal(receiveTournamentNotice(storage, { ...event, studentId: 'stu-guest' }, roster), 'no-student');
  assert.equal(receiveTournamentNotice(storage, { ...event, studentId: 'stu-none' }, roster), 'no-student');
  assert.equal(receiveTournamentNotice(storage, { ...event, journal: 'x' }, roster), 'ignored');
  assert.equal(receiveTournamentNotice(storage, event, [{ ...student, coachSync: 'off' }]), 'sync-off');
  dismissTournamentNotice(storage, event.eventId);
  assert.equal(noticesForCard(storage, 'card-1', roster).length, 0);
  assert.equal(noticesForCard(storage, 'comp-1', roster).length, 0);
  assert.equal(JSON.stringify(roster), snapshot);
  const file = tournamentRegistrationFile({ ...event, eventId: 'treg-other', sentAt: 40 });
  assert.deepEqual(importStudentToCoachText(storage, file.json, roster), { kind: 'notice', result: 'stored' });
  assert.deepEqual(importStudentToCoachText(storage, '{"kind":"coach-rank-update"}', roster), { kind: 'not-student-file' });
});

test('card share: only with Pro, Plus Cloud, or a gym Drive; profile and card fields only; photo pending', () => {
  assert.equal(cardShareAllowed({}), false);
  assert.equal(cardShareAllowed({ gymDrive: true }), true);
  assert.equal(cardShareAllowed({ plusCloud: true }), true);
  assert.equal(cardShareAllowed({ pro: true }), true);
  const refused = createStudentCardShare({ studentId: 'stu-alex', gym: {}, card: { name: 'Alex' }, parentRequired: false });
  assert.deepEqual(refused, { ok: false, error: 'not-eligible' });
  const built = createStudentCardShare({
    studentId: 'stu-alex', gym: { gymDrive: true }, card: { name: 'Alex', belt: 'Blue', stripes: 2, gym: 'Advantage' },
    photo: TEST_LOGO, parentRequired: false, now: 5, shareId: 'share-1',
  });
  assert.ok(built.ok);
  if (!built.ok) return;
  assert.deepEqual(Object.keys(built.share.card).sort(), ['belt', 'division', 'gym', 'name', 'stripes']);
  assert.equal(built.share.photo?.status, 'pending-head-coach');
  assert.equal(readStudentCardShare({ ...built.share, journal: [] }), null);
  assert.equal(readStudentCardShare({ ...built.share, card: { ...built.share.card, note: 'x' } }), null);
});

test('card share: a minor with the parent gate on waits for the parent PIN before it sends', async () => {
  const storage = testMemory();
  storage.setItem(ACADEMY_LICENSE_KEY, 'license01');
  assert.deepEqual(await enableParentGate(storage, '2468'), { ok: true });
  assert.ok(storage.getItem(PARENT_GATE_KEY));
  const report = { ...reportFor(), profile: { ...reportFor().profile, displayName: 'Alex Kim' } };
  const drafted = studentCardShareDraft(storage, report, { now: 7 });
  assert.ok(drafted.ok);
  if (!drafted.ok) return;
  assert.equal(drafted.state, 'awaiting-parent');
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await sendStudentCardShare(storage, drafted.share, fetchImpl), { ok: false, reason: 'awaiting-parent' });
  assert.equal(calls, 0);
  assert.equal((await parentApproveStudentCardShare(storage, drafted.share, '0000')).ok, false);
  const approved = await parentApproveStudentCardShare(storage, drafted.share, '2468');
  assert.ok(approved.ok);
  if (!approved.ok) return;
  assert.deepEqual(await sendStudentCardShare(storage, approved.share, fetchImpl), { ok: true, via: 'cloud' });
  assert.equal(calls, 1);
});

function memoryRoster(students: Student[]): CardShareRoster & { students: Student[] } {
  const roster = {
    students,
    add(input: StudentDraft, options: { rosterList: 'student' }) {
      const made = studentFromInput(input);
      if (!made) return null;
      const next = { ...made, rosterList: options.rosterList };
      roster.students = [...roster.students, next];
      return next;
    },
    update(id: string, patch: Partial<StudentDraft>) {
      const current = roster.students.find((row) => row.id === id);
      if (!current) return null;
      const next = { ...current, ...patch } as Student;
      roster.students = roster.students.map((row) => (row.id === id ? next : row));
      return next;
    },
    link(id: string, studentId: string) {
      return roster.update(id, { linkedStudentId: studentId } as Partial<StudentDraft>);
    },
  };
  return roster;
}

test('coach: card share stays pending until an Instructor or Coach seat accepts; merge never overwrites', () => {
  const storage = testMemory();
  const built = createStudentCardShare({
    studentId: 'stu-new', gym: { plusCloud: true }, card: { name: 'Sam Lee', belt: 'Purple', stripes: 3, division: 'Masters', gym: 'Advantage' },
    photo: TEST_LOGO, parentRequired: false, now: 9, shareId: 'share-9',
  });
  assert.ok(built.ok);
  if (!built.ok) return;
  const held = createStudentCardShare({
    studentId: 'stu-kid', gym: { plusCloud: true }, card: { name: 'Kid' }, parentRequired: true, shareId: 'share-kid',
  });
  assert.ok(held.ok);
  if (!held.ok) return;
  assert.equal(receiveCardShare(storage, held.share), 'ignored');
  assert.equal(receiveCardShare(storage, built.share), 'pending');
  assert.equal(receiveCardShare(storage, built.share), 'already');
  assert.equal(pendingCardShares(storage).length, 1);

  const existing = card({ id: 'card-sam', name: 'Sam L.', belt: 'Blue', division: '', gym: 'Coach Gym' });
  const roster = memoryRoster([existing]);
  assert.deepEqual(acceptCardShare(storage, 'share-9', 'assistant', { mode: 'new' }, roster), { ok: false, reason: 'not-allowed' });
  assert.equal(declineCardShare(storage, 'share-9', 'assistant'), false);
  assert.equal(pendingCardShares(storage).length, 1);

  const merged = acceptCardShare(storage, 'share-9', 'coach', { mode: 'merge', cardId: 'card-sam' }, roster);
  assert.ok(merged.ok);
  if (!merged.ok) return;
  assert.equal(merged.card.name, 'Sam L.');
  assert.equal(merged.card.belt, 'Blue');
  assert.equal(merged.card.gym, 'Coach Gym');
  assert.equal(merged.card.division, 'Masters');
  assert.equal(merged.card.linkedStudentId, 'stu-new');
  assert.equal(merged.card.photo, '');
  assert.equal(merged.photo, 'pending-head-coach');
  assert.equal(readPhotoReviews(storage)[0]?.stage, 'awaiting-head-coach');
  assert.equal(pendingCardShares(storage).length, 0);
  assert.equal(cardShareDecisions(storage)[0].decision, 'merged');
  assert.equal(receiveCardShare(storage, built.share), 'decided');
});

test('coach: accept as a new Student Roster card; a card linked to someone else cannot be merged', () => {
  const storage = testMemory();
  const built = createStudentCardShare({
    studentId: 'stu-new', gym: { gymDrive: true }, card: { name: 'Sam Lee', belt: 'Purple', stripes: 3 },
    parentRequired: false, shareId: 'share-a',
  });
  assert.ok(built.ok);
  if (!built.ok) return;
  receiveCardShare(storage, built.share);
  const roster = memoryRoster([card({ id: 'other', linkedStudentId: 'stu-other' })]);
  assert.deepEqual(acceptCardShare(storage, 'share-a', 'head', { mode: 'merge', cardId: 'other' }, roster), {
    ok: false, reason: 'linked-elsewhere',
  });
  const added = acceptCardShare(storage, 'share-a', 'head', { mode: 'new' }, roster);
  assert.ok(added.ok);
  if (!added.ok) return;
  assert.equal(added.card.rosterList, 'student');
  assert.equal(added.card.linkedStudentId, 'stu-new');
  assert.equal(added.card.stripes, 3);
  assert.equal(added.photo, 'none');
});
