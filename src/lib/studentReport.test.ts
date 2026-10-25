import assert from 'node:assert/strict';
import test from 'node:test';
import { exportProgressPacket } from './progress/format.ts';
import { blankStudentReport, setStudentProfile } from './studentEdition.ts';
import { addJournalClip } from './studentEdition.ts';
import { extractPdfText, formatPdfNumber, pdfPageCount, pdfToText } from './simplePdf.ts';
import { assessmentReportPdf, chartPoint, layoutAssessment, outerRingRadius, progressReportPdf, radarPolygonRadii, renderReportPages } from './reportPdf.ts';
import { saveAssessment } from './studentAssessment.ts';
import {
  applyBackupToMemory,
  buildStudentBackup,
  parseStudentBackup,
  pdfIncludes,
  progressReportLines,
  selfAssessmentLines,
  studentBackupNames,
  studentReportPdfName,
} from './studentBackup.ts';
import { countPhrase, matchRecordLine, reportHeaderLines } from './studentReport.ts';
import { emptyRankPhotoStore } from './rankPhotos.ts';
import type { ScoutingCard } from './studentScouting.ts';
import type { StudentFilm } from './studentFilm.ts';
import { withStarterRubric } from './studentTools.ts';
import type { RubricCheckpoint, StudentChecklistEntry, StudentProgressReport } from './progress/types.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

function markCriteria(checkpoint: RubricCheckpoint, met: boolean): RubricCheckpoint {
  return { ...checkpoint, criteria: checkpoint.criteria.map((row) => ({ ...row, met })) };
}

