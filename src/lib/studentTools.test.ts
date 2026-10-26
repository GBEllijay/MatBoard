import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildGymBrandFile } from './coachGymFile.ts';
import { exportProgressPacket, mergeStudentProgress, parseProgressPacket, sharedCriterionId } from './progress/format.ts';
import type { CoachFeedbackPacket, CoachPlanPacket, RubricCheckpoint, RubricCriterion, RubricLevel, StudentProgressReport } from './progress/types.ts';
import {
  addJournalEntry,
  blankStudentReport,
  saveStudentReport,
  setFundamentalLearned,
  setFundamentalLevel,
} from './studentEdition.ts';
import { setRankAwardedOn, setRankBelt, setRankTapeCount, setDegreeFocus } from './studentRank.ts';
import {
  addCalendarEvent,
  addCheckpoint,
  addGoal,
  applyCoachFile,
  BACKUP_PICKER_MESSAGE,
  EMPTY_COACH_FILE_MESSAGE,
  NOT_JSON_MESSAGE,
  OWN_SEND_FILE_MESSAGE,
  sampleCoachPlanFile,
  SPREADSHEET_PICKER_MESSAGE,
  beltLevel,
  beltProgressSummary,
  calendarKindLabel,
  checkpointFilled,
  checkpointReadOnly,
  checkpointTitle,
  copyFocusToGoal,
  copySuggestionToGoal,
  criterionCounts,
  eventsOnDate,
  goalCopied,
  goalsForBelt,
  gymClassesOnDate,
  isUntouchedLegacyBrown,
  journalDates,
  learnedCatalogIds,
  mergeOwnStudentFile,
  monthGrid,
  moveCheckpoint,
  nextBelt,
  progressReportFiles,
  readGymSchedule,
  removeCalendarEvent,
  removeCheckpoint,
  removeGoal,
  renameCheckpoint,
  setCriterionMark,
  setGoalMet,
  updateGoal,
  withStarterRubric,
} from './studentTools.ts';

function legacyCriterion(belt: string, slug: string, requirement: string, techniqueId: string, techniqueName: string): RubricCriterion {
  return {
    id: `rubric.${belt}.${slug.replace(/ /g, '-')}`,
    requirement,
    techniqueRefs: [{ id: techniqueId, name: techniqueName }],
    met: null,
    note: '',
  };
}

function legacyCheckpoint(belt: string, slug: string, name: string, criteria: RubricCriterion[]): RubricCheckpoint {
  return { id: `checkpoint.${belt}.${slug}`, name, met: null, note: '', criteria };
}

function legacyLevel(belt: RubricLevel['belt'], name: string, checkpoints: RubricCheckpoint[]): RubricLevel {
  return { id: `level.${belt}`, name, belt, checkpoints };
}

/** The benchmark list students saved before the stripe sentences. */
function legacyAdultReport(now = 10): StudentProgressReport {
  const report = blankStudentReport(now);
  report.rubric.levels = [
    legacyLevel('white', 'White', [
      legacyCheckpoint('white', 'guard', 'Guard', [
        legacyCriterion('white', 'closed guard', 'Hold closed guard.', 'pos.closed-guard', 'Closed guard'),
        legacyCriterion('white', 'scissor sweep', 'Finish a scissor sweep.', 'sweep.scissor', 'Scissor sweep'),
      ]),
      legacyCheckpoint('white', 'escapes', 'Escapes', [
        legacyCriterion('white', 'mount escape', 'Escape mount.', 'escape.mount', 'Mount escape'),
        legacyCriterion('white', 'side control escape', 'Escape side control.', 'escape.side-control', 'Side control escape'),
      ]),
      legacyCheckpoint('white', 'passes', 'Passes', [
        legacyCriterion('white', 'knee slice', 'Finish a knee slice pass.', 'pass.knee-slice', 'Knee slice pass'),
        legacyCriterion('white', 'torreando', 'Finish a torreando pass.', 'pass.torreando', 'Torreando pass'),
      ]),
    ]),
    legacyLevel('blue', 'Blue', [
      legacyCheckpoint('blue', 'half-guard', 'Half guard', [
        legacyCriterion('blue', 'half guard', 'Play half guard.', 'pos.half-guard', 'Half guard'),
        legacyCriterion('blue', 'tripod sweep', 'Finish a tripod sweep.', 'sweep.tripod', 'Tripod sweep'),
      ]),
    ]),
    legacyLevel('brown', 'Brown', []),
    legacyLevel('black', 'Black', []),
  ];
  return report;
}

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
  let report = legacyAdultReport(10);
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
  let report = legacyAdultReport(10);
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
  assert.match(refused.error, /cannot do that, so it was not imported/);
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
  assert.equal(pending.message, OWN_SEND_FILE_MESSAGE);
  assert.match(pending.message, /one for your coach/);
  assert.match(pending.message, /not the file to import/);
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

  const other = structuredClone(incoming);
  other.studentId = 'student-other';
  const blocked = mergeOwnStudentFile(phone, other);
  assert.match(blocked.error, /different student/);
  assert.equal(blocked.report, phone);
});

