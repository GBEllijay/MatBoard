/**
 * "Make a file for my coach": only what changed since the last file, never
 * photos, journal, or move permissions. Coach side: blanks fill, belt and
 * stripes wait for an approving seat. Send my ID lands as a pending card share.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyStudentCoachUpdate,
  buildCoachUpdateFile,
  dismissStudentCoachUpdate,
  keptStudentCoachUpdates,
  studentCompetitorSummary,
  writeShareWeightWithCoach,
  markCoachFileSent,
  pendingStudentCoachUpdates,
  receiveStudentCoachUpdate,
} from './coachProgressFile.ts';
import { pendingCardShares, receiveCardShare } from './coachStudentInbox.ts';
import { saveStudentDriveLink } from './academyPathway.ts';
import { studentCardShareDraft } from './studentCoachOutbox.ts';
import { addJournalEntry, blankStudentReport } from './studentEdition.ts';
import { addTournament, addWeighIn } from './studentCompetition.ts';
import { canAcceptCardShare } from './coachStudentInbox.ts';
import type { Student, StudentDraft } from './rosterStore.ts';
import { testMemory } from './testPackets.ts';

const PHOTO = 'data:image/png;base64,iVBORw0KGgo=';

function baseReport() {
  let report = { ...blankStudentReport(1), studentId: 'stu-alex' };
  report = { ...report, profile: { ...report.profile, displayName: 'Alex Kim', gymName: 'North Side BJJ', belt: 'Blue' } };
  report = addJournalEntry(
    report,
    { date: '2026-11-01', className: 'Fundamentals', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'SECRET-JOURNAL' },
    2,
  );
  report = addTournament(
    report,
    { name: 'Winter Open', date: '2026-12-05', location: 'Atlanta', division: 'Adult', weightClass: '', deadline: '', link: '', status: 'entered', targetWeight: '', targetUnit: 'lb' },
    3,
  );
  report = addTournament(
    report,
    { name: 'Maybe Cup', date: '2026-12-12', location: 'Macon', division: 'Adult', weightClass: '', deadline: '', link: '', status: 'considering', targetWeight: '', targetUnit: 'lb' },
    4,
  );
  return { ...report, techniquePolicy: { allowed: ['SECRET-POLICY'] }, photo: PHOTO } as typeof report;
}

const assessments = [{ id: 'as-1', date: '2026-11-02', note: 'Guard felt better', scores: {} }];

test('first file has profile, card, competition (entered only) and assessments; never photos, journal, or policy', () => {
  const storage = testMemory();
  const built = buildCoachUpdateFile(baseReport(), { storage, assessments, now: 100, today: '2026-11-04' });
  assert.deepEqual(built.included.sort(), ['assessments', 'card', 'competition', 'profile']);
  assert.equal(built.update.profile?.displayName, 'Alex Kim');
  assert.equal(built.update.card?.belt, 'Blue');
  assert.deepEqual(built.update.competition?.tournaments.map((row) => row.name), ['Winter Open']);
  assert.equal(built.update.assessments?.length, 1);
  assert.doesNotMatch(built.json, /SECRET-JOURNAL|SECRET-POLICY|techniquePolicy|data:image/);
  assert.match(built.name, /^advantage-update-for-coach-Alex-Kim-2026-11-04\.json$/);
});

test('next file has only what changed since the last one', () => {
  const storage = testMemory();
  const report = baseReport();
  const first = buildCoachUpdateFile(report, { storage, assessments, now: 100, today: '2026-11-04' });
  markCoachFileSent(storage, first);
  const same = buildCoachUpdateFile(report, { storage, assessments, now: 200, today: '2026-11-04' });
  assert.deepEqual(same.included, []);
  assert.equal(same.update.since, 100);
  const promoted = report;
  const next = buildCoachUpdateFile(
    { ...promoted, profile: { ...promoted.profile, belt: 'Purple' } },
    { storage, assessments: [...assessments, { id: 'as-2', date: '2026-11-03', note: '', scores: {} }], now: 300, today: '2026-11-04' },
  );
  assert.deepEqual(next.included.sort(), ['assessments', 'card']);
  assert.deepEqual(next.update.assessments?.map((row) => row.id), ['as-2']);
});

function roster(students: Student[]) {
  return {
    students,
    update(id: string, draft: Partial<StudentDraft>) {
      const index = students.findIndex((row) => row.id === id);
      if (index < 0) return null;
      students[index] = { ...students[index], ...draft } as Student;
      return students[index];
    },
  };
}

function card(partial: Partial<Student> & { id: string }): Student {
  return {
    name: '', belt: 'White', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '',
    note: '', checkedIn: false, rosterList: 'student', ...partial,
  } as Student;
}

test('coach import: blanks fill, belt waits for approval, assistants cannot approve', () => {
  const student = testMemory();
  const coach = testMemory();
  const built = buildCoachUpdateFile(baseReport(), { storage: student, assessments, now: 100, today: '2026-11-04' });
  assert.equal(receiveStudentCoachUpdate(coach, JSON.parse(built.json)), 'pending');
  assert.equal(receiveStudentCoachUpdate(coach, JSON.parse(built.json)), 'duplicate');
  const id = built.update.updateId;
  const cards = [card({ id: 'c1', linkedStudentId: 'stu-alex', gym: 'Coach Typed Gym' } as Partial<Student> & { id: string })];
  assert.deepEqual(applyStudentCoachUpdate(coach, id, roster(cards), { actor: 'assistant', approveRank: true }), { ok: false, reason: 'not-allowed' });
  const applied = applyStudentCoachUpdate(coach, id, roster(cards), { actor: 'coach', approveRank: false });
  assert.ok(applied.ok);
  if (!applied.ok) return;
  assert.equal(applied.rank, 'not-approved');
  assert.equal(cards[0].name, 'Alex Kim');
  assert.equal(cards[0].gym, 'Coach Typed Gym');
  assert.equal(cards[0].belt, 'White');
  assert.equal(pendingStudentCoachUpdates(coach).length, 0);

  const again = buildCoachUpdateFile(baseReport(), { storage: testMemory(), assessments, now: 500, today: '2026-11-04' });
  receiveStudentCoachUpdate(coach, JSON.parse(again.json));
  const approved = applyStudentCoachUpdate(coach, again.update.updateId, roster(cards), { actor: 'head', approveRank: true });
  assert.ok(approved.ok && approved.rank === 'approved');
  assert.equal(cards[0].belt, 'Blue');

  const third = buildCoachUpdateFile(baseReport(), { storage: testMemory(), assessments, now: 900, today: '2026-11-04' });
  receiveStudentCoachUpdate(coach, JSON.parse(third.json));
  dismissStudentCoachUpdate(coach, third.update.updateId);
  assert.equal(pendingStudentCoachUpdates(coach).length, 0);
});

test('Send my ID to coach: no photo, waits on the coach side as a pending card share', () => {
  const student = testMemory();
  saveStudentDriveLink(student, { role: 'academy', provider: 'googleDrive', folderId: 'gym-folder-1', folderName: 'Gym', accountLabel: null, gymName: 'North Side BJJ' });
  const drafted = studentCardShareDraft(student, baseReport(), { photo: null, now: 7 });
  assert.ok(drafted.ok);
  if (!drafted.ok) return;
  assert.doesNotMatch(JSON.stringify(drafted.share), /data:image|SECRET-JOURNAL/);
  const coach = testMemory();
  assert.equal(receiveCardShare(coach, drafted.share), 'pending');
  assert.equal(pendingCardShares(coach)[0].studentId, 'stu-alex');
});

test('Send my ID with no gym folder or cloud is not eligible (the page shows the ID/QR instead)', () => {
  const drafted = studentCardShareDraft(testMemory(), baseReport(), { photo: null, now: 7 });
  assert.equal(drafted.ok, false);
  if (!drafted.ok) assert.equal(drafted.error, 'not-eligible');
});

test('owner answer 1: any Coach seat can approve belt changes; assistants cannot', () => {
  assert.equal(canAcceptCardShare('owner'), true);
  assert.equal(canAcceptCardShare('head'), true);
  assert.equal(canAcceptCardShare('coach'), true);
  assert.equal(canAcceptCardShare('assistant'), false);
  const coach = testMemory();
  const built = buildCoachUpdateFile(baseReport(), { storage: testMemory(), assessments, now: 100, today: '2026-11-04' });
  receiveStudentCoachUpdate(coach, JSON.parse(built.json));
  const cards = [card({ id: 'c1', linkedStudentId: 'stu-alex' } as Partial<Student> & { id: string })];
  const applied = applyStudentCoachUpdate(coach, built.update.updateId, roster(cards), { actor: 'coach', approveRank: true });
  assert.ok(applied.ok && applied.rank === 'approved');
  assert.equal(cards[0].belt, 'Blue');
});

test('owner answer 3: entered tournaments (never considering), weight only with opt-in, kept on the coach side', () => {
  let report = baseReport();
  report = addWeighIn(report, { date: '2026-11-03', weight: '170', unit: 'lb', note: 'SECRET-NOTE' }, 5);
  const off = testMemory();
  const noShare = buildCoachUpdateFile(report, { storage: off, assessments, now: 100, today: '2026-11-04' });
  assert.equal(noShare.update.weight, undefined);
  assert.ok(!noShare.json.includes('170'));
  const names = noShare.update.competition?.tournaments.map((t) => t.name) ?? [];
  assert.deepEqual(names, ['Winter Open']);
  assert.ok(!noShare.json.includes('Maybe Cup'));

  const on = testMemory();
  writeShareWeightWithCoach(on, true);
  const shared = buildCoachUpdateFile(report, { storage: on, assessments, now: 200, today: '2026-11-04' });
  assert.equal(shared.update.weight?.weighIns.length, 1);
  assert.equal(shared.update.weight?.weighIns[0].weight, 170);
  assert.ok(!shared.json.includes('SECRET-NOTE'));

  const coach = testMemory();
  receiveStudentCoachUpdate(coach, JSON.parse(shared.json));
  const cards = [card({ id: 'c1', linkedStudentId: 'stu-alex' } as Partial<Student> & { id: string })];
  const applied = applyStudentCoachUpdate(coach, shared.update.updateId, roster(cards), { actor: 'coach', approveRank: false });
  assert.ok(applied.ok);
  assert.equal(cards[0].division, 'Adult');
  assert.equal(keptStudentCoachUpdates(coach, 'stu-alex').length, 1);
  const summary = studentCompetitorSummary(coach, 'stu-alex');
  assert.deepEqual(summary.tournaments.map((t) => t.name), ['Winter Open']);
  assert.equal(summary.weighIns.length, 1);
  // A typed division is never overwritten.
  const typed = [card({ id: 'c2', linkedStudentId: 'stu-alex', division: 'Masters' } as Partial<Student> & { id: string })];
  const again = buildCoachUpdateFile(report, { storage: testMemory(), assessments, now: 300, today: '2026-11-04' });
  receiveStudentCoachUpdate(coach, JSON.parse(again.json));
  applyStudentCoachUpdate(coach, again.update.updateId, roster(typed), { actor: 'coach', approveRank: false });
  assert.equal(typed[0].division, 'Masters');
});
