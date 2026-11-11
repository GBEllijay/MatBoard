/**
 * "Make a file for my coach": only what changed since the last file, never
 * photos, journal, or move permissions. Coach side: blanks fill, belt and
 * stripes wait for an approving seat. Send my ID lands as a pending card share.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COACH_FILE_SNAPSHOT_KEY,
  applyStudentCoachUpdate,
  approvedStudentScouting,
  buildCoachUpdateFile,
  dismissStudentCoachUpdate,
  keptStudentCoachUpdates,
  markCoachFileSent,
  pendingStudentCoachUpdates,
  readShareScoutingWithCoach,
  readStudentCoachUpdate,
  receiveStudentCoachUpdate,
  studentCompetitorSummary,
  writeShareScoutingWithCoach,
  writeShareWeightWithCoach,
} from './coachProgressFile.ts';
import { addCompetitionMatch, addCompetitionResult } from './studentCompetition.ts';
import { addScoutBout, addScoutingCard, updateScoutingCard } from './studentScouting.ts';
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

function scoutCards() {
  let cards = addScoutingCard(
    [],
    {
      name: 'Jordan Hale',
      gym: 'Checkmat',
      belt: 'Purple',
      weightClass: 'Middle',
      group: 'open',
      style: 'pressure passer',
      notes: 'likes closed guard',
      ratings: { guard: 4, passing: 2, sweeps: 5, takedowns: 3, escapes: 3, submissions: 4, conditioning: 2, mindset: 5 },
      strengths: 'top pressure',
      weaknesses: 'open guard',
    },
    60,
  );
  const bouts = addScoutBout([], { result: 'win', date: '2026-10-01', event: 'PRIVATE-EVENT', method: 'PRIVATE-METHOD' }, 61);
  cards = updateScoutingCard(cards, cards[0].id, {
    name: cards[0].name,
    gym: cards[0].gym,
    belt: cards[0].belt,
    weightClass: cards[0].weightClass,
    group: cards[0].group,
    style: cards[0].style,
    notes: cards[0].notes,
    ratings: cards[0].ratings,
    strengths: cards[0].strengths,
    weaknesses: cards[0].weaknesses,
    bouts,
  });
  cards = addScoutingCard(
    cards,
    {
      name: 'Sam Lee',
      gym: 'Alliance',
      belt: 'Blue',
      weightClass: 'Light',
      group: 'weight',
      style: 'guard player',
      notes: 'stands up',
      ratings: { guard: 3, passing: 3, takedowns: 2, escapes: 4, submissions: 2, conditioning: 3, mindset: 3 },
      strengths: 'hooks',
      weaknesses: 'passing',
    },
    62,
  );
  return cards.map((card) => ({ ...card, photo: 'data:image/png;base64,SECRETPHOTO', otherStudentNote: 'OTHER-PRIVATE' }));
}

function reportWithSecretResult() {
  let report = baseReport();
  report = addCompetitionResult(report, { tournamentId: '', tournamentName: 'PRIVATE-OPEN', division: 'Adult' }, 70);
  const resultId = report.competition?.results.at(-1)?.id ?? '';
  report = addCompetitionMatch(report, resultId, { opponent: 'Jordan Hale', result: 'win', method: 'points', note: 'PRIVATE-RESULT-NOTE' }, 71);
  return report;
}

test('opponent cards are on by default and send only the card fields, including sweeps', () => {
  const storage = testMemory();
  assert.equal(readShareScoutingWithCoach(storage), true);
  const cards = scoutCards();
  const built = buildCoachUpdateFile(reportWithSecretResult(), { storage, assessments, scouting: cards, now: 100, today: '2026-11-04' });
  assert.ok(built.included.includes('scouting'));
  const jordan = built.update.scouting?.cards.find((card) => card.name === 'Jordan Hale');
  const sam = built.update.scouting?.cards.find((card) => card.name === 'Sam Lee');
  assert.ok(jordan && sam);
  assert.equal(built.update.scouting?.studentName, 'Alex Kim');
  assert.equal(jordan.group, 'open');
  assert.equal(jordan.weightClass, 'Middle');
  assert.equal(jordan.gym, 'Checkmat');
  assert.equal(jordan.style, 'pressure passer');
  assert.equal(jordan.belt, 'Purple');
  assert.equal(jordan.strengths, 'top pressure');
  assert.equal(jordan.weaknesses, 'open guard');
  assert.equal(jordan.notes, 'likes closed guard');
  assert.equal(jordan.ratings.sweeps, 5);
  assert.deepEqual(Object.keys(jordan.ratings).sort(), ['conditioning', 'escapes', 'guard', 'mindset', 'passing', 'submissions', 'sweeps', 'takedowns']);
  assert.equal(sam.ratings.sweeps, undefined);
  assert.deepEqual(jordan.record, { wins: 2, losses: 0, draws: 0, line: '2-0-0' });
  assert.deepEqual(Object.keys(jordan).sort(), ['belt', 'group', 'gym', 'id', 'name', 'notes', 'ratings', 'record', 'strengths', 'style', 'weaknesses', 'weightClass']);
  assert.doesNotMatch(built.json, /PRIVATE-EVENT|PRIVATE-METHOD|PRIVATE-OPEN|PRIVATE-RESULT-NOTE|OTHER-PRIVATE|SECRETPHOTO|SECRET-JOURNAL|data:image/);
});

test('unchanged opponent cards are left out of the next file, and an old snapshot still sends them once', () => {
  const storage = testMemory();
  const cards = scoutCards();
  const report = reportWithSecretResult();
  const first = buildCoachUpdateFile(report, { storage, assessments, scouting: cards, now: 100, today: '2026-11-04' });
  markCoachFileSent(storage, first);
  const same = buildCoachUpdateFile(report, { storage, assessments, scouting: cards, now: 200, today: '2026-11-04' });
  assert.equal(same.update.scouting, undefined);
  assert.ok(!same.included.includes('scouting'));
  const jordan = cards.find((card) => card.name === 'Jordan Hale');
  assert.ok(jordan);
  const edited = updateScoutingCard(cards, jordan.id, {
    name: jordan.name,
    gym: jordan.gym,
    belt: jordan.belt,
    weightClass: jordan.weightClass,
    group: jordan.group,
    style: jordan.style,
    notes: 'switched to knee cut',
    ratings: jordan.ratings,
    strengths: jordan.strengths,
    weaknesses: jordan.weaknesses,
    bouts: jordan.bouts,
  });
  const next = buildCoachUpdateFile(report, { storage, assessments, scouting: edited, now: 300, today: '2026-11-04' });
  assert.deepEqual(next.included, ['scouting']);
  assert.deepEqual(next.update.scouting?.cards.map((card) => card.name), ['Jordan Hale']);
  assert.equal(next.update.scouting?.cards[0].notes, 'switched to knee cut');

  const legacy = testMemory();
  legacy.setItem(COACH_FILE_SNAPSHOT_KEY, JSON.stringify({ at: 40, sections: {}, assessmentIds: [], weighInIds: [] }));
  const fromOld = buildCoachUpdateFile(report, { storage: legacy, assessments, scouting: cards, now: 500, today: '2026-11-04' });
  assert.equal(fromOld.update.scouting?.cards.length, 2);
  assert.equal(fromOld.update.since, 40);
});

test('opponent cards stay out while the section is off, and come back when it is turned on', () => {
  const storage = testMemory();
  const cards = scoutCards();
  const report = baseReport();
  writeShareScoutingWithCoach(storage, false);
  const off = buildCoachUpdateFile(report, { storage, assessments, scouting: cards, now: 100, today: '2026-11-04' });
  assert.equal(off.update.scouting, undefined);
  assert.doesNotMatch(off.json, /Jordan Hale|Sam Lee/);
  markCoachFileSent(storage, off);
  writeShareScoutingWithCoach(storage, true);
  const on = buildCoachUpdateFile(report, { storage, assessments, scouting: cards, now: 200, today: '2026-11-04' });
  assert.deepEqual(on.update.scouting?.cards.map((card) => card.name).sort(), ['Jordan Hale', 'Sam Lee']);
});

test('coach import approves opponent cards onto the linked student, and a re-share updates the same id', () => {
  const student = testMemory();
  const cards = scoutCards();
  const report = reportWithSecretResult();
  const shared = [{ id: 'as-self', date: '2026-11-02', note: 'Guard felt better', scores: { guard: 4, passing: 3, sweeps: 2, takedowns: 3, escapes: 3, submissions: 4, conditioning: 3, mindset: 5 } }];
  const built = buildCoachUpdateFile(report, { storage: student, assessments: shared, scouting: cards, now: 100, today: '2026-11-04' });
  const coach = testMemory();
  assert.equal(receiveStudentCoachUpdate(coach, JSON.parse(built.json)), 'pending');
  assert.equal(pendingStudentCoachUpdates(coach)[0].scouting?.cards.length, 2);
  const linked = [card({ id: 'c1', linkedStudentId: 'stu-alex' } as Partial<Student> & { id: string })];
  const applied = applyStudentCoachUpdate(coach, built.update.updateId, roster(linked), { actor: 'coach', approveRank: false });
  assert.ok(applied.ok);
  const kept = approvedStudentScouting(coach, 'stu-alex');
  assert.equal(kept.studentName, 'Alex Kim');
  assert.equal(kept.cards.length, 2);
  assert.equal(kept.self?.scores.sweeps, 2);
  assert.equal(kept.self?.scores.guard, 4);
  assert.equal(kept.cards.find((row) => row.name === 'Jordan Hale')?.record.line, '2-0-0');

  markCoachFileSent(student, built);
  const jordan = cards.find((row) => row.name === 'Jordan Hale');
  assert.ok(jordan);
  const edited = updateScoutingCard(cards, jordan.id, {
    name: jordan.name,
    gym: jordan.gym,
    belt: jordan.belt,
    weightClass: jordan.weightClass,
    group: jordan.group,
    style: jordan.style,
    notes: 'switched to knee cut',
    ratings: { ...jordan.ratings, sweeps: 1 },
    strengths: jordan.strengths,
    weaknesses: jordan.weaknesses,
    bouts: jordan.bouts,
  });
  const again = buildCoachUpdateFile(report, { storage: student, assessments: shared, scouting: edited, now: 300, today: '2026-11-04' });
  assert.equal(receiveStudentCoachUpdate(coach, JSON.parse(again.json)), 'pending');
  assert.equal(receiveStudentCoachUpdate(coach, JSON.parse(again.json)), 'duplicate');
  applyStudentCoachUpdate(coach, again.update.updateId, roster(linked), { actor: 'coach', approveRank: false });
  const updated = approvedStudentScouting(coach, 'stu-alex');
  assert.equal(updated.cards.length, 2);
  assert.equal(updated.cards.filter((row) => row.id === jordan.id).length, 1);
  assert.equal(updated.cards.find((row) => row.id === jordan.id)?.notes, 'switched to knee cut');
  assert.equal(updated.cards.find((row) => row.id === jordan.id)?.ratings.sweeps, 1);

  const dismissed = buildCoachUpdateFile(report, {
    storage: testMemory(),
    assessments,
    scouting: updateScoutingCard(edited, jordan.id, {
      name: jordan.name,
      gym: jordan.gym,
      belt: jordan.belt,
      weightClass: jordan.weightClass,
      group: jordan.group,
      style: jordan.style,
      notes: 'dismissed note',
      ratings: jordan.ratings,
      strengths: jordan.strengths,
      weaknesses: jordan.weaknesses,
      bouts: jordan.bouts,
    }),
    now: 400,
    today: '2026-11-04',
  });
  receiveStudentCoachUpdate(coach, JSON.parse(dismissed.json));
  dismissStudentCoachUpdate(coach, dismissed.update.updateId);
  assert.equal(approvedStudentScouting(coach, 'stu-alex').cards.find((row) => row.id === jordan.id)?.notes, 'switched to knee cut');
  assert.equal(pendingStudentCoachUpdates(coach).length, 0);
});

test('an older share file still imports, and extra scouting fields are dropped', () => {
  const old = {
    schemaVersion: 1,
    kind: 'student-coach-update',
    updateId: 'scu-old-1',
    studentId: 'stu-alex',
    sentAt: 50,
    since: 0,
    profile: { displayName: 'Alex Kim', gymName: 'North Side BJJ', startedOn: '2020-01-01', trainingStyle: 'gi' },
    journal: 'SECRET-JOURNAL',
    scouting: { studentName: 'Alex Kim', cards: 'not-an-array', photo: 'data:image/png' },
  };
  const coach = testMemory();
  assert.equal(receiveStudentCoachUpdate(coach, old), 'pending');
  const pending = pendingStudentCoachUpdates(coach)[0];
  assert.equal(pending.scouting, undefined);
  assert.equal(pending.profile?.displayName, 'Alex Kim');
  assert.doesNotMatch(JSON.stringify(pending), /SECRET-JOURNAL|data:image/);
  const linked = [card({ id: 'c1', linkedStudentId: 'stu-alex', name: '' } as Partial<Student> & { id: string })];
  const applied = applyStudentCoachUpdate(coach, old.updateId, roster(linked), { actor: 'coach', approveRank: false });
  assert.ok(applied.ok);
  assert.equal(linked[0].name, 'Alex Kim');
  assert.equal(approvedStudentScouting(coach, 'stu-alex').cards.length, 0);

  const noisy = {
    schemaVersion: 1,
    kind: 'student-coach-update',
    updateId: 'scu-old-2',
    studentId: 'stu-alex',
    sentAt: 60,
    since: 0,
    journal: 'NOPE',
    scouting: {
      studentName: 'Alex Kim',
      cards: [
        {
          id: 'scout-1',
          name: 'Jordan Hale',
          gym: 'Checkmat',
          group: 'open',
          style: 'pressure',
          weightClass: 'Middle',
          belt: 'Purple',
          ratings: { guard: 4, sweeps: 5, secret: 9 },
          strengths: 'pressure',
          weaknesses: 'guard',
          record: { wins: 1, losses: 0, draws: 0, line: 'INJECTED' },
          notes: 'likes closed guard',
          photo: 'data:image/png;base64,SECRETPHOTO',
          otherStudentNote: 'OTHER-PRIVATE',
        },
      ],
    },
  };
  const read = readStudentCoachUpdate(noisy);
  assert.ok(read?.scouting);
  assert.equal(read.scouting.cards.length, 1);
  assert.deepEqual(read.scouting.cards[0].record, { wins: 1, losses: 0, draws: 0, line: '1-0-0' });
  assert.equal(read.scouting.cards[0].ratings.sweeps, 5);
  assert.equal((read.scouting.cards[0].ratings as { secret?: number }).secret, undefined);
  assert.doesNotMatch(JSON.stringify(read), /OTHER-PRIVATE|SECRETPHOTO|INJECTED|NOPE/);
});

test('a student self-assessment with Sweeps reaches the coach, and an older seven-face one still does', () => {
  const student = testMemory();
  const coach = testMemory();
  const eight = [
    { id: 'as-old', date: '2026-10-01', note: '', scores: { guard: 2, passing: 2, takedowns: 2, escapes: 2, submissions: 2, conditioning: 2, mindset: 2 } },
    { id: 'as-new', date: '2026-11-02', note: '', scores: { guard: 3, passing: 4, sweeps: 5, takedowns: 2, escapes: 3, submissions: 4, conditioning: 2, mindset: 3 } },
  ];
  const built = buildCoachUpdateFile(baseReport(), { storage: student, assessments: eight as never, now: 100, today: '2026-11-04' });
  assert.equal(built.update.assessments?.find((row) => row.id === 'as-new')?.scores.sweeps, 5);
  const read = readStudentCoachUpdate(JSON.parse(built.json));
  assert.equal(read?.assessments?.find((row) => row.id === 'as-new')?.scores.sweeps, 5);
  assert.equal(Object.hasOwn(read?.assessments?.find((row) => row.id === 'as-old')?.scores ?? {}, 'sweeps'), false, 'not invented');
  assert.equal(receiveStudentCoachUpdate(coach, JSON.parse(built.json)), 'pending');
  const cards = [card({ id: 'c1', linkedStudentId: 'stu-alex' } as Partial<Student> & { id: string })];
  assert.ok(applyStudentCoachUpdate(coach, built.update.updateId, roster(cards), { actor: 'coach', approveRank: false }).ok);
  const self = approvedStudentScouting(coach, 'stu-alex').self;
  assert.equal(self?.date, '2026-11-02');
  assert.equal(self?.scores.sweeps, 5);
});