test('a sample coach file imports, and other files say exactly why they were refused', () => {
  const local = withStarterRubric(blankStudentReport(1), 1);
  const before = structuredClone(local);
  const sample = sampleCoachPlanFile(local.studentId, 80);
  assert.match(sample.name, /^advantage-handoff-coach-plan-sample-coach-plan-80\.json$/);
  const imported = applyCoachFile(local, { plan: null, feedback: null }, sample.json);
  assert.equal(imported.error, '');
  assert.equal(imported.pendingReport, undefined);
  assert.equal(imported.shelf.plan?.plan.title, 'Sample coach plan');
  assert.deepEqual(imported.report.rubric, before.rubric);
  assert.deepEqual(imported.report.journal, before.journal);
  assert.deepEqual(imported.report.goals, before.goals);
  assert.match(imported.message, /were not changed/);

  const files = progressReportFiles(local);
  const sheet = applyCoachFile(local, { plan: null, feedback: null }, files.csv);
  assert.equal(sheet.error, SPREADSHEET_PICKER_MESSAGE);
  assert.equal(sheet.report, local);

  assert.equal(applyCoachFile(local, { plan: null, feedback: null }, '   ').error, EMPTY_COACH_FILE_MESSAGE);
  const notes = applyCoachFile(local, { plan: null, feedback: null }, 'not a file');
  assert.equal(notes.error, NOT_JSON_MESSAGE);
  const array = applyCoachFile(local, { plan: null, feedback: null }, '[1,2]');
  assert.match(array.error, /not a coach plan or coach feedback file/);
  const unknown = applyCoachFile(local, { plan: null, feedback: null }, JSON.stringify({ kind: 'review', schemaVersion: 2 }));
  assert.match(unknown.error, /"review"/);
  assert.match(unknown.error, /coach plan or coach feedback/);
  const broken = applyCoachFile(local, { plan: null, feedback: null }, '{"hello":1}');
  assert.match(broken.error, /no coach-plan or coach-feedback kind/);
  assert.match(broken.error, /schemaVersion missing/);
  assert.equal(broken.report, local);

  const own = JSON.parse(files.json) as { kind: string; journal: unknown };
  own.journal = 'nope';
  const unreadable = applyCoachFile(local, { plan: null, feedback: null }, JSON.stringify(own));
  assert.equal(unreadable.pendingReport, undefined);
  assert.match(unreadable.error, /one for your coach, but it could not be read/);
});

