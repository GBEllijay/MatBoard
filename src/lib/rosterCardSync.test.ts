/**
 * Coach Clipboard card sync: coach to student notes and assessments, private
 * notes, student to coach card share, registration events, competitor info,
 * the Competitor Roster toggle, and the one Sync with student app action.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCoachCardUpdate,
  acceptedCoachAssessments,
  buildCoachAssessmentUpdate,
  buildCoachNoteUpdate,
  emptyCoachCardInbox,
  latestAcceptedCoachNote,
  parentApproveCoachCardUpdate,
  pendingCoachCardUpdates,
  receiveCoachCardUpdate,
  setOwnSuggestions,
  suggestionsFromCoach,
  heldCoachCardUpdates,
} from './coachCardUpdates.ts';
import { benchmarkSyncPayload, cardPacketJson, deliverCardUpdate } from './rosterCardSync.ts';
import {
  readPrivateCoachNotes,
  readRosterCard,
  ROSTER_CARD_PRIVATE_KEY,
  setStudentAppSync,
  updateRosterCard,
  writePrivateCoachNotes,
  emptyCardRecord,
} from './rosterCardStore.ts';
import { coachCardBackup, restoreCoachCardBackup } from './rosterCardBackup.ts';
import { lockedDataSnapshot } from './lockedExport.ts';
import { serializeRosterCsv } from './rosterCsv.ts';
import {
  buildCardShare,
  buildCompetitorInfo,
  canApproveNewCards,
  gymShareAvailable,
  parseStudentToCoach,
  pendingNewCards,
  pendingNotices,
  receiveForCoach,
  registrationEvents,
  registrationNoticeText,
  SHARE_CARD_LABEL,
  type CoachInbox,
} from './studentToCoach.ts';
import {
  addToCompetitorRoster,
  approveNewStudentCard,
  applyStudentNotice,
  competitorDraftFromStudentCard,
  decideCardPhoto,
  removeLinkedCompetitorCard,
  turnOffCompetitorToggle,
} from './rosterCardActions.ts';
import { addStudent, getRoster, linkRosterCard, resetRoster, updateStudent } from './rosterStore.ts';
import { blankStudentReport, setTechniquePolicy, setTrainingStyle } from './studentEdition.ts';
import { addTournament, updateTournament } from './studentCompetition.ts';
import type { StudentProgressReport } from './progress/types.ts';
import type { AssessmentEntry } from './studentAssessment.ts';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    get length() {
      return data.size;
    },
    key: (index: number) => [...data.keys()][index] ?? null,
  };
}

const PRIVATE = 'Parent asked about fees — PRIVATE-XYZ';
const DAY = '2026-11-03';

function student(id = 'stu-1'): StudentProgressReport {
  const base = blankStudentReport(1_000);
  return { ...base, studentId: id, id, profile: { ...base.profile, id, displayName: 'Ana Silva', gymName: 'Ellijay BJJ', startedOn: '2024-02-01' } };
}

const assessment: AssessmentEntry = {
  id: 'a1',
  date: DAY,
  note: 'Strong base',
  scores: { guard: 4, passing: 3, takedowns: 2, escapes: 4, submissions: 3, conditioning: 4, mindset: 5 },
} as AssessmentEntry;

function tournamentDraft(status: 'considering' | 'entered', name = 'Atlanta Open') {
  return { name, date: '2026-12-05', location: 'Atlanta', division: 'Adult Blue Light', deadline: '', link: '', status, targetWeight: '', targetUnit: 'lb' as const };
}

// ---------- B / C: training notes, sends, private notes ----------

test('no auto-sync: saving training notes on the card makes no update', () => {
  const store = memory();
  updateRosterCard('r1', (row) => ({ ...row, trainingNotes: 'Keep elbows in' }), store);
  const inbox = emptyCoachCardInbox();
  assert.equal(pendingCoachCardUpdates(inbox, 'stu-1').length, 0);
  assert.equal(readRosterCard('r1', store).sent.length, 0);
});

test('explicit Send to student journal creates a pending update; acceptance appends without overwriting', async () => {
  const built = buildCoachNoteUpdate({ studentId: 'stu-1', day: DAY, text: 'Keep elbows in', coachName: 'Coach J' });
  assert.ok(built.ok);
  if (!built.ok) return;
  let inbox = receiveCoachCardUpdate(emptyCoachCardInbox(), built.packet, { parentGate: false }).inbox;
  assert.equal(pendingCoachCardUpdates(inbox, 'stu-1').length, 1);
  const delivery = await deliverCardUpdate(built.packet);
  assert.equal(delivery.mode, 'file');

  let report = student();
  report = {
    ...report,
    journal: [{ id: 'j1', date: DAY, createdAt: 5, updatedAt: 5, body: 'My own notes', amendments: [] } as unknown as StudentProgressReport['journal'][number]],
  };
  const done = acceptCoachCardUpdate(inbox, report, built.packet.updateId, 10);
  assert.equal(done.applied, true);
  const entry = done.report.journal.find((row) => row.id === 'j1');
  assert.ok(entry);
  assert.equal((entry as unknown as { body: string }).body, 'My own notes');
  assert.match(JSON.stringify(entry), /Keep elbows in/);
  assert.match(JSON.stringify(entry), /coach/i);
  inbox = done.inbox;
  assert.equal(suggestionsFromCoach(inbox, 'stu-1').text.includes('Keep elbows in'), true);
});

test('parent gate holds a coach note until a parent approves', () => {
  const built = buildCoachNoteUpdate({ studentId: 'stu-1', day: DAY, text: 'Hip escapes' });
  assert.ok(built.ok);
  if (!built.ok) return;
  let inbox = receiveCoachCardUpdate(emptyCoachCardInbox(), built.packet, { parentGate: true }).inbox;
  assert.equal(heldCoachCardUpdates(inbox, 'stu-1').length, 1);
  assert.equal(pendingCoachCardUpdates(inbox, 'stu-1').length, 0);
  assert.equal(acceptCoachCardUpdate(inbox, student(), built.packet.updateId).applied, false);
  inbox = parentApproveCoachCardUpdate(inbox, built.packet.updateId);
  assert.equal(pendingCoachCardUpdates(inbox, 'stu-1').length, 1);
});

test("student's own edit of Suggestions from coach never flows back", () => {
  const built = buildCoachNoteUpdate({ studentId: 'stu-1', day: DAY, text: 'Coach text' });
  assert.ok(built.ok);
  if (!built.ok) return;
  let inbox = receiveCoachCardUpdate(emptyCoachCardInbox(), built.packet, { parentGate: false }).inbox;
  inbox = acceptCoachCardUpdate(inbox, student(), built.packet.updateId).inbox;
  inbox = setOwnSuggestions(inbox, 'My edited copy');
  assert.equal(suggestionsFromCoach(inbox, 'stu-1').text, 'My edited copy');
  // The coach side keeps its own text; nothing in the student inbox is a coach-bound packet.
  assert.equal(JSON.stringify(inbox.items).includes('My edited copy'), false);
  assert.doesNotMatch(cardPacketJson(built.packet), /My edited copy/);
});

test('private coach notes never reach a note packet, benchmark sync, competitor draft, or CSV', () => {
  const store = memory();
  writePrivateCoachNotes('r1', PRIVATE, store);
  updateRosterCard('r1', (row) => ({ ...row, trainingNotes: 'Sendable', benchmarkSync: true, benchmarkChecks: { c1: true } }), store);
  const record = readRosterCard('r1', store);
  assert.doesNotMatch(JSON.stringify(record), /PRIVATE-XYZ/);
  const built = buildCoachNoteUpdate({ studentId: 'stu-1', day: DAY, text: record.trainingNotes });
  assert.ok(built.ok);
  if (built.ok) assert.doesNotMatch(cardPacketJson(built.packet), /PRIVATE-XYZ/);
  const sync = benchmarkSyncPayload(record, 'stu-1', 'white', [{ id: 'c1', name: 'Shrimp' }]);
  assert.doesNotMatch(JSON.stringify(sync), /PRIVATE-XYZ/);
  const draft = competitorDraftFromStudentCard(
    { id: 'r1', name: 'Ana', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false, rosterList: 'student' } as never,
    record,
  );
  assert.doesNotMatch(JSON.stringify(draft), /PRIVATE-XYZ/);
  const csv = serializeRosterCsv([{ name: 'Ana', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: '', checkedIn: false } as never]);
  assert.doesNotMatch(csv, /PRIVATE-XYZ/);
});

test("private coach notes ARE in the coach's own backup and restore on a new device", () => {
  const store = memory();
  writePrivateCoachNotes('r1', PRIVATE, store);
  updateRosterCard('r1', (row) => ({ ...row, trainingNotes: 'Sendable' }), store);
  const backup = coachCardBackup(store);
  assert.match(JSON.stringify(backup), /PRIVATE-XYZ/);
  assert.equal(ROSTER_CARD_PRIVATE_KEY in lockedDataSnapshot(store), true);
  const fresh = memory();
  assert.equal(restoreCoachCardBackup(fresh, JSON.parse(JSON.stringify(backup))) >= 2, true);
  assert.equal(readPrivateCoachNotes('r1', fresh), PRIVATE);
  assert.equal(readRosterCard('r1', fresh).trainingNotes, 'Sendable');
  assert.equal(restoreCoachCardBackup(fresh, { kind: 'other' }), 0);
});

// ---------- D: Latest from coach ----------

test('Latest from coach picks the newest accepted note and ignores pending, held, and private', () => {
  assert.equal(latestAcceptedCoachNote(emptyCoachCardInbox(), 'stu-1'), null);
  const mk = (text: string, now: number) => {
    const built = buildCoachNoteUpdate({ studentId: 'stu-1', day: DAY, text, now });
    assert.ok(built.ok);
    return built.ok ? built.packet : (null as never);
  };
  const older = mk('Older accepted', 100);
  const newer = mk('Newer accepted', 200);
  const pending = mk('Pending newest', 300);
  const held = mk('Held newest', 400);
  let inbox = emptyCoachCardInbox();
  inbox = receiveCoachCardUpdate(inbox, older, { parentGate: false }).inbox;
  inbox = receiveCoachCardUpdate(inbox, newer, { parentGate: false }).inbox;
  inbox = receiveCoachCardUpdate(inbox, pending, { parentGate: false }).inbox;
  inbox = receiveCoachCardUpdate(inbox, held, { parentGate: true }).inbox;
  inbox = acceptCoachCardUpdate(inbox, student(), older.updateId).inbox;
  inbox = acceptCoachCardUpdate(inbox, student(), newer.updateId).inbox;
  const latest = latestAcceptedCoachNote(inbox, 'stu-1');
  assert.equal(latest?.text, 'Newer accepted');
  assert.equal(latest?.day, DAY);
  assert.doesNotMatch(JSON.stringify(latest), /PRIVATE-XYZ|Pending newest|Held newest/);
});

// ---------- E: coach assessment to the student card ----------

test('assessment: no auto-send, explicit send is pending, acceptance shows as Coach view, parent gate holds', () => {
  const store = memory();
  updateRosterCard('r1', (row) => ({ ...row, coachAssessments: [assessment] }), store);
  assert.equal(readRosterCard('r1', store).sent.length, 0);
  const built = buildCoachAssessmentUpdate({ studentId: 'stu-1', assessment });
  assert.ok(built.ok);
  if (!built.ok) return;
  let inbox = receiveCoachCardUpdate(emptyCoachCardInbox(), built.packet, { parentGate: true }).inbox;
  assert.equal(acceptedCoachAssessments(inbox, 'stu-1').length, 0);
  assert.equal(acceptCoachCardUpdate(inbox, student(), built.packet.updateId).applied, false);
  inbox = parentApproveCoachCardUpdate(inbox, built.packet.updateId);
  assert.equal(pendingCoachCardUpdates(inbox, 'stu-1').length, 1);
  inbox = acceptCoachCardUpdate(inbox, student(), built.packet.updateId).inbox;
  const shown = acceptedCoachAssessments(inbox, 'stu-1');
  assert.equal(shown.length, 1);
  assert.equal(shown[0]?.scores.mindset, 5);
});

// ---------- F: registration events ----------

test("registration: 'considering' sends nothing, 'entered' sends once with only the allowed fields", () => {
  const before = student();
  const considering = addTournament(before, tournamentDraft('considering'), 2_000);
  assert.equal(registrationEvents(before, considering).length, 0);
  const id = considering.competition!.tournaments[0]!.id;
  const entered = updateTournament(considering, id, { ...tournamentDraft('entered'), targetWeight: '170' }, 3_000);
  const withJournal: StudentProgressReport = { ...entered, journal: [{ id: 'j', date: DAY, body: 'SECRET-JOURNAL' } as never] };
  const events = registrationEvents(considering, withJournal);
  assert.equal(events.length, 1);
  const packet = events[0]!;
  assert.equal(packet.type, 'registration');
  if (packet.type !== 'registration') return;
  assert.deepEqual(Object.keys(packet.registration).sort(), ['date', 'division', 'event', 'status', 'tournamentId']);
  assert.equal(packet.registration.status, 'entered');
  assert.doesNotMatch(JSON.stringify(packet), /SECRET-JOURNAL|170|Atlanta"/);
  assert.equal(registrationNoticeText(packet.registration), 'Registered: Atlanta Open, 2026-12-05');
  // Saving again while already Entered does not resend.
  assert.equal(registrationEvents(withJournal, withJournal).length, 0);
  // Added straight as Entered sends.
  assert.equal(registrationEvents(before, addTournament(before, tournamentDraft('entered', 'Pan'), 4_000)).length, 1);
});

test('registration and competitor info arrive as pending notices and never overwrite coach data', () => {
  resetRoster();
  const store = memory();
  const card = addStudent({ name: 'Ana Silva', belt: 'Blue', division: 'Coach division', gym: 'Ellijay', lastPromotion: '', note: '' }, { rosterList: 'student' })!;
  linkRosterCard(card.id, 'stu-1');
  updateRosterCard(card.id, (row) => ({ ...row, trainingStyle: 'gi', trainingNotes: 'Coach notes stay' }), store);
  const comp = addToCompetitorRoster(card.id, store);
  assert.ok(comp.ok);
  if (!comp.ok) return;
  updateStudent(comp.competitorId, { division: 'Adult Blue Light' });

  const s = student();
  const reg = registrationEvents(s, addTournament(s, tournamentDraft('entered'), 2_000))[0]!;
  const info = buildCompetitorInfo(s, { division: 'Master 1 Feather', weightClass: 'Feather', trainingStyle: 'nogi' })!;
  let inbox: CoachInbox = { items: [] };
  inbox = receiveForCoach(inbox, [reg, info]).inbox;
  assert.equal(receiveForCoach(inbox, [reg]).added, 0);
  assert.equal(pendingNotices(inbox, 'stu-1').length, 2);
  inbox = applyStudentNotice(inbox, inbox.items[1]!, card.id, store);
  const after = getRoster().students.find((row) => row.id === comp.competitorId)!;
  assert.equal(after.division, 'Adult Blue Light');
  assert.equal(readRosterCard(card.id, store).trainingStyle, 'gi');
  assert.equal(readRosterCard(card.id, store).trainingNotes, 'Coach notes stay');
  assert.equal(pendingNotices(inbox, 'stu-1').length, 1);
});

// ---------- F: Competitor Roster toggle ----------

test('Add to Competitor Roster makes a new prefilled card linked to the same student; unchecking never deletes', () => {
  resetRoster();
  const store = memory();
  const card = addStudent({ name: 'Ana Silva', belt: 'Purple', division: '', gym: 'Ellijay BJJ', lastPromotion: '2026-05-01', note: 'coach note' }, { rosterList: 'student' })!;
  updateStudent(card.id, { stripes: 2 });
  linkRosterCard(card.id, 'stu-1');
  updateRosterCard(card.id, (row) => ({ ...row, trainingStyle: 'both' }), store);

  const result = addToCompetitorRoster(card.id, store);
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.created, true);
  const roster = getRoster().students;
  const comp = roster.find((row) => row.id === result.competitorId)!;
  assert.notEqual(comp.id, card.id);
  assert.equal(comp.rosterList, undefined);
  assert.equal(comp.name, 'Ana Silva');
  assert.equal(comp.belt, 'Purple');
  assert.equal(comp.stripes, 2);
  assert.equal(comp.gym, 'Ellijay BJJ');
  assert.equal(comp.division, 'Gi & No-Gi');
  assert.equal(comp.linkedStudentId, 'stu-1');
  assert.equal(readRosterCard(card.id, store).competitorOn, true);

  turnOffCompetitorToggle(card.id, store);
  assert.ok(getRoster().students.some((row) => row.id === comp.id));
  assert.equal(readRosterCard(card.id, store).competitorCardId, comp.id);
  const again = addToCompetitorRoster(card.id, store);
  assert.ok(again.ok && !again.created && again.competitorId === comp.id);
  assert.equal(removeLinkedCompetitorCard(card.id, false, store), false);
  assert.ok(getRoster().students.some((row) => row.id === comp.id));
});

// ---------- G: one Sync with student app action ----------

test('Sync with student app is one stored flag, shared by the card toggle and the Add student offer', () => {
  const store = memory();
  assert.equal(readRosterCard('r1', store).benchmarkSync, emptyCardRecord().benchmarkSync);
  setStudentAppSync('r1', true, store);
  assert.equal(readRosterCard('r1', store).benchmarkSync, true);
  setStudentAppSync('r1', false, store);
  assert.equal(readRosterCard('r1', store).benchmarkSync, false);
});

// ---------- H / J: Upload for coach approval ----------

test('share option label and availability: hidden without Pro, Plus Cloud, or a gym Drive', () => {
  assert.equal(SHARE_CARD_LABEL, 'Upload for coach approval to add to student card');
  assert.equal(gymShareAvailable({ academyFolder: false, cloudLicense: false }), false);
  assert.equal(gymShareAvailable({ academyFolder: true, cloudLicense: false }), true);
  assert.equal(gymShareAvailable({ academyFolder: false, cloudLicense: true }), true);
  assert.equal(gymShareAvailable({ academyFolder: false, cloudLicense: false, gymPro: true }), true);
});

test('card upload carries profile fields only: no move-permission toggles, journal, or notes', () => {
  let report = student();
  report = setTrainingStyle(report, 'nogi');
  report = setTechniquePolicy(report, 'wristLocks', true);
  report = setTechniquePolicy(report, 'heelHooks', true);
  report = { ...report, journal: [{ id: 'j', date: DAY, body: 'SECRET-JOURNAL' } as never], goals: [{ id: 'g', title: 'SECRET-GOAL' } as never] };
  const share = buildCardShare(report, 'data:image/jpeg;base64,AAAA', { parentToggle: false, parentApproved: false });
  assert.ok(share.ok);
  if (!share.ok || share.packet.type !== 'card-share') return;
  const text = JSON.stringify(share.packet);
  assert.doesNotMatch(text, /wristLocks|heelHooks|legLocks|straightAnkleLock|techniquePolicy|competition"/);
  assert.doesNotMatch(text, /SECRET-JOURNAL|SECRET-GOAL/);
  assert.deepEqual(Object.keys(share.packet.card).sort(), [
    'beltAchievedOn', 'beltLabel', 'belt', 'displayName', 'gymName', 'lastStripeOn', 'photo', 'startedOn', 'stripes', 'system', 'trainingStyle',
  ].sort());
  assert.equal(share.packet.card.trainingStyle, 'nogi');
  // Parsing on the coach side drops anything extra too.
  const tampered = { ...share.packet, card: { ...share.packet.card, techniquePolicy: { wristLocks: true } }, journal: ['x'] };
  assert.doesNotMatch(JSON.stringify(parseStudentToCoach(tampered)), /wristLocks|journal/);
});

test('parent gate: a minor with the parent toggle on is held until a parent approves', () => {
  const kid: StudentProgressReport = { ...student(), beltBook: { mode: 'kids', birthYear: 2016 } as never };
  const held = buildCardShare(kid, null, { parentToggle: true, parentApproved: false });
  assert.equal(held.ok, false);
  assert.equal(!held.ok && held.held, 'parent');
  assert.ok(buildCardShare(kid, null, { parentToggle: true, parentApproved: true }).ok);
  assert.ok(buildCardShare(kid, null, { parentToggle: false, parentApproved: false }).ok);
  assert.ok(buildCardShare(student(), null, { parentToggle: true, parentApproved: false }).ok);
});

test('New student cards: pending inbox, only the head coach approves, approval auto-adds with photo pending', () => {
  resetRoster();
  const store = memory();
  const share = buildCardShare(setTrainingStyle(student(), 'gi'), 'data:image/jpeg;base64,AAAA', { parentToggle: false, parentApproved: false });
  assert.ok(share.ok);
  if (!share.ok) return;
  let inbox: CoachInbox = receiveForCoach({ items: [] }, [share.packet]).inbox;
  assert.equal(pendingNewCards(inbox).length, 1);
  assert.equal(getRoster().students.length, 0);

  for (const presetId of ['coach', 'assistant-coach', 'program-director']) {
    assert.equal(canApproveNewCards({ presetId }), false);
    const denied = approveNewStudentCard(inbox, pendingNewCards(inbox)[0]!, { presetId }, { storage: store });
    assert.equal(denied.ok, false);
  }
  assert.equal(getRoster().students.length, 0);
  assert.equal(canApproveNewCards(null), true);
  assert.equal(canApproveNewCards({ presetId: 'instructors' }), true);

  const approved = approveNewStudentCard(inbox, pendingNewCards(inbox)[0]!, { presetId: 'instructors' }, { storage: store });
  assert.ok(approved.ok);
  if (!approved.ok) return;
  inbox = approved.inbox;
  assert.equal(pendingNewCards(inbox).length, 0);
  const added = getRoster().students.find((row) => row.id === approved.rosterId)!;
  assert.equal(added.rosterList, 'student');
  assert.equal(added.name, 'Ana Silva');
  assert.equal(added.linkedStudentId, 'stu-1');
  const record = readRosterCard(added.id, store);
  assert.equal(record.trainingStyle, 'gi');
  assert.equal(record.trainingStartedOn, '2024-02-01');
  assert.equal(record.photos.length, 1);
  assert.equal(record.photos[0]!.coach, 'pending');
  assert.equal(record.shownPhotoId, '');
  assert.equal(decideCardPhoto(added.id, record.photos[0]!.id, 'approved', { presetId: 'coach' }, store), false);
  assert.equal(decideCardPhoto(added.id, record.photos[0]!.id, 'approved', null, store), true);
  assert.equal(readRosterCard(added.id, store).shownPhotoId, record.photos[0]!.id);
});

test('merge into an existing card: coach fields win, student data fills blanks only', () => {
  resetRoster();
  const store = memory();
  const coachCard = addStudent({ name: 'Ana S.', belt: 'Blue', division: 'Coach div', gym: '', lastPromotion: '2025-01-01', note: 'coach note' }, { rosterList: 'student' })!;
  updateRosterCard(coachCard.id, (row) => ({ ...row, trainingStyle: 'both' }), store);
  const share = buildCardShare(setTrainingStyle(student(), 'nogi'), null, { parentToggle: false, parentApproved: false });
  assert.ok(share.ok);
  if (!share.ok) return;
  const inbox = receiveForCoach({ items: [] }, [share.packet]).inbox;
  const merged = approveNewStudentCard(inbox, inbox.items[0]!, null, { mergeInto: coachCard.id, storage: store });
  assert.ok(merged.ok);
  const after = getRoster().students.find((row) => row.id === coachCard.id)!;
  assert.equal(getRoster().students.length, 1);
  assert.equal(after.name, 'Ana S.');
  assert.equal(after.belt, 'Blue');
  assert.equal(after.lastPromotion, '2025-01-01');
  assert.equal(after.note, 'coach note');
  assert.equal(after.gym, 'Ellijay BJJ');
  assert.equal(after.linkedStudentId, 'stu-1');
  const record = readRosterCard(coachCard.id, store);
  assert.equal(record.trainingStyle, 'both');
  assert.equal(record.trainingStartedOn, '2024-02-01');
});
