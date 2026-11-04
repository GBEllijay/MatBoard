import assert from 'node:assert/strict';
import test from 'node:test';
import { readCardSyncSent, sendCoachAssessment, sendCoachNote } from './cardSync.ts';
import { importCoachText } from './coachInbound.ts';
import { emptyUpdateLedger, readCoachQueue } from './coachRankUpdate.ts';
import {
  acceptCoachSyncUpdate,
  buildCoachNoteUpdate,
  COACH_NOTE_LABEL,
  emptyCoachOverlay,
  readCoachOverlay,
  receiveSyncPacket,
  syncPacketFile,
  writeCoachOverlay,
} from './coachSync.ts';
import { enableParentGate, heldForParent, parentDecide } from './parentGate.ts';
import { parseProgressPacket } from './progress/format.ts';
import type { CoachAssessmentPacket, CoachNotePacket } from './progress/types.ts';
import type { Student } from './rosterStore.ts';
import { addJournalEntry, blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import type { InboxDelivery } from './studentInboxClient.ts';
import { testMemory } from './testPackets.ts';

function card(partial: Partial<Student> & { id: string }): Student {
  return {
    name: 'Alex', belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', lastPromotionDetail: '',
    note: '', checkedIn: false, rosterList: 'student', ...partial,
  } as Student;
}
const linked = card({ id: 'card-1', linkedStudentId: 'stu-alex' });
const guest = card({ id: 'card-g', guestId: 'guest-1', rosterList: undefined });

function note(input: Partial<Parameters<typeof buildCoachNoteUpdate>[0]> = {}): CoachNotePacket {
  const built = buildCoachNoteUpdate({
    studentId: 'stu-alex', note: 'Keep elbows tight.', issuedOn: '2026-11-03', journalDate: '2026-11-02', now: 5,
    updateId: 'note-1', ...input,
  });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

function capture() {
  const sent: unknown[] = [];
  const deliver = async (packet: unknown): Promise<InboxDelivery> => {
    sent.push(packet);
    return { mode: 'cloud', studentPass: 'p' };
  };
  return { sent, deliver };
}

const report = () => assignStudentId(blankStudentReport(10), 'stu-alex', 10);

test('coach note: builds, round-trips the file, and refuses bad input', () => {
  const packet = note({ journalDate: '' });
  assert.equal(packet.coachNote.journalDate, '');
  const parsed = parseProgressPacket(syncPacketFile(packet).json);
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.ok && parsed.value, packet);
  assert.equal(buildCoachNoteUpdate({ studentId: 'stu-alex', note: '  ', issuedOn: '2026-11-03' }).ok, false);
  assert.equal(buildCoachNoteUpdate({ studentId: 'stu-alex', note: 'x', issuedOn: '2026-11-03', journalDate: 'soon' }).ok, false);
  // A coach note can never carry student journal or checklist marks.
  const forged = JSON.parse(syncPacketFile(packet).json);
  forged.journal = [{ id: 'j', body: 'overwritten' }];
  assert.equal(parseProgressPacket(JSON.stringify(forged)).ok, false);
  const imported = importCoachText(testMemory(), report(), JSON.stringify(forged));
  assert.equal(imported.kind, 'error');
});

test('accept appends a coach block to that day’s entry; the student’s words stay', () => {
  const start = addJournalEntry(
    report(),
    { date: '2026-11-02', className: 'Fundamentals', gameTag: '', techniques: [], partners: '', drills: '', rolls: '', notes: 'My own notes.' },
    20,
  );
  const ownBody = start.journal[0].body;
  const done = acceptCoachSyncUpdate(start, note(), emptyUpdateLedger(), emptyCoachOverlay(), 30);
  assert.equal(done.applied, true);
  assert.equal(done.report.journal.length, 1);
  assert.equal(done.report.journal[0].body, ownBody);
  assert.equal(done.report.journal[0].amendments.length, 1);
  assert.match(done.report.journal[0].amendments[0].body, new RegExp(`^${COACH_NOTE_LABEL}`));
  assert.match(done.report.journal[0].amendments[0].body, /Keep elbows tight\./);
  assert.deepEqual(done.overlay.notes.map((row) => [row.updateId, row.journalDate]), [['note-1', '2026-11-02']]);
  // Accepting the same note twice does nothing.
  const again = acceptCoachSyncUpdate(done.report, note(), done.ledger, done.overlay, 40);
  assert.equal(again.applied, false);
  assert.equal(again.report.journal[0].amendments.length, 1);
});

test('accept with no entry that day adds a new coach note entry; default day is the send day', () => {
  const done = acceptCoachSyncUpdate(report(), note({ journalDate: '' }), emptyUpdateLedger(), emptyCoachOverlay(), 30);
  assert.equal(done.report.journal.length, 1);
  assert.equal(done.report.journal[0].date, '2026-11-03');
  assert.match(done.report.journal[0].body, /Keep elbows tight\./);
  // The overlay keeps notes across reads (Suggestions from coach).
  const storage = testMemory();
  writeCoachOverlay(storage, done.overlay);
  assert.equal(readCoachOverlay(storage).notes[0].note, 'Keep elbows tight.');
});

test('a coach note waits for the student; the parent gate holds it and decline drops it', async () => {
  const open = testMemory();
  assert.equal(receiveSyncPacket(open, note()), 'queued');
  assert.equal(readCoachQueue(open)[0].kind, 'coach-note-update');
  const storage = testMemory();
  assert.equal((await enableParentGate(storage, '4321')).ok, true);
  assert.equal(receiveSyncPacket(storage, note()), 'parent-hold');
  assert.equal(readCoachQueue(storage).length, 0);
  const [held] = heldForParent(storage);
  assert.equal(held.kind, 'coach-note-update');
  assert.equal((await parentDecide(storage, held.holdId, '4321', 'decline')).ok, true);
  assert.equal(receiveSyncPacket(storage, note()), 'ignored');
  assert.equal(readCoachQueue(storage).length, 0);
});

test('sendCoachNote: explicit send goes out once; comms off, guests and assistants send nothing', async () => {
  const log = testMemory();
  const { sent, deliver } = capture();
  const ok = await sendCoachNote('card-1', { note: 'Hips out.', journalDate: '2026-11-01' }, { roster: [linked], actor: 'owner', deliver, log, now: 100 });
  assert.equal(ok.mode, 'cloud');
  assert.equal(sent.length, 1);
  assert.equal((sent[0] as CoachNotePacket).coachNote.journalDate, '2026-11-01');
  assert.equal(readCardSyncSent(log)[0].kind, 'coach-note-update');
  const off = { ...linked, coachSync: 'off' as const };
  assert.equal((await sendCoachNote('card-1', { note: 'x' }, { roster: [off], actor: 'owner', deliver, log })).mode, 'blocked');
  assert.equal((await sendCoachNote('card-g', { note: 'x' }, { roster: [guest], actor: 'owner', deliver, log })).mode, 'blocked');
  assert.equal((await sendCoachNote('card-1', { note: 'x' }, { roster: [linked], actor: 'assistant', deliver, log })).mode, 'blocked');
  assert.equal((await sendCoachNote('card-1', { note: ' ' }, { roster: [linked], actor: 'owner', deliver, log })).mode, 'invalid');
  assert.equal(sent.length, 1);
});

test('sendCoachAssessment: one press sends one assessment; it is accepted beside the student’s own', async () => {
  const log = testMemory();
  const { sent, deliver } = capture();
  const options = { roster: [linked], actor: 'head' as const, deliver, log, now: 100 };
  const first = await sendCoachAssessment('card-1', { date: '2026-11-01', scores: { guard: 4 } }, options);
  const second = await sendCoachAssessment('stu-alex', { date: '2026-11-03', scores: { guard: 5 }, note: 'Better' }, options);
  assert.equal(first.mode, 'cloud');
  assert.equal(second.mode, 'cloud');
  assert.equal(sent.length, 2);
  assert.equal(readCardSyncSent(log).filter((row) => row.kind === 'coach-assessment-update').length, 2);
  const off = { ...linked, coachSync: 'off' as const };
  assert.equal((await sendCoachAssessment('card-1', { scores: { guard: 3 } }, { ...options, roster: [off] })).mode, 'blocked');
  assert.equal((await sendCoachAssessment('card-1', { scores: {} }, options)).mode, 'invalid');
  assert.equal(sent.length, 2);
  // Student side: each one needs its own accept; nothing in the report changes.
  const storage = testMemory();
  for (const packet of sent) assert.equal(receiveSyncPacket(storage, packet as CoachAssessmentPacket), 'queued');
  assert.equal(readCoachQueue(storage).length, 2);
  const start = report();
  let overlay = emptyCoachOverlay();
  let ledger = emptyUpdateLedger();
  for (const packet of sent) {
    const done = acceptCoachSyncUpdate(start, packet as CoachAssessmentPacket, ledger, overlay, 200);
    assert.equal(done.report, start);
    overlay = done.overlay;
    ledger = done.ledger;
  }
  assert.deepEqual(overlay.assessments.map((row) => row.date), ['2026-11-01', '2026-11-03']);
});