test('a gym brand file still imports the name and logo and leaves the coach plan alone', () => {
  const local = addJournalEntry(
    blankStudentReport(1),
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
    2,
  );
  const planned = applyCoachFile(local, { plan: null, feedback: null }, sampleCoachPlanFile(local.studentId, 80).json);
  assert.equal(planned.shelf.plan?.id, 'sample-coach-plan');
  const logo = 'data:image/png;base64,BBBB';
  const file = buildGymBrandFile({ name: 'GB Ellijay', logo, issuedOn: '2026-10-26', now: 90 });
  const imported = applyCoachFile(planned.report, planned.shelf, file);
  assert.equal(imported.error, '');
  assert.equal(imported.gymBrandOnly, true);
  assert.equal(imported.pendingReport, undefined);
  assert.equal(imported.gym?.name, 'GB Ellijay');
  assert.equal(imported.gym?.logo, logo);
  assert.equal(imported.report.profile.gymName, 'GB Ellijay');
  assert.equal(imported.shelf.plan?.id, 'sample-coach-plan');
  assert.equal(imported.shelf.feedback, null);
  assert.ok(imported.report.journal.some((entry) => entry.body.includes('only on this phone')));
  assert.deepEqual(imported.report.rubric, planned.report.rubric);
  assert.match(imported.message, /Gym name and logo are on this phone/);
  assert.match(imported.message, /journal was not changed/);

  const named = structuredClone(imported.report);
  named.profile = { ...named.profile, gymName: 'Already set' };
  const again = applyCoachFile(named, imported.shelf, file);
  assert.equal(again.report.profile.gymName, 'GB Ellijay');
  assert.equal(again.shelf.plan?.id, 'sample-coach-plan');
  assert.equal(applyCoachFile(again.report, again.shelf, 'not a file').error, NOT_JSON_MESSAGE);
});

test('completed fundamentals levels count toward belt progress', () => {
  let report = legacyAdultReport(10);
  assert.equal(beltProgressSummary(beltLevel(report, 'white'), learnedCatalogIds(report)), '0 of 3 practical benchmarks filled. 0 of 6 requirements counted.');
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 2, 11);
  assert.equal(beltProgressSummary(beltLevel(report, 'white'), learnedCatalogIds(report)).includes('0 of 6'), true);
  report = setFundamentalLevel(report, { catalogItemId: 'pos.closed-guard', categoryId: 'positions', name: 'Closed guard' }, 3, 12);
  report = setFundamentalLevel(report, { catalogItemId: 'sweep.scissor', categoryId: 'sweeps', name: 'Scissor sweep' }, 5, 13);
  const summary = beltProgressSummary(beltLevel(report, 'white'), learnedCatalogIds(report));
  assert.match(summary, /1 of 3 practical benchmarks filled/);
  assert.match(summary, /2 of 6 requirements counted\. 2 from fundamentals\./);
  const guard = beltLevel(report, 'white')?.checkpoints.find((row) => row.id === 'checkpoint.white.guard');
  assert.ok(guard);
  assert.equal(checkpointFilled(guard, learnedCatalogIds(report)), true);
});

