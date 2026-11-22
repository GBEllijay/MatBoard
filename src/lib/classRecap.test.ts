import assert from 'node:assert/strict';
import test from 'node:test';
import { applyClassRecapToJournal, buildClassRecapUpdate, recapFromJournalEntry, recapHasShareable, techniquesFromLessonPlans } from './classRecap.ts';
import { INSTRUCTOR_JOURNAL_SAMPLE } from './instructorJournal.ts';
import { blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import { emptyPlan, type TrainingNotesArchive } from './trainingNotesStore.ts';
import { viewJournalEntry } from './studentEdition.ts';

test('recapFromJournalEntry only includes opted-in notes, techniques, and https links', () => {
  const entry = {
    ...INSTRUCTOR_JOURNAL_SAMPLE[0]!,
    reflection: 'Private pacing note',
    shareReflection: false,
    classNotes: 'Hip escape from side control',
    shareClassNotes: true,
    techniques: [
      { name: 'Hip escape', shareWithStudents: true },
      { name: 'Private drill', shareWithStudents: false },
    ],
    videos: [{ title: 'Drill', href: 'https://example.com/hip-escape', shareWithStudents: true }],
    whoInClass: 'Alex Rivera, Jordan Lee',
  };
  const recap = recapFromJournalEntry(entry, []);
  assert.equal(recap.notes, 'Hip escape from side control');
  assert.deepEqual(recap.techniques, ['Hip escape']);
  assert.deepEqual(recap.videos, [{ title: 'Drill', href: 'https://example.com/hip-escape' }]);
  assert.doesNotMatch(recap.notes, /Alex Rivera/);
  assert.equal(recapHasShareable(recap), true);
});

test('buildClassRecapUpdate refuses an empty recap', () => {
  const built = buildClassRecapUpdate({
    studentId: 'stu-jordan-preview',
    recap: { entryId: 'ij1', date: '2026-11-23', className: 'Fundamentals', notes: '', techniques: [], videos: [] },
  });
  assert.equal(built.ok, false);
});

test('applyClassRecapToJournal adds a new card and link videos, leaving other cards alone', () => {
  let report = assignStudentId(blankStudentReport(1), 'stu-jordan-preview', 1);
  const built = buildClassRecapUpdate({
    studentId: 'stu-jordan-preview',
    recap: {
      entryId: 'ij1',
      date: '2026-11-23',
      className: 'Fundamentals',
      notes: 'Hip escape from side control',
      techniques: ['Hip escape'],
      videos: [{ title: 'Drill', href: 'https://example.com/hip-escape' }],
    },
    now: 20,
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  report = applyClassRecapToJournal(report, built.packet, 20);
  assert.equal(report.journal.length, 1);
  const view = viewJournalEntry(report.journal[0]!);
  assert.match(view.className, /Fundamentals/);
  assert.equal(view.techniques.some((row) => row.name === 'Hip escape'), true);
  assert.equal(report.journal[0]!.videos?.[0]?.source, 'link');
  assert.equal(report.journal[0]!.videos?.[0]?.url, 'https://example.com/hip-escape');
});

test('techniquesFromLessonPlans reads titles only and skips review recordings', () => {
  const plan = emptyPlan();
  plan.techniques[0]!.title = 'Knee cut';
  plan.techniques[1]!.title = 'Hip escape';
  const archive: TrainingNotesArchive = { version: 3, days: { '2026-11-23': { plans: [plan] } } };
  assert.deepEqual(techniquesFromLessonPlans('2026-11-23', archive), ['Knee cut', 'Hip escape']);
  assert.deepEqual(techniquesFromLessonPlans('2026-11-24', archive), []);
});