function checklistRow(name: string, level: 0 | 1 | 2 | 3 | 4 | 5, note = ''): StudentChecklistEntry {
  return {
    id: `check.${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    catalogItemId: '',
    categoryId: '',
    name,
    displayName: '',
    hidden: false,
    learnedOn: '',
    level,
    note,
    updatedAt: 1,
  };
}

function filledReport(): StudentProgressReport {
  let report = withStarterRubric(blankStudentReport(10), 11);
  report = setStudentProfile(report, { displayName: 'Ada Student', gymName: 'Alliance', startedOn: '2008-09-01' }, 12);
  report = {
    ...report,
    profile: { ...report.profile, belt: 'black' },
    rank: {
      tapeCount: 2,
      awardedOn: '2022-05-14',
      tapeDates: ['2023-06-01', '2024-07-15', '', ''],
      history: [],
      lineage: ['Coach Kim'],
    },
    checklist: [checklistRow('Armbar', 5, 'keep the elbow'), checklistRow('Knee cut', 4)],
    rubric: {
      ...report.rubric,
      levels: report.rubric.levels.map((level) => {
        if (level.belt !== 'black') return level;
        const legacy = (name: string, note: string, met: boolean | null): RubricCheckpoint => ({
          id: `checkpoint.black.${name.toLowerCase()}`,
          name,
          met,
          note,
          criteria: [
            { id: `${name}.a`, requirement: `${name} hold`, techniqueRefs: [], met: true, note: '' },
            { id: `${name}.b`, requirement: `${name} recover`, techniqueRefs: [], met: true, note: '' },
          ],
        });
        return {
          ...level,
          checkpoints: [legacy('Pressure', 'Mock: top pressure sound', true), legacy('Guard', '', null)],
        };
      }),
    },
    journal: Array.from({ length: 18 }, (_, index) => ({
      id: `card.${index}`,
      date: `2026-09-${String((index % 27) + 1).padStart(2, '0')}`,
      gameTag: '' as const,
      body: `Class: \nTechniques: Move ${index}\nTraining partners: \nDrills: \nRolls: \nNotes:\nKey note ${index}`,
      techniqueRefs: [{ id: `tech.${index}`, name: `Move ${index}` }],
      amendments: [],
      createdAt: index,
      updatedAt: index,
    })),
    clips: [{ id: 'clip.1', url: 'https://example.com/armbar', description: 'Armbar link', note: '', createdAt: 1, updatedAt: 1 }],
    competition: {
      ...report.competition,
      results: [
        {
          id: 'result.1',
          tournamentId: '',
          tournamentName: 'Austin Spring Open',
          division: 'Black / Light',
          bracket: [],
          bracketPhoto: false,
          matches: [
            { id: 'm1', opponent: 'Kenji Morrow', result: 'win', method: 'sub', note: 'armbar', date: '2026-04-11' },
            { id: 'm2', opponent: 'Rafael Quinn', result: 'loss', method: 'advantage', note: 'final', date: '2026-04-12' },
          ],
          bracket: [{ id: 'b1', round: 'Final', name: 'Rafael Quinn' }],
        },
      ],
      weighIns: [{ id: 'w1', date: '2026-10-23', weight: 186, unit: 'lb', note: 'On track' }],
    },
  };
  return addJournalClip(report, 'https://example.com/armbar', 'Armbar link', 21);
}

const film: StudentFilm = {
  id: 'film.1',
  fileName: 'berimbolo.mp4',
  date: '2026-10-23',
  technique: 'Berimbolo to back take',
  note: 'partner',
  mime: 'video/mp4',
  size: 4,
  createdAt: 3,
  updatedAt: 3,
  where: 'phone',
  provider: '',
  driveFileId: '',
  dateFolder: '',
};

const scout: ScoutingCard = {
  id: 'scout.1',
  name: 'Dario Kent',
  gym: 'Atos',
  belt: 'Black',
  weightClass: 'Light',
  group: 'weight',
  style: 'Wrestler',
  notes: 'Beat him on points',
  ratings: { guard: 4, passing: 3, takedowns: 2, escapes: 5, submissions: 4, conditioning: 3, mindset: 5 },
  strengths: '',
  weaknesses: '',
};

test('progress PDF keeps every section, the student track, and checkpoint status', () => {
  const report = filledReport();
  const assessment = saveAssessment(
    { entries: [] },
    {
      date: '2026-10-23',
      note: 'conditioning is the limiter',
      scores: { guard: 5, passing: 4, takedowns: 4, escapes: 5, submissions: 5, conditioning: 3, mindset: 5 },
    },
  );
  const lines = progressReportLines(report, assessment, { scouting: [scout], films: [film] });
  const joined = lines.join('\n');
  assert.match(joined, /Key note 17/);
  assert.match(joined, /Move 17/);
  assert.equal(joined.includes('Class:'), false);
  assert.match(joined, /1 win, 1 loss/);
  assert.equal(joined.includes('1 losses'), false);
  assert.equal(joined.includes('1 wins'), false);
  assert.match(joined, /2026-04-11 — Win vs Kenji Morrow/);
  assert.match(joined, /2026-04-12 — Loss vs Rafael Quinn/);
  assert.match(joined, /Bracket notes/);
  assert.match(joined, /Final — Rafael Quinn/);
  assert.match(joined, /Kenji Morrow/);
  assert.match(joined, /Rafael Quinn/);
  assert.match(joined, /Average 4\.5/);
  assert.match(joined, /Filmed 2026-10-23 Berimbolo to back take/);
  assert.match(joined, /Guard 4, Passing 3, Takedowns 2, Escapes 5, Submissions 4, Conditioning 3, Mindset 5/);
  assert.match(joined, /186 lb — On track/);
  const black = joined.slice(joined.indexOf('\nBlack\n'));
  assert.match(black, /Pressure: Met — Mock: top pressure sound/);
  assert.match(black, /Guard: Met/);
  assert.equal(black.includes('Guard: Unmarked'), false);
  assert.equal(joined.includes('\nCoral\n'), false);
  const order = ['White', 'Blue', 'Purple', 'Brown', 'Black'].map((label) => joined.indexOf(`\n${label}\n`));
  order.forEach((spot, index) => {
    assert.ok(spot >= 0, ['White', 'Blue', 'Purple', 'Brown', 'Black'][index]);
    if (index > 0) assert.ok(order[index - 1]! < spot);
  });
  assert.equal(joined.includes('\nGrey\n'), false);
  assert.equal(joined.includes('\nYellow\n'), false);
  assert.equal(joined.includes('\nOrange\n'), false);
  assert.equal(joined.includes('\nGreen\n'), false);

  const pdf = progressReportPdf(report, assessment, { scouting: [scout], films: [film] }, '2026-10-23');
  const text = extractPdfText(pdf);
  for (const title of [
    'Rank and stripes',
    'Belt progress',
    'Fundamentals proficiency',
    'Journal summary',
    'Competition and weight',
    'Self-assessment',
    'Opponent scouting',
    'Video library',
  ]) {
    assert.ok(text.includes(title), title);
  }
  const fund = text.indexOf('Fundamentals proficiency');
  const arm = text.indexOf('Armbar');
  const journal = text.indexOf('Journal summary');
  const video = text.indexOf('Video library');
  assert.ok(fund < arm && arm < journal && journal < video);
  assert.match(text, /Key note 17/);
  assert.match(text, /Filmed 2026-10-23 Berimbolo to back take/);
  assert.match(text, /Dario Kent/);
  assert.match(text, /Guard: Met/);
  assert.match(text, /1 win, 1 loss/);
  assert.match(text, /2026-04-12 -- Loss vs Rafael Quinn/);
  assert.match(text, /Final -- Rafael Quinn/);
  assert.match(text, /https:\/\/example.com\/armbar/);
  assert.equal(text.includes('video/mp4'), false);
  assert.match(text, /186 lb -- On track/);
  assert.equal(text.includes('?'), false);
  assert.equal(pdfToText(pdf).includes('\\227'), false);
  assert.equal(text.includes('Signed in as'), false);
  assert.equal(text.includes('Sign out of seat'), false);
  assert.ok(pdfPageCount(pdf) >= 2);
  assert.match(pdfToText(pdf), /WinAnsiEncoding/);
});

test('one win, loss, or draw stays singular everywhere the record is written', () => {
  assert.equal(matchRecordLine(1, 1, 0), 'Recorded matches: 1 win, 1 loss.');
  assert.equal(matchRecordLine(1, 1, 1), 'Recorded matches: 1 win, 1 loss, 1 draw.');
  assert.equal(matchRecordLine(0, 1, 0), 'Recorded matches: 0 wins, 1 loss.');
  assert.equal(matchRecordLine(2, 0, 2), 'Recorded matches: 2 wins, 0 losses, 2 draws.');
  assert.equal(countPhrase(1, 'stripe', 'stripes'), '1 stripe');
  assert.equal(countPhrase(0, 'fundamental', 'fundamentals'), '0 fundamentals');
  assert.equal(countPhrase(1, 'fundamental', 'fundamentals'), '1 fundamental');
  const report = filledReport();
  const lines = progressReportLines(report, { entries: [] }).join('\n');
  assert.match(lines, /1 win, 1 loss/);
  assert.equal(lines.includes('1 losses'), false);
  assert.equal(lines.includes('1 wins'), false);
  assert.equal(lines.includes('1 draws'), false);
});

test('an empty progress report omits blank lists or says None yet', () => {
  const lines = progressReportLines(blankStudentReport(1), { entries: [] });
  const text = lines.join('\n');
  assert.match(text, /No journal cards\./);
  assert.match(text, /No tournaments recorded\./);
  assert.match(text, /Fundamentals proficiency\nNone yet/);
  assert.match(text, /Opponent scouting\nNone yet/);
  assert.match(text, /Video library\nNone yet/);
  assert.equal(text.includes('No saved links.'), false);
  assert.equal(text.includes('No filmed clips.'), false);
});

test('an undated stripe is listed without a date and a dated stripe keeps its date', () => {
  let report = withStarterRubric(blankStudentReport(8), 9);
  report = {
    ...report,
    profile: { ...report.profile, belt: 'blue' },
    rank: {
      tapeCount: 3,
      awardedOn: '2011-04-02',
      tapeDates: ['2012-01-01', '', '', ''],
      history: [
        {
          id: 'rank-white',
          belt: 'white',
          awardedOn: '2008-06-01',
          tapeCount: 2,
          tapeDates: ['', '2009-08-01', '', ''],
        },
      ],
      lineage: [],
    },
  };
  const lines = progressReportLines(report, { entries: [] });
  const rank = lines.slice(lines.indexOf('Rank and stripes'), lines.indexOf('Belt progress'));
  assert.deepEqual(
    rank.filter((line) => /^ {0,2}Stripe \d/.test(line)),
    ['Stripe 1: 2012-01-01', 'Stripe 2', 'Stripe 3', '  Stripe 1', '  Stripe 2: 2009-08-01'],
  );
  const block = rank.join('\n');
  assert.equal(block.includes('No date'), false);
  assert.equal(block.includes('Invalid Date'), false);
  assert.match(block, /Stripes: 3/);
  assert.match(block, /2 stripes/);
});

test('a kids belt report lists only the kids track, in order', () => {
  let report = withStarterRubric(blankStudentReport(4), 5);
  report = { ...report, profile: { ...report.profile, belt: 'grey' } };
  const lines = progressReportLines(report, { entries: [] }).join('\n');
  const order = ['Grey', 'Yellow', 'Orange', 'Green'].map((label) => lines.indexOf(`\n${label}\n`));
  order.forEach((spot, index) => {
    assert.ok(spot >= 0);
    if (index > 0) assert.ok(order[index - 1]! < spot);
  });
  assert.equal(lines.includes('\nWhite\n'), false);
  assert.equal(lines.includes('\nBlue\n'), false);
  assert.equal(lines.includes('\nCoral\n'), false);
});

test('self-assessment PDF draws the shared radar and does not add an empty page', () => {
  const report = setStudentProfile(blankStudentReport(3), { displayName: 'Ada', gymName: 'GB', startedOn: '2020-01-02' }, 4);
  const first = saveAssessment(
    { entries: [] },
    {
      date: '2026-10-01',
      note: 'earlier pass',
      scores: { guard: 2, passing: 2, takedowns: 2, escapes: 2, submissions: 2, conditioning: 2, mindset: 2 },
    },
  );
  const assessment = saveAssessment(first, {
    date: '2026-10-23',
    note: 'calm rounds',
    scores: { guard: 5, passing: 4, takedowns: 3, escapes: 5, submissions: 4, conditioning: 3, mindset: 5 },
  });
  const layout = layoutAssessment(report, assessment, '2026-10-23');
  assert.ok(layout.radarBox);
  const pdf = progressBytes(layout);
  const raw = pdfToText(pdf);
  const top = chartPoint(0, 5, layout.radarBox);
  const prior = chartPoint(0, 2, layout.radarBox);
  assert.ok(raw.includes(`${formatPdfNumber(top.x)} ${formatPdfNumber(top.y)} m`));
  assert.ok(raw.includes(`${formatPdfNumber(prior.x)} ${formatPdfNumber(prior.y)} m`));
  const text = extractPdfText(pdf);
  assert.match(text, /Self-assessment/);
  assert.match(text, /Ada/);
  assert.match(text, /calm rounds/);
  assert.match(text, /earlier pass/);
  assert.match(text, /This check-in/);
  assert.match(text, /Previous 2026-10-01/);
  assert.match(text, /4\.1/);
  assert.equal(text.includes('?'), false);
  assert.equal(pdfPageCount(pdf), 1);
  assert.equal(raw.includes('/Subtype /Image'), true);
  const bodies = raw.split('stream\n').map((part) => part.split('endstream')[0]).filter((part) => part.includes('Tj'));
  for (const body of bodies) {
    assert.ok(/Self-assessment|Earlier|Notes|calm rounds|earlier pass/.test(body), body.slice(0, 80));
  }
  const guard = layout.pages.flatMap((page) => page).find((draw) => draw.op === 'text' && draw.text === 'Guard' && draw.size === 10);
  const guardScore = layout.pages.flatMap((page) => page).find((draw) => draw.op === 'text' && draw.text === '5' && draw.font === 'bold' && guard && draw.y === guard.y);
  assert.ok(guard && guardScore);
});

test('the black-belt sample fits on one page', () => {
  let report = setStudentProfile(blankStudentReport(8), { displayName: 'Ada Student', gymName: 'GB Ellijay', startedOn: '2014-03-01' }, 9);
  report = { ...report, profile: { ...report.profile, belt: 'black' } };
  const latest = { guard: 5, passing: 4, takedowns: 4, escapes: 5, submissions: 5, conditioning: 3, mindset: 5 } as const;
  let assessment = saveAssessment(
    { entries: [] },
    {
      date: '2026-08-01',
      note: 'hip bump is late',
      scores: { guard: 3, passing: 3, takedowns: 2, escapes: 3, submissions: 3, conditioning: 2, mindset: 4 },
    },
  );
  assessment = saveAssessment(assessment, {
    date: '2026-09-12',
    note: 'passing still stalls',
    scores: { guard: 4, passing: 3, takedowns: 3, escapes: 4, submissions: 4, conditioning: 3, mindset: 4 },
  });
  assessment = saveAssessment(assessment, {
    date: '2026-10-23',
    note: 'Mock: conditioning is the limiter before Pan Pacific',
    scores: latest,
  });
  const pdf = assessmentReportPdf(report, assessment, '2026-10-23');
  const text = extractPdfText(pdf);
  assert.equal(pdfPageCount(pdf), 1);
  assert.match(text, /Mock: conditioning is the limiter before Pan Pacific/);
  assert.match(text, /Earlier check-ins/);
  assert.match(text, /2026-09-12/);
  assert.match(text, /2026-08-01/);
  assert.match(text, /hip bump is late/);
  assert.match(text, /passing still stalls/);
});

test('a long self-assessment history continues onto the next page', () => {
  const report = setStudentProfile(blankStudentReport(8), { displayName: 'Ada Student', gymName: 'GB Ellijay', startedOn: '2014-03-01' }, 9);
  let assessment = { entries: [] } as ReturnType<typeof saveAssessment>;
  for (let index = 0; index < 8; index += 1) {
    assessment = saveAssessment(assessment, {
      date: `2026-0${index + 1}-15`,
      note: `history note ${index}`,
      scores: { guard: 3, passing: 3, takedowns: 3, escapes: 3, submissions: 3, conditioning: 3, mindset: 3 },
    });
  }
  const pdf = assessmentReportPdf(report, assessment, '2026-10-23');
  const text = extractPdfText(pdf);
  assert.ok(pdfPageCount(pdf) >= 2);
  assert.match(text, /history note 0/);
  assert.match(text, /history note 7/);
});

test('every radar polygon vertex stays on or inside the outer ring', () => {
  const report = setStudentProfile(blankStudentReport(3), { displayName: 'Ada', gymName: 'GB', startedOn: '2020-01-02' }, 4);
  const assessment = saveAssessment(
    { entries: [] },
    {
      date: '2026-10-23',
      note: 'calm rounds',
      scores: { guard: 5, passing: 4, takedowns: 4, escapes: 5, submissions: 5, conditioning: 3, mindset: 5 },
    },
  );
  const layout = layoutAssessment(report, assessment, '2026-10-23');
  assert.ok(layout.radarBox);
  const outer = outerRingRadius(layout.radarBox);
  const radii = radarPolygonRadii(layout.radarBox, layout.pages.flat());
  assert.ok(radii.length >= 7 * 5);
  for (const radius of radii) assert.ok(radius <= outer + 0.05, `${radius} > ${outer}`);
  const onRing = radii.filter((radius) => Math.abs(radius - outer) <= 0.05);
  assert.ok(onRing.length >= 7);
});

function progressBytes(layout: { pages: Parameters<typeof renderReportPages>[0] }): Uint8Array {
  return renderReportPages(layout.pages);
}

test('profile fields survive backup, and the assessment file name matches the download', async () => {
  assert.equal(studentReportPdfName('assessment', '2026-10-23'), 'advantage-student-self-assessment-2026-10-23.pdf');
  assert.equal(studentBackupNames('2026-10-23').assessmentPdf, studentReportPdfName('assessment', '2026-10-23'));
  assert.equal(studentBackupNames('2026-10-23').progressPdf, studentReportPdfName('progress', '2026-10-23'));

  const report = setStudentProfile(filledReport(), { displayName: 'Ada', gymName: 'GB Ellijay', startedOn: '2011-03-15' }, 30);
  const assessment = saveAssessment(
    { entries: [] },
    {
      date: '2026-10-17',
      note: 'calm rounds',
      scores: { guard: 3, passing: 4, takedowns: 2, escapes: 5, submissions: 3, conditioning: 4, mindset: 5 },
    },
  );
  const built = await buildStudentBackup({
    report,
    assessment,
    scouting: [scout],
    rankPhotos: emptyRankPhotoStore(),
    bracketPhotos: {},
    shelf: { plan: null, feedback: null },
    films: [film],
    includeVideos: false,
    now: new Date('2026-10-17T12:00:00Z'),
  });
  assert.equal(pdfIncludes(built.progressPdf, 'Rank and stripes'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Fundamentals proficiency'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Journal summary'), true);
  assert.equal(pdfIncludes(built.progressPdf, 'Opponent scouting'), true);
  assert.equal(pdfIncludes(built.assessmentPdf, 'calm rounds'), true);
  assert.equal(extractPdfText(built.progressPdf).includes('?'), false);
  const parsed = parseStudentBackup(built.json);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const storage = memory();
  applyBackupToMemory(storage, parsed.file, 'replace', { rank: emptyRankPhotoStore(), bracket: {} });
  const saved = JSON.parse(storage.getItem('matboard.studentEdition.v1') ?? '{}') as { profile?: { displayName?: string; gymName?: string; startedOn?: string; belt?: string } };
  assert.equal(saved.profile?.displayName, 'Ada');
  assert.equal(saved.profile?.gymName, 'GB Ellijay');
  assert.equal(saved.profile?.startedOn, '2011-03-15');
  assert.equal(saved.profile?.belt, 'black');
  assert.throws(() => setStudentProfile(report, { startedOn: '2026-02-31' }), /YYYY-MM-DD/);
});

test('report headers use the saved name and fall back only when a field is empty', () => {
  const empty = blankStudentReport(1);
  assert.equal(empty.profile.belt, 'white');
  assert.deepEqual(reportHeaderLines(empty), ['Student: Not named', 'Gym: Not named', 'Belt: White', 'Started: Not set']);
  const blankReport = progressReportLines(empty, { entries: [] }).join('\n');
  const blankAssessment = selfAssessmentLines(empty, { entries: [] }).join('\n');
  assert.match(blankReport, /Student: Not named/);
  assert.match(blankReport, /Gym: Not named/);
  assert.match(blankReport, /Started: Not set/);
  assert.match(blankAssessment, /Student: Not named/);
  assert.match(blankAssessment, /Started: Not set/);

  const named = setStudentProfile(empty, { displayName: 'Ada Student', gymName: 'GB Ellijay' }, 2);
  assert.equal(named.profile.belt, 'white');
  assert.equal(named.profile.startedOn, '');
  assert.match(progressReportLines(named, { entries: [] }).join('\n'), /Student: Ada Student/);
  assert.match(progressReportLines(named, { entries: [] }).join('\n'), /Gym: GB Ellijay/);
  assert.match(progressReportLines(named, { entries: [] }).join('\n'), /Started: Not set/);

  const dated = setStudentProfile(named, { startedOn: '2014-03-01' }, 3);
  const full = progressReportLines(dated, { entries: [] }).join('\n');
  assert.match(full, /Started: 2014-03-01/);
  assert.equal(full.includes('Not named'), false);
  assert.equal(full.includes('Not set'), false);
  const packet = JSON.parse(exportProgressPacket(dated)) as {
    profile: { displayName: string; gymName: string; startedOn: string; belt: string };
  };
  assert.equal(packet.profile.displayName, 'Ada Student');
  assert.equal(packet.profile.gymName, 'GB Ellijay');
  assert.equal(packet.profile.startedOn, '2014-03-01');
  assert.equal(packet.profile.belt, 'white');
  const pdf = extractPdfText(progressReportPdf(dated, { entries: [] }, {}, '2026-10-24'));
  assert.match(pdf, /Student: Ada Student/);
  assert.match(pdf, /Gym: GB Ellijay/);
  assert.match(pdf, /Started: 2014-03-01/);
  const assessmentPdf = extractPdfText(assessmentReportPdf(empty, { entries: [] }, '2026-10-24'));
  assert.match(assessmentPdf, /Student: Not named/);
  assert.match(assessmentPdf, /Gym: Not named/);
  assert.match(assessmentPdf, /Started: Not set/);
});
