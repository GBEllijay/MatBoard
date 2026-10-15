import assert from 'node:assert/strict';
import test from 'node:test';
import { FUNDAMENTALS_CATALOG, FUNDAMENTALS_CATALOG_ID, FUNDAMENTALS_CATALOG_LEGACY_ID } from './catalog.ts';
import {
  exportProgressCsv,
  exportProgressPacket,
  importCoachSuggestion,
  mergeCoachPacket,
  mergeStudentProgress,
  parseFundamentalsCatalog,
  parseProgressPacket,
  progressHandoffFileName,
  PROGRESS_CSV_HEADERS,
  searchJournal,
  searchJournalClips,
  sharedCheckpointId,
  sharedCriterionId,
} from './format.ts';
import { parseHandoffPacket } from '../driveHandoff.ts';
import { emptyCompetition } from './competition.ts';
import {
  ACADEMY_MEMBER_CODE_LABEL,
  ACADEMY_MEMBER_DISCOUNT_PERCENT,
  PRO_INCLUDED_STUDENT_LICENSES,
  STUDENT_LICENSE_MORE_NOTE,
  type CoachFeedbackPacket,
  type CoachPlanPacket,
  type JournalEntry,
  type StudentProgressReport,
} from './types.ts';

function sampleReport(): StudentProgressReport {
  return {
    schemaVersion: 2,
    kind: 'student-progress-report',
    id: 'report-alex',
    studentId: 'student-alex',
    updatedAt: 10,
    profile: {
      id: 'student-alex',
      displayName: 'Alex',
      gymName: 'GB1',
      belt: 'white',
      startedOn: '2026-01-15',
      licenseSource: '',
    },
    rubric: {
      id: 'rubric-alex',
      levels: [
        {
          id: 'level-white',
          name: 'White',
          belt: 'white',
          checkpoints: [
            {
              id: sharedCheckpointId('white', 'guard'),
              name: 'Guard',
              met: true,
              note: '',
              criteria: [
                {
                  id: sharedCriterionId('white', 'closed guard'),
                  requirement: 'Keep closed guard and finish a sweep.',
                  techniqueRefs: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
                  met: true,
                  note: '',
                },
              ],
            },
          ],
        },
      ],
    },
    checklist: [
      {
        id: 'check-scissor',
        catalogItemId: 'sweep.scissor',
        categoryId: 'sweeps',
        name: 'Scissor sweep',
        displayName: '',
        hidden: false,
        learnedOn: '2026-02-01',
        note: 'From closed guard',
        updatedAt: 10,
      },
      {
        id: 'check-custom',
        catalogItemId: '',
        categoryId: 'sweeps',
        name: 'Loop choke entry',
        displayName: '',
        hidden: false,
        learnedOn: '',
        note: '',
        updatedAt: 11,
      },
    ],
    journal: [
      {
        id: 'journal-cycle-1',
        date: '2026-02-01',
        gameTag: 'a',
        body: 'Cycle 1 notes on the scissor sweep. Collar grip was late.',
        techniqueRefs: [{ id: 'sweep.scissor', name: 'Scissor sweep' }],
        amendments: [],
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'journal-pendulum',
        date: '2026-03-01',
        gameTag: 'b',
        body: 'Drilled the pendulum sweep into mount.',
        techniqueRefs: [{ id: 'sweep.pendulum', name: 'Pendulum sweep' }],
        amendments: [],
        createdAt: 12,
        updatedAt: 12,
      },
    ],
    calendar: [
      { id: 'day-1', date: '2026-02-01', title: 'Fundamentals', kind: 'class', note: '' },
    ],
    goals: [
      { id: 'goal-scissor', name: 'Finish the scissor sweep live', note: '', met: false },
    ],
    competition: emptyCompetition(),
  };
}

