import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { exportProgressPacket, mergeStudentProgress, parseProgressPacket, sharedCriterionId } from './progress/format.ts';
import type { CoachFeedbackPacket, CoachPlanPacket } from './progress/types.ts';
import {
  addJournalEntry,
  blankStudentReport,
  saveStudentReport,
  setFundamentalLearned,
} from './studentEdition.ts';
import {
  addCalendarEvent,
  addGoal,
  applyCoachFile,
  BACKUP_PICKER_MESSAGE,
  beltLevel,
  calendarKindLabel,
  checkpointFilled,
  copyFocusToGoal,
  copySuggestionToGoal,
  criterionCounts,
  eventsOnDate,
  goalCopied,
  gymClassesOnDate,
  journalDates,
  learnedCatalogIds,
  mergeOwnStudentFile,
  monthGrid,
  nextBelt,
  progressReportFiles,
  readGymSchedule,
  removeCalendarEvent,
  setCriterionMark,
  setGoalMet,
  updateGoal,
  withStarterRubric,
} from './studentTools.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

test('a journal day sits on the month grid and an open mat is a training event', () => {
  const drafted = addJournalEntry(
    blankStudentReport(10),
    {
      date: '2026-10-12',
      className: 'Gi',
      gameTag: 'a',
      techniques: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'grip the collar deeper',
    },
    10,
  );
  assert.deepEqual(journalDates(drafted), ['2026-10-12']);
  const october = monthGrid(2026, 10).flat();
  const day = october.find((cell) => cell.iso === '2026-10-12');
  assert.ok(day);
  assert.equal(day.inMonth, true);
  assert.equal(day.day, 12);

  const withEvent = addCalendarEvent(
    drafted,
    { date: '2026-10-18', title: 'Saturday open mat', kind: 'training', note: 'no-gi' },
    18,
  );
  assert.equal(calendarKindLabel(withEvent.calendar[0].kind), 'Open mat');
  assert.equal(withEvent.calendar[0].kind, 'training');
  assert.equal(withEvent.calendar[0].date, '2026-10-18');
  assert.equal(withEvent.calendar[0].note, 'no-gi');
  assert.deepEqual(Object.keys(withEvent.calendar[0]).sort(), ['date', 'id', 'kind', 'note', 'title']);
  assert.equal(eventsOnDate(withEvent, '2026-10-18')[0].title, 'Saturday open mat');
  assert.equal(eventsOnDate(withEvent, '2026-10-25').length, 0);
  const repeating = addCalendarEvent(
    withEvent,
    { date: '2026-10-18', title: 'Evening rounds', kind: 'training', note: 'gi', time: '18:30', repeat: 'weekly' },
    30,
  );
  assert.equal(repeating.calendar[1].time, '18:30');
  assert.equal(repeating.calendar[1].repeat, 'weekly');
  assert.deepEqual(Object.keys(repeating.calendar[0]).sort(), ['date', 'id', 'kind', 'note', 'title']);
  assert.equal(eventsOnDate(repeating, '2026-11-01')[0]?.title, 'Evening rounds');
  assert.equal(eventsOnDate(repeating, '2026-10-19').some((event) => event.title === 'Evening rounds'), false);
  const biweekly = addCalendarEvent(
    blankStudentReport(31),
    { date: '2026-10-01', title: 'Every other week', kind: 'class', note: '', repeat: 'biweekly' },
    31,
  );
  assert.equal(eventsOnDate(biweekly, '2026-10-15')[0]?.title, 'Every other week');
  assert.equal(eventsOnDate(biweekly, '2026-10-08').length, 0);
  const monthly = addCalendarEvent(
    blankStudentReport(32),
    { date: '2026-01-31', title: 'Month end', kind: 'other', note: '', repeat: 'monthly', time: '09:00' },
    32,
  );
  assert.equal(eventsOnDate(monthly, '2026-03-31')[0]?.title, 'Month end');
  assert.equal(eventsOnDate(monthly, '2026-02-28').length, 0);
  assert.equal(eventsOnDate(monthly, '2026-01-31')[0]?.time, '09:00');
  const roundTrip = parseProgressPacket(exportProgressPacket(repeating));
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok && roundTrip.value.kind === 'student-progress-report') {
    const kept = roundTrip.value.calendar.find((event) => event.title === 'Evening rounds');
    assert.equal(kept?.time, '18:30');
    assert.equal(kept?.repeat, 'weekly');
    const older = roundTrip.value.calendar.find((event) => event.title === 'Saturday open mat');
    assert.equal(older?.time, undefined);
    assert.equal(older?.repeat, undefined);
  }
  assert.throws(
    () => addCalendarEvent(withEvent, { date: '2026-10-18', title: 'Bad clock', kind: 'class', note: '', time: '25:00' }, 33),
    /HH:MM/,
  );
  assert.equal(withEvent.journal.length, drafted.journal.length);
  assert.throws(
    () => addCalendarEvent(withEvent, { date: 'nope', title: 'Seminar', kind: 'class', note: '' }, 20),
    /YYYY-MM-DD/,
  );
  assert.throws(
    () => addCalendarEvent(withEvent, { date: '2026-10-18', title: '   ', kind: 'class', note: '' }, 21),
    /Add a title/,
  );
  const removed = removeCalendarEvent(withEvent, withEvent.calendar[0].id, 19);
  assert.equal(removed.calendar.length, 0);
  assert.equal(removed.journal.length, drafted.journal.length);
  assert.equal(removeCalendarEvent(removed, 'missing', 22), removed);

  const schedule = JSON.stringify({
    version: 1,
    classes: [{ id: 'c1', kind: 'class', day: 'mon', time: '06:00', title: 'Morning Gi', location: 'MAT 1', subtitle: '' }],
    specials: [{ id: 's1', kind: 'special', date: '2026-10-12', title: 'Seminar', body: '', flyerId: null }],
  });
  const gym = readGymSchedule(schedule);
  assert.ok(gym);
  assert.equal(gym.hints[0].label, 'Monday · 6:00 AM · Morning Gi');
  assert.deepEqual(gymClassesOnDate(schedule, '2026-10-12'), ['6:00 AM Morning Gi', 'Seminar']);
  assert.equal(readGymSchedule(null), null);
  assert.equal(readGymSchedule('{"version":1,"classes":[],"specials":[]}'), null);
  assert.equal(withEvent.calendar.some((event) => event.title === 'Morning Gi'), false);
});