test('an edited legacy brown list stays, and an untouched one is replaced by the prompts', () => {
  const fresh = withStarterRubric(blankStudentReport(10), 10);
  assert.ok((beltLevel(fresh, 'brown')?.checkpoints.length ?? 0) > 0);
  assert.equal(beltLevel(fresh, 'white')?.checkpoints[0]?.id, 'checkpoint.white.s1-positions');
  const legacy = legacyAdultReport(10);
  const brown = beltLevel(legacy, 'brown');
  assert.ok(brown);
  brown.checkpoints = [
    {
      id: 'checkpoint.brown.top',
      name: 'Top',
      met: null,
      note: '',
      criteria: [
        { id: 'rubric.brown.mount', requirement: 'Hold mount.', techniqueRefs: [{ id: 'pos.mount', name: 'Mount' }], met: null, note: '' },
        { id: 'rubric.brown.knee-on-belly', requirement: 'Hold knee on belly.', techniqueRefs: [{ id: 'pos.knee-on-belly', name: 'Knee on belly' }], met: null, note: '' },
      ],
    },
    {
      id: 'checkpoint.brown.standing',
      name: 'Standing',
      met: null,
      note: '',
      criteria: [
        { id: 'rubric.brown.standing', requirement: 'Work standing.', techniqueRefs: [{ id: 'pos.standing', name: 'Standing' }], met: null, note: '' },
        { id: 'rubric.brown.double-leg', requirement: 'Finish a double leg.', techniqueRefs: [{ id: 'td.double-leg', name: 'Double leg' }], met: null, note: '' },
        { id: 'rubric.brown.hip-throw', requirement: 'Finish a hip throw.', techniqueRefs: [{ id: 'td.hip-throw', name: 'Hip throw' }], met: null, note: '' },
      ],
    },
    {
      id: 'checkpoint.brown.chokes',
      name: 'Chokes',
      met: null,
      note: '',
      criteria: [
        { id: 'rubric.brown.guillotine', requirement: 'Finish a guillotine.', techniqueRefs: [{ id: 'sub.guillotine', name: 'Guillotine' }], met: null, note: '' },
        { id: 'rubric.brown.cross-collar', requirement: 'Finish a cross collar choke.', techniqueRefs: [{ id: 'sub.cross-collar', name: 'Cross collar choke' }], met: null, note: '' },
      ],
    },
  ];
  assert.equal(isUntouchedLegacyBrown(brown), true);
  const replaced = withStarterRubric(legacy, 20);
  assert.equal(beltLevel(replaced, 'brown')?.checkpoints[0]?.id, 'checkpoint.brown.s1-game');
  assert.equal(beltLevel(replaced, 'white')?.checkpoints[0]?.id, 'checkpoint.white.guard');

  const marked = structuredClone(legacy);
  const keptBrown = beltLevel(marked, 'brown');
  assert.ok(keptBrown);
  keptBrown.checkpoints[0]!.met = true;
  const kept = withStarterRubric(marked, 21);
  assert.equal(beltLevel(kept, 'brown')?.checkpoints[0]?.met, true);
  assert.equal(beltLevel(kept, 'brown')?.checkpoints.length, 3);
  assert.equal(beltLevel(kept, 'white')?.checkpoints[0]?.id, 'checkpoint.white.guard');
});

test('goals and higher-belt checkpoints do not change degree milestones', () => {
  let report = setRankBelt(withStarterRubric(blankStudentReport(10), 10), 'black', 11);
  report = setRankAwardedOn(report, '2010-01-02', 12);
  report = setRankTapeCount(report, 2, 13);
  report = addGoal(report, 'Teaching: lead a class', '', 14, 'black');
  report = setGoalMet(report, report.goals[0]!.id, true, 15);
  report = addCheckpoint(report, 'black', 'Personal game refinement', 16);
  report = setDegreeFocus(report, 2, 'Teach the Thursday class', 17);
  assert.equal(report.profile.belt, 'black');
  assert.equal(report.rank?.tapeCount, 2);
  assert.equal(report.rank?.awardedOn, '2010-01-02');
  assert.deepEqual(report.rank?.tapeDates, ['', '', '', '']);
  assert.equal(report.rank?.degreeFocus?.[2], 'Teach the Thursday class');
  const roundTrip = parseProgressPacket(exportProgressPacket(report));
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok && roundTrip.value.kind === 'student-progress-report') {
    assert.equal(roundTrip.value.rank?.tapeCount, 2);
    assert.equal(roundTrip.value.rank?.awardedOn, '2010-01-02');
    assert.equal(roundTrip.value.rank?.degreeFocus?.[2], 'Teach the Thursday class');
    assert.equal(roundTrip.value.goals[0]?.belt, 'black');
  }
});