test('a progress report round-trips and a Drive handoff reader leaves it alone', () => {
  const report = sampleReport();
  const text = exportProgressPacket(report);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.deepEqual(parsed.value, report);
  assert.equal(progressHandoffFileName(report), 'advantage-handoff-student-progress-report-report-alex-10.json');
  assert.equal(parseHandoffPacket(text), null);
  assert.equal(sharedCriterionId('white', 'Closed guard'), 'rubric.white.closed-guard');
  assert.equal(sharedCheckpointId('white', 'Guard'), 'checkpoint.white.guard');
  const omittedLicense = structuredClone(report) as StudentProgressReport & { profile: { licenseSource?: string } };
  delete omittedLicense.profile.licenseSource;
  const filled = parseProgressPacket(JSON.stringify(omittedLicense));
  assert.equal(filled.ok, true);
  if (filled.ok && filled.value.kind === 'student-progress-report') assert.equal(filled.value.profile.licenseSource, '');
});

test('validation rejects a bad game tag, a file payload, and a future schema', () => {
  const report = sampleReport();
  const badTag = parseProgressPacket(JSON.stringify({ ...report, journal: [{ ...report.journal[0], gameTag: 'home' }] }));
  assert.equal(badTag.ok, false);
  if (!badTag.ok) assert.match(badTag.errors.join('\n'), /game tag must be a, b, c, or blank/);

  const withFile = parseProgressPacket(JSON.stringify({ ...report, photo: 'data:image/png;base64,abc' }));
  assert.equal(withFile.ok, false);
  if (!withFile.ok) assert.match(withFile.errors.join('\n'), /cannot carry photos or videos/);

  const future = parseProgressPacket(JSON.stringify({ ...report, schemaVersion: 3 }));
  assert.equal(future.ok, false);
  if (!future.ok) assert.match(future.errors.join('\n'), /schemaVersion 3 is not supported/);

  assert.throws(() => exportProgressPacket({ ...report, blob: 'abc' } as StudentProgressReport));
});

test('an amendment appends on import and does not overwrite the original card', () => {
  const local = sampleReport();
  const incoming = structuredClone(local);
  incoming.updatedAt = 20;
  incoming.journal[0].body = 'Replaced cycle 1 text';
  incoming.checklist[0].note = 'A later import must not replace this note.';
  incoming.journal[0].amendments = [
    {
      id: 'amend-cycle-2',
      date: '2026-06-01',
      body: 'Cycle 2: the scissor sweep still needs the collar earlier.',
      createdAt: 20,
    },
  ];
  const merged = mergeStudentProgress(local, incoming);
  const card = merged.report.journal.find((entry) => entry.id === 'journal-cycle-1');
  assert.ok(card);
  assert.equal(card.body, 'Cycle 1 notes on the scissor sweep. Collar grip was late.');
  assert.deepEqual(merged.appendedAmendments, ['amend-cycle-2']);
  assert.equal(card.amendments.length, 1);
  assert.match(merged.conflicts.join('\n'), /Journal journal-cycle-1 was kept/);
  assert.equal(merged.report.checklist[0].note, 'From closed guard');

  incoming.journal[0].amendments.push({
    id: 'amend-cycle-2',
    date: '2026-07-01',
    body: 'Different wording that must not replace the first amendment.',
    createdAt: 30,
  });
  const again = mergeStudentProgress(merged.report, incoming);
  assert.equal(again.report.journal[0].amendments[0].body, 'Cycle 2: the scissor sweep still needs the collar earlier.');
  assert.equal(again.appendedAmendments.length, 0);
  assert.match(again.conflicts.join('\n'), /Amendment amend-cycle-2 was kept/);
});