test('checkpoints fill from marks and learned fundamentals, and goals stay the student\'s', () => {
  let report = withStarterRubric(blankStudentReport(10), 10);
  const saved = saveStudentReport(memory(), report);
  assert.equal(saved.rubric.levels.some((level) => level.belt === 'white'), true);
  assert.equal(nextBelt('white'), 'blue');
  assert.equal(nextBelt('grey'), 'yellow');
  assert.equal(nextBelt('green'), null);
  assert.equal(sharedCriterionId('white', 'closed guard'), 'rubric.white.closed-guard');

  report = setFundamentalLearned(
    report,
    { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' },
    true,
    '2026-10-11',
    11,
  );
  const learned = learnedCatalogIds(report);
  const guard = beltLevel(report, 'white')?.checkpoints.find((row) => row.id === 'checkpoint.white.guard');
  assert.ok(guard);
  const scissor = guard.criteria.find((row) => row.id === 'rubric.white.scissor-sweep');
  const closed = guard.criteria.find((row) => row.id === 'rubric.white.closed-guard');
  assert.ok(scissor);
  assert.ok(closed);
  assert.equal(scissor.met, null);
  assert.equal(criterionCounts(scissor, learned), true);
  assert.equal(checkpointFilled(guard, learned), false);

  report = setCriterionMark(report, 'rubric.white.closed-guard', true, '2026-10-12', 'collar deeper', 12);
  const marked = beltLevel(report, 'white')?.checkpoints.find((row) => row.id === 'checkpoint.white.guard');
  assert.ok(marked);
  assert.equal(marked.met, null);
  assert.equal(marked.criteria.find((row) => row.id === 'rubric.white.closed-guard')?.note, '2026-10-12 — collar deeper');
  assert.equal(checkpointFilled(marked, learnedCatalogIds(report)), true);

  report = addGoal(report, 'Compete in the spring', 'local', 13);
  report = updateGoal(report, report.goals[0].id, 'Compete in May', 'local gym', 14);
  report = setGoalMet(report, report.goals[0].id, true, 15);
  assert.equal(report.goals[0].name, 'Compete in May');
  assert.equal(report.goals[0].met, true);
  assert.equal(report.goals[0].note, 'local gym');
});

test('coach import stays a suggestion, and the exported report re-imports', () => {
  let report = withStarterRubric(blankStudentReport(10), 10);
  report = setCriterionMark(report, 'rubric.white.closed-guard', true, '2026-10-12', 'collar', 12);
  report = addJournalEntry(
    report,
    {
      date: '2026-10-12',
      className: 'Gi',
      gameTag: 'a',
      techniques: [],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'grip the collar deeper',
    },
    16,
  );
  report = addGoal(report, 'Keep the collar', '', 17);
  const before = structuredClone(report);

  const plan: CoachPlanPacket = {
    schemaVersion: 1,
    kind: 'coach-plan',
    id: 'plan-1',
    studentId: 'student-local',
    updatedAt: 50,
    plan: {
      title: 'Work on before next promotion',
      issuedOn: '2026-10-01',
      note: 'Suggest clearing the guard checkpoint.',
      focus: [
        {
          id: 'focus-1',
          criterionId: 'rubric.white.closed-guard',
          catalogItemId: 'sweep.scissor',
          name: 'Scissor sweep',
          note: 'Finish the angle.',
        },
      ],
    },
  };
  const imported = applyCoachFile(report, { plan: null, feedback: null }, exportProgressPacket(plan));
  assert.equal(imported.error, '');
  assert.deepEqual(imported.report.rubric, before.rubric);
  assert.deepEqual(imported.report.journal, before.journal);
  assert.deepEqual(imported.report.goals, before.goals);
  assert.deepEqual(imported.report.checklist, before.checklist);
  assert.deepEqual(imported.report.calendar, before.calendar);
  assert.equal(imported.shelf.plan?.plan.title, 'Work on before next promotion');

  const copied = copyFocusToGoal(imported.report, plan.plan.focus[0], 60);
  assert.equal(goalCopied(copied, 'focus-1'), true);
  assert.equal(copied.goals.some((goal) => goal.name === 'Scissor sweep' && goal.met === false), true);
  assert.deepEqual(copied.rubric, before.rubric);
  assert.deepEqual(copied.journal, before.journal);
  assert.equal(copyFocusToGoal(copied, plan.plan.focus[0], 61).goals.length, copied.goals.length);

  const feedback: CoachFeedbackPacket = {
    schemaVersion: 1,
    kind: 'coach-feedback',
    id: 'feedback-1',
    studentId: 'student-local',
    updatedAt: 70,
    feedback: {
      planId: 'plan-1',
      issuedOn: '2026-10-02',
      synopsis: 'The scissor sweep is closer.',
      suggestions: [{ id: 'note-1', targetId: 'checkpoint.white.guard', note: 'Showing up in live rounds.' }],
    },
  };
  const withFeedback = applyCoachFile(copied, imported.shelf, exportProgressPacket(feedback));
  assert.deepEqual(withFeedback.report.rubric, copied.rubric);
  assert.deepEqual(withFeedback.report.journal, copied.journal);
  assert.deepEqual(withFeedback.report.goals, copied.goals);
  assert.equal(withFeedback.shelf.feedback?.feedback.synopsis, 'The scissor sweep is closer.');
  const fromSuggestion = copySuggestionToGoal(withFeedback.report, feedback.feedback.suggestions[0], 71);
  assert.equal(fromSuggestion.goals.some((goal) => goal.note === 'Showing up in live rounds.'), true);
  assert.equal(fromSuggestion.rubric.levels[0].checkpoints[0].criteria[0].met, true);

  const marked = JSON.stringify({
    ...feedback,
    feedback: { ...feedback.feedback, suggestions: [{ ...feedback.feedback.suggestions[0], met: false }] },
  });
  const refused = applyCoachFile(report, { plan: null, feedback: null }, marked);
  assert.match(refused.error, /cannot set student marks/);
  assert.equal(refused.shelf.plan, null);
  assert.equal(refused.report, report);

  const files = progressReportFiles(fromSuggestion);
  const parsed = parseProgressPacket(files.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(files.jsonName.startsWith('advantage-handoff-student-progress-report-'), true);
  assert.match(files.mailto, /subject=Advantage%20progress%20report/);
  assert.match(files.csv, /Checkpoint,checkpoint\.white\.guard/);
  const device = withStarterRubric(blankStudentReport(1), 1);
  const merged = mergeStudentProgress(device, parsed.value);
  const reloaded = beltLevel(merged.report, 'white')?.checkpoints.find((row) => row.id === 'checkpoint.white.guard');
  assert.ok(reloaded);
  assert.equal(reloaded.criteria.find((row) => row.id === 'rubric.white.closed-guard')?.met, true);
  assert.equal(merged.report.journal.some((entry) => entry.body.includes('grip the collar deeper')), true);
  assert.equal(merged.report.goals.some((goal) => goal.name === 'Scissor sweep'), true);
});

test('the uploaded send to coach file merges after confirm and a backup points to Connections', () => {
  const handoff = readFileSync(new URL('./fixtures/send-to-coach-handoff.json', import.meta.url), 'utf8');
  const local = blankStudentReport(1);
  const pending = applyCoachFile(local, { plan: null, feedback: null }, handoff);
  assert.equal(pending.error, '');
  assert.equal(pending.pendingReport?.kind, 'student-progress-report');
  assert.equal(pending.report.journal.length, 0);
  assert.equal(pending.shelf.plan, null);
  const incoming = pending.pendingReport;
  assert.ok(incoming);
  const merged = mergeOwnStudentFile(local, incoming);
  assert.equal(merged.error, '');
  assert.equal(merged.report.profile.belt, 'black');
  assert.deepEqual(merged.report.rank?.lineage, ['Prof. Elena Duarte (mock)']);
  assert.ok(merged.report.journal.length >= 3);
  assert.equal(merged.report.checklist.find((item) => item.catalogItemId === 'pos.closed-guard')?.level, 5);

  const phone = addJournalEntry(
    blankStudentReport(2),
    {
      date: '2026-10-23',
      className: 'Fundamentals',
      gameTag: '',
      techniques: [],
      partners: '',
      drills: '',
      rolls: '',
      notes: 'only on this phone',
    },
    3,
  );
  const kept = mergeOwnStudentFile(phone, incoming);
  assert.equal(kept.error, '');
  assert.ok(kept.report.journal.some((entry) => entry.body.includes('only on this phone')));
  assert.ok(kept.report.journal.length > phone.journal.length);

  const backup = applyCoachFile(local, { plan: null, feedback: null }, JSON.stringify({ advantage: 'student-journal-backup', version: 1 }));
  assert.equal(backup.error, BACKUP_PICKER_MESSAGE);
  assert.equal(backup.pendingReport, undefined);
  assert.equal(backup.report, local);
});