test('a student can edit their own checkpoints, and a locked coach checkpoint stays read-only', () => {
  let report = legacyAdultReport(10);
  const guardId = 'checkpoint.white.guard';
  report = renameCheckpoint(report, guardId, 'Closed guard', 11);
  report = moveCheckpoint(report, guardId, 1, 12);
  assert.equal(beltLevel(report, 'white')?.checkpoints[1]?.name, 'Closed guard');
  assert.equal(beltLevel(report, 'white')?.checkpoints[1]?.edited, undefined);
  report = moveCheckpoint(report, guardId, -1, 13);
  report = renameCheckpoint(report, guardId, 'Guard', 14);
  report = addCheckpoint(report, 'white', 'Grip fighting', 15);
  report = removeCheckpoint(report, beltLevel(report, 'white')?.checkpoints.at(-1)?.id ?? '', 16);
  assert.equal(beltLevel(report, 'white')?.checkpoints.some((row) => row.name === 'Grip fighting'), false);

  report.rubric.studentsCanEdit = false;
  const coach = beltLevel(report, 'white')?.checkpoints[0];
  assert.ok(coach);
  coach.source = 'coach';
  assert.equal(checkpointReadOnly(report, coach), true);
  assert.throws(() => renameCheckpoint(report, coach.id, 'Other', 17), /coach/);
  assert.throws(() => removeCheckpoint(report, coach.id, 18), /coach/);
  assert.equal(coach.name, 'Guard');
  report.rubric.studentsCanEdit = true;
  report = renameCheckpoint(report, coach.id, 'Guard details', 19);
  const edited = beltLevel(report, 'white')?.checkpoints.find((row) => row.id === coach.id);
  assert.ok(edited);
  assert.equal(edited.source, 'coach');
  assert.equal(edited.edited, true);
  assert.equal(checkpointTitle(edited), 'Guard details*');
  const saved = parseProgressPacket(exportProgressPacket(report));
  assert.equal(saved.ok, true);
  if (saved.ok && saved.value.kind === 'student-progress-report') {
    const again = saved.value.rubric.levels.find((level) => level.belt === 'white')?.checkpoints.find((row) => row.id === coach.id);
    assert.equal(again?.source, 'coach');
    assert.equal(again?.edited, true);
    assert.equal(saved.value.rubric.studentsCanEdit, undefined);
  }
  report.rubric.studentsCanEdit = false;
  const lockedFile = parseProgressPacket(exportProgressPacket(report));
  assert.equal(lockedFile.ok, true);
  if (lockedFile.ok && lockedFile.value.kind === 'student-progress-report') {
    assert.equal(lockedFile.value.rubric.studentsCanEdit, false);
  }
});

test('legacy progress files still load without checkpoint source or degree focus', () => {
  let report = setRankBelt(legacyAdultReport(30), 'black', 31);
  report = setRankAwardedOn(report, '2008-04-05', 32);
  report = setRankTapeCount(report, 3, 33);
  report = setCriterionMark(report, 'rubric.white.closed-guard', true, '2010-01-01', 'kept', 34);
  report = addGoal(report, 'Old goal', 'from before', 35);
  const raw = JSON.parse(exportProgressPacket(report)) as {
    rubric: { studentsCanEdit?: boolean; levels: { checkpoints: RubricCheckpoint[] }[] };
    goals: { belt?: string }[];
    rank?: { degreeFocus?: string[]; tapeCount?: number; awardedOn?: string };
  };
  delete raw.rubric.studentsCanEdit;
  delete raw.rank?.degreeFocus;
  for (const level of raw.rubric.levels) {
    for (const row of level.checkpoints) {
      delete row.source;
      delete row.edited;
    }
  }
  for (const goal of raw.goals) delete goal.belt;
  const parsed = parseProgressPacket(JSON.stringify(raw));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.rank?.tapeCount, 3);
  assert.equal(parsed.value.rank?.awardedOn, '2008-04-05');
  assert.equal(parsed.value.rank?.degreeFocus, undefined);
  assert.equal(parsed.value.rubric.studentsCanEdit, undefined);
  const guard = parsed.value.rubric.levels.find((level) => level.belt === 'white')?.checkpoints.find((row) => row.id === 'checkpoint.white.guard');
  assert.equal(guard?.criteria[0]?.met, true);
  assert.equal(guard?.source, undefined);
  assert.equal(parsed.value.goals[0]?.name, 'Old goal');
  assert.equal(parsed.value.goals[0]?.belt, undefined);
  assert.equal(goalsForBelt(parsed.value, 'white').some((goal) => goal.name === 'Old goal'), true);
});