test('clips are optional and an older file without them still imports', () => {
  const report = sampleReport();
  const text = exportProgressPacket(report);
  assert.equal(text.includes('"clips"'), false);
  const parsed = parseProgressPacket(text);
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal('clips' in parsed.value, false);

  const withClips = {
    ...report,
    clips: [
      {
        id: 'clip-armbar',
        url: 'https://www.youtube.com/watch?v=armbar',
        description: 'Armbar from closed guard',
        note: '',
        createdAt: 15,
        updatedAt: 15,
      },
      {
        id: 'clip-empty-list-friend',
        url: 'https://www.instagram.com/reel/pass',
        description: 'Knee slice pass',
        note: '',
        createdAt: 16,
        updatedAt: 16,
      },
    ],
  };
  const roundTrip = parseProgressPacket(exportProgressPacket(withClips));
  assert.equal(roundTrip.ok, true);
  if (!roundTrip.ok || roundTrip.value.kind !== 'student-progress-report') return;
  assert.deepEqual(
    roundTrip.value.clips,
    withClips.clips.map((clip) => ({ ...clip, note: '' })),
  );
  assert.deepEqual(
    searchJournalClips(roundTrip.value.clips ?? [], 'closed guard').map((clip) => clip.id),
    ['clip-armbar'],
  );
  assert.deepEqual(
    searchJournalClips(roundTrip.value.clips ?? [], 'instagram.com/reel').map((clip) => clip.id),
    ['clip-empty-list-friend'],
  );

  const empty = parseProgressPacket(JSON.stringify({ ...report, clips: [] }));
  assert.equal(empty.ok, true);
  if (empty.ok && empty.value.kind === 'student-progress-report') assert.deepEqual(empty.value.clips, []);

  const bad = parseProgressPacket(JSON.stringify({
    ...report,
    clips: [{ id: 'clip-bad', url: 'javascript:alert(1)', description: 'no', createdAt: 1, updatedAt: 1 }],
  }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.errors.join('\n'), /http or https/);

  const kept = mergeStudentProgress(report, withClips);
  assert.deepEqual(kept.report.clips, withClips.clips);
  const incoming = structuredClone(withClips);
  incoming.clips[0].description = 'A later note that must not replace the first.';
  incoming.clips[0].url = 'https://example.com/other';
  const again = mergeStudentProgress(kept.report, incoming);
  assert.equal(again.report.clips?.[0].description, 'Armbar from closed guard');
  assert.equal(again.report.clips?.[0].url, 'https://www.youtube.com/watch?v=armbar');
  const older = mergeStudentProgress(again.report, report);
  assert.equal(older.report.clips?.length, 2);

  const csv = exportProgressCsv(withClips);
  assert.match(csv, /Clip,clip-armbar,/);
  assert.match(csv, /https:\/\/www\.youtube\.com\/watch\?v=armbar/);
  assert.equal(exportProgressCsv(report).includes('\r\nClip,'), false);
});

test('search matches journal text and technique names', () => {
  const journal: JournalEntry[] = sampleReport().journal;
  assert.deepEqual(
    searchJournal(journal, 'scissor sweep').map((entry) => entry.id),
    ['journal-cycle-1'],
  );
  assert.deepEqual(
    searchJournal(journal, 'Pendulum sweep').map((entry) => entry.id),
    ['journal-pendulum'],
  );
  const withAmendment = structuredClone(journal);
  withAmendment[1].amendments.push({
    id: 'amend-1',
    date: '2026-04-01',
    body: 'Still late on the flower sweep.',
    createdAt: 40,
  });
  assert.deepEqual(searchJournal(withAmendment, 'flower sweep').map((entry) => entry.id), ['journal-pendulum']);
  assert.deepEqual(searchJournal(journal, 'omoplata'), []);
});

test('names only is the shipping decision and the examples field stays empty', () => {
  const parsed = parseFundamentalsCatalog(FUNDAMENTALS_CATALOG);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.draft, false);
  assert.equal(parsed.value.id, FUNDAMENTALS_CATALOG_ID);
  assert.equal(parsed.value.title, 'BJJ fundamentals (starter)');
  assert.equal(parsed.value.categories.length, 6);
  const items = parsed.value.categories.flatMap((category) => category.items);
  assert.equal(items.length, 31);
  const names = items.map((item) => item.name);
  assert.ok(names.includes('Scissor sweep'));
  assert.ok(names.includes('Pendulum sweep'));
  assert.ok(parsed.value.categories.some((category) => category.name === 'Escapes'));
  assert.ok(items.every((item) => item.examples.length === 0));
  assert.deepEqual(
    items.map((item) => item.id),
    [
      'pos.closed-guard', 'pos.open-guard', 'pos.half-guard', 'pos.mount', 'pos.side-control', 'pos.back-control', 'pos.knee-on-belly', 'pos.standing',
      'sweep.scissor', 'sweep.hip-bump', 'sweep.pendulum', 'sweep.flower', 'sweep.tripod',
      'escape.mount', 'escape.side-control', 'escape.back', 'escape.headlock',
      'pass.torreando', 'pass.knee-slice', 'pass.leg-drag', 'pass.stack',
      'sub.armbar-guard', 'sub.triangle', 'sub.kimura', 'sub.guillotine', 'sub.rear-naked-choke', 'sub.cross-collar',
      'td.double-leg', 'td.single-leg', 'td.arm-drag', 'td.hip-throw',
    ],
  );

  const legacy = structuredClone(FUNDAMENTALS_CATALOG);
  legacy.id = FUNDAMENTALS_CATALOG_LEGACY_ID;
  legacy.title = 'BJJ fundamentals (draft)';
  legacy.draft = true;
  const imported = parseFundamentalsCatalog(legacy);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.value.id, FUNDAMENTALS_CATALOG_ID);
  assert.deepEqual(
    imported.value.categories.flatMap((category) => category.items.map((item) => item.id)),
    items.map((item) => item.id),
  );

  const withExamples = structuredClone(FUNDAMENTALS_CATALOG);
  withExamples.categories[1].items[0].examples = ['Grip the pants before the hip out.'];
  const examplesOn = parseFundamentalsCatalog(withExamples);
  assert.equal(examplesOn.ok, true);
  if (!examplesOn.ok) return;
  assert.deepEqual(examplesOn.value.categories[1].items[0].examples, ['Grip the pants before the hip out.']);

  const omitted = structuredClone(FUNDAMENTALS_CATALOG) as {
    categories: { items: { examples?: string[] }[] }[];
  };
  delete omitted.categories[1].items[0].examples;
  const namesOnly = parseFundamentalsCatalog(omitted);
  assert.equal(namesOnly.ok, true);
  if (!namesOnly.ok) return;
  assert.deepEqual(namesOnly.value.categories[1].items[0].examples, []);
});

test('coach plan and feedback round-trip, and an older coach file does not replace a newer one', () => {
  const plan: CoachPlanPacket = {
    schemaVersion: 1,
    kind: 'coach-plan',
    id: 'plan-1',
    studentId: 'student-alex',
    updatedAt: 50,
    plan: {
      title: 'Work on before next promotion',
      issuedOn: '2026-05-01',
      note: 'Keep the collar grip.',
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
  const parsedPlan = parseProgressPacket(exportProgressPacket(plan));
  assert.equal(parsedPlan.ok, true);
  if (parsedPlan.ok && parsedPlan.value.kind === 'coach-plan') {
    assert.equal(parsedPlan.value.schemaVersion, 2);
    assert.deepEqual(parsedPlan.value.plan, plan.plan);
  }

  const feedback = parseProgressPacket(exportProgressPacket({
    schemaVersion: 1,
    kind: 'coach-feedback',
    id: 'feedback-1',
    studentId: 'student-alex',
    updatedAt: 60,
    feedback: {
      planId: 'plan-1',
      issuedOn: '2026-05-20',
      synopsis: 'The scissor sweep is closer. Keep the pendulum for B game.',
      suggestions: [{ id: 'note-1', targetId: 'rubric.white.closed-guard', note: 'Showing up in live rounds.' }],
    },
  }));
  assert.equal(feedback.ok, true);

  const older = { ...plan, updatedAt: 40 };
  const kept = mergeCoachPacket(plan, older);
  assert.equal(kept.replaced, false);
  assert.equal(kept.packet.updatedAt, 50);
  const newer = mergeCoachPacket(plan, { ...plan, updatedAt: 70, plan: { ...plan.plan, note: 'Add the hip bump.' } });
  assert.equal(newer.replaced, true);
  assert.equal(newer.packet.plan.note, 'Add the hip bump.');
});

test('csv export uses one header row a spreadsheet can filter by sheet', () => {
  const csv = exportProgressCsv(sampleReport());
  assert.ok(csv.startsWith('\uFEFF'));
  const rows = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
  assert.equal(rows[0], PROGRESS_CSV_HEADERS.join(','));
  assert.match(rows[1], /^Profile,student-alex,/);
  assert.match(rows[2], /^Level,level-white,/);
  assert.match(csv, /Checkpoint,checkpoint\.white\.guard,/);
  assert.match(csv, /Criterion,rubric\.white\.closed-guard,/);
  assert.match(csv, /Goal,goal-scissor,/);
  assert.match(csv, /Journal,journal-cycle-1,2026-02-01/);
  assert.match(csv, /Scissor sweep/);
  assert.match(csv, /Checklist,check-custom/);
});

test('importing a coach plan or coach feedback leaves student marks, journal, and goals untouched', () => {
  const report = sampleReport();
  const plan: CoachPlanPacket = {
    schemaVersion: 1,
    kind: 'coach-plan',
    id: 'plan-1',
    studentId: 'student-alex',
    updatedAt: 50,
    plan: {
      title: 'Work on before next promotion',
      issuedOn: '2026-05-01',
      note: 'Suggest marking the guard checkpoint unmet and rewriting the journal.',
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
  const feedback: CoachFeedbackPacket = {
    schemaVersion: 1,
    kind: 'coach-feedback',
    id: 'feedback-1',
    studentId: 'student-alex',
    updatedAt: 60,
    feedback: {
      planId: 'plan-1',
      issuedOn: '2026-05-20',
      synopsis: 'Suggestion only: treat the scissor sweep as not yet met and change the goal.',
      suggestions: [{ id: 'note-1', targetId: 'checkpoint.white.guard', note: 'Keep the collar earlier.' }],
    },
  };
  const fromPlan = importCoachSuggestion(report, plan);
  const fromFeedback = importCoachSuggestion(report, feedback);
  assert.deepEqual(fromPlan.report, report);
  assert.deepEqual(fromFeedback.report, report);
  assert.equal(fromPlan.report.rubric.levels[0].checkpoints[0].met, true);
  assert.equal(fromPlan.report.rubric.levels[0].checkpoints[0].criteria[0].met, true);
  assert.equal(fromFeedback.report.journal[0].body, report.journal[0].body);
  assert.equal(fromFeedback.report.goals[0].met, false);
  assert.equal(fromFeedback.packet.kind, 'coach-feedback');

  const marked = parseProgressPacket(JSON.stringify({
    ...feedback,
    feedback: { ...feedback.feedback, suggestions: [{ ...feedback.feedback.suggestions[0], met: false }] },
  }));
  assert.equal(marked.ok, false);
  if (!marked.ok) assert.match(marked.errors.join('\n'), /cannot set student marks/);

  const stripes = parseProgressPacket(JSON.stringify({ ...report, stripes: 2 }));
  assert.equal(stripes.ok, false);
  if (!stripes.ok) assert.match(stripes.errors.join('\n'), /checkpoints between levels/);
});

test('version 1 files import, and journal A/B/C tags become the standing game', () => {
  const current = sampleReport();
  const legacy = { ...current, schemaVersion: 1 } as Omit<StudentProgressReport, 'competition'> & { schemaVersion: number };
  delete (legacy as { competition?: unknown }).competition;
  const parsed = parseProgressPacket(JSON.stringify(legacy));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.schemaVersion, 2);
  assert.equal(parsed.value.competition?.games.a.techniques, 'Scissor sweep');
  assert.match(parsed.value.competition?.games.a.notes ?? '', /Collar grip was late/);
  assert.equal(parsed.value.competition?.games.b.techniques, 'Pendulum sweep');
  assert.equal(parsed.value.competition?.games.c.techniques, '');
  assert.deepEqual(parsed.value.competition?.tournaments, []);
  assert.equal(parsed.value.journal[0].gameTag, 'a');
  assert.equal(parsed.value.journal[0].techniqueRefs[0].name, 'Scissor sweep');

  const explicit = parseProgressPacket(JSON.stringify({ ...legacy, competition: emptyCompetition() }));
  assert.equal(explicit.ok, true);
  if (explicit.ok && explicit.value.kind === 'student-progress-report') {
    assert.equal(explicit.value.competition?.games.a.techniques, '');
  }

  const local = sampleReport();
  local.competition = emptyCompetition();
  local.competition.games.a = { techniques: 'Armbar', notes: 'Finish the grip' };
  const merged = mergeStudentProgress(local, parsed.value);
  assert.equal(merged.report.competition?.games.a.techniques, 'Armbar');
  assert.match(merged.conflicts.join('\n'), /A game techniques were kept/);
  assert.equal(merged.report.competition?.games.b.techniques, 'Pendulum sweep');

  const withMeet = structuredClone(parsed.value);
  const competition = withMeet.competition ?? emptyCompetition();
  competition.tournaments = [{
    id: 'meet-spring',
    name: 'Spring Open',
    date: '2026-11-02',
    location: 'Atlanta',
    division: 'Adult Blue Middle',
    deadline: '2026-10-20',
    link: 'https://example.com/spring',
    status: 'entered',
    targetWeight: 170,
    targetUnit: 'lb',
    goals: [{ id: 'goal-pass', name: 'Pass half guard', note: 'knee slice', met: false }],
  }];
  competition.weighIns = [{ id: 'weigh-1', date: '2026-10-01', weight: 174.2, unit: 'lb', note: 'morning' }];
  competition.weightUnit = 'lb';
  withMeet.competition = competition;
  const csv = exportProgressCsv(withMeet);
  assert.match(csv, /Game,a,/);
  assert.match(csv, /Tournament,meet-spring,2026-11-02/);
  assert.match(csv, /entered/);
  assert.match(csv, /Tournament goal,goal-pass/);
  assert.match(csv, /Weigh-in,weigh-1,2026-10-01/);
  const roundTrip = parseProgressPacket(exportProgressPacket(withMeet));
  assert.equal(roundTrip.ok, true);
  if (roundTrip.ok && roundTrip.value.kind === 'student-progress-report') {
    assert.equal(roundTrip.value.competition?.tournaments[0].status, 'entered');
    assert.equal(roundTrip.value.competition?.weighIns[0].weight, 174.2);
  }

  const badStatus = parseProgressPacket(JSON.stringify({
    ...withMeet,
    competition: { ...competition, tournaments: [{ ...competition.tournaments[0], status: 'done' }] },
  }));
  assert.equal(badStatus.ok, false);

  const omitted = mergeStudentProgress(withMeet, sampleReport());
  assert.equal(omitted.report.competition?.tournaments[0].name, 'Spring Open');
});

test('the license plan is recorded for a later step', () => {
  assert.equal(ACADEMY_MEMBER_CODE_LABEL, 'Academy Member');
  assert.equal(ACADEMY_MEMBER_DISCOUNT_PERCENT, 25);
  assert.equal(PRO_INCLUDED_STUDENT_LICENSES, 10);
  assert.equal(
    STUDENT_LICENSE_MORE_NOTE,
    'Gyms can email advantageappllc@gmail.com to purchase additional Student Edition licenses at a discount.',
  );
});
