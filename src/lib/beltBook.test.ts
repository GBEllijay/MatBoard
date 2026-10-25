import assert from 'node:assert/strict';
import test from 'node:test';
import { ADULT_IBJJF_TEMPLATE_ID, IBJJF_KIDS_TEMPLATE, KIDS_IBJJF_TEMPLATE_ID, ibjjfMonthlyTapes } from './beltTemplates.ts';
import {
  addClassDot,
  ageWarning,
  beltModeOf,
  currentKidsBelt,
  kidsLadder,
  removeClassDot,
  setBeltMode,
  setBirthYear,
  setClassesPerTape,
  setKidsBelt,
  setKidsTapeCount,
  setTapeGuide,
  showAdultPrompt,
  timeGuideText,
} from './beltBook.ts';
import { exportProgressPacket, mergeStudentProgress, parseProgressPacket } from './progress/format.ts';
import type { BeltTemplateRecord, StudentProgressReport } from './progress/types.ts';
import { blankStudentReport, saveStudentReport } from './studentEdition.ts';
import { showsAdultCheckpoints } from './studentTools.ts';
import { setInstructorBars, setRankBelt, setRankTapeCount } from './studentRank.ts';

const memory = () => {
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
};

function adultWithDegree(): StudentProgressReport {
  let report = setRankBelt(blankStudentReport(10), 'black', 11);
  report = setRankTapeCount(report, 3, 12);
  report = setInstructorBars(report, true, 13);
  report = setRankBelt(report, 'blue', 14);
  report = setRankTapeCount(report, 2, 15);
  return report;
}

test('IBJJF kids template is the 13-belt ladder with monthly tape colors', () => {
  assert.deepEqual(
    IBJJF_KIDS_TEMPLATE.belts.map((belt) => belt.name),
    [
      'White',
      'Grey/White',
      'Grey',
      'Grey/Black',
      'Yellow/White',
      'Yellow',
      'Yellow/Black',
      'Orange/White',
      'Orange',
      'Orange/Black',
      'Green/White',
      'Green',
      'Green/Black',
    ],
  );
  const white = IBJJF_KIDS_TEMPLATE.belts[0];
  const greyWhite = IBJJF_KIDS_TEMPLATE.belts[1];
  const grey = IBJJF_KIDS_TEMPLATE.belts[2];
  assert.equal(white?.tapeColors.length, 5);
  assert.equal(greyWhite?.tapeColors.length, 5);
  assert.deepEqual(white?.tapeColors, ibjjfMonthlyTapes(true));
  assert.equal(grey?.tapeColors.length, 11);
  assert.deepEqual(grey?.tapeColors.slice(8), ['#121214', '#121214', '#121214']);
  assert.equal(greyWhite?.center, 'white');
  assert.equal(IBJJF_KIDS_TEMPLATE.belts[3]?.center, 'black');
  assert.equal(IBJJF_KIDS_TEMPLATE.belts[5]?.ageMin, 7);
  assert.equal(ageWarning(IBJJF_KIDS_TEMPLATE.belts[0] ?? { ageMin: undefined }), '');
  assert.equal(ageWarning({ ageMin: 7 }), 'IBJJF suggests this belt from age 7.');
  assert.equal(ageWarning({ ageMin: 7, ageMax: 15 }, 2020, new Date('2026-10-25T12:00:00Z')), 'IBJJF suggests this belt from age 7. This reads as age 6.');
  assert.equal(ageWarning({ ageMin: 7, ageMax: 15 }, 2016, new Date('2026-10-25T12:00:00Z')), 'IBJJF suggests this belt from age 7.');
});

test('switching ladders keeps adult degrees and kids stripes on the same file', () => {
  let report = adultWithDegree();
  const before = exportProgressPacket(report);
  report = setBeltMode(report, 'kids', 20);
  assert.equal(beltModeOf(report), 'kids');
  assert.equal(report.profile.belt, 'blue');
  assert.equal(report.rank?.tapeCount, 2);
  assert.equal(report.rank?.history.some((row) => row.belt === 'black' && row.tapeCount === 3 && row.instructorBars), true);
  assert.equal(report.beltBook?.templateId, KIDS_IBJJF_TEMPLATE_ID);
  assert.equal(currentKidsBelt(report).label, 'White');
  report = setKidsBelt(report, 'yellow', 21);
  report = setKidsTapeCount(report, 11, 22);
  assert.equal(report.profile.belt, 'blue');
  assert.equal(report.rank?.tapeCount, 2);
  report = setBeltMode(report, 'adult', 23);
  assert.equal(beltModeOf(report), 'adult');
  assert.equal(report.profile.belt, 'blue');
  assert.equal(report.rank?.tapeCount, 2);
  assert.equal(report.rank?.history[0]?.tapeCount, 3);
  report = setBeltMode(report, 'kids', 24);
  assert.equal(currentKidsBelt(report).label, 'Yellow');
  assert.equal(currentKidsBelt(report).tapeCount, 11);
  assert.equal(before.includes('"beltBook"'), false);
  const saved = saveStudentReport(memory(), report);
  assert.equal(saved.beltBook?.kids?.beltId, 'yellow');
  assert.equal(saved.rank?.tapeCount, 2);
  const text = exportProgressPacket(saved);
  assert.equal(text.includes('"stripes"'), false);
  assert.equal(text.includes('"stripe"'), false);
  assert.equal(text.includes('"levelKey"'), false);
});

test('class dots fill a card and do not award a stripe', () => {
  let report = setBeltMode(blankStudentReport(10), 'kids', 11);
  for (let index = 0; index < 8; index += 1) report = addClassDot(report, 12 + index);
  assert.equal(report.beltBook?.kids?.classCount, 8);
  assert.equal(report.beltBook?.kids?.tapeCount, 0);
  report = addClassDot(report, 30);
  assert.equal(report.beltBook?.kids?.classCount, 8);
  report = setClassesPerTape(report, 4, 31);
  assert.equal(report.beltBook?.kids?.classCount, 4);
  assert.equal(report.beltBook?.kids?.classesPerTape, undefined);
  assert.equal(report.beltBook?.classesPerTape, 4);
  report = removeClassDot(report, 32);
  assert.equal(report.beltBook?.kids?.classCount, 3);
  report = setKidsTapeCount(report, 1, 33);
  assert.equal(report.beltBook?.kids?.tapeCount, 1);
  assert.equal(report.beltBook?.kids?.classCount, 0);
  report = setTapeGuide(report, 'time', 34);
  assert.match(timeGuideText(report, new Date('2026-10-25T12:00:00Z')), /one month between stripes/);
  report = setKidsBelt(report, 'grey-white', 35);
  assert.throws(() => setKidsTapeCount(report, 6), /0 to 5/);
  report = setKidsBelt(report, 'grey', 36);
  report = setKidsTapeCount(report, 11, 37);
  assert.equal(report.beltBook?.kids?.tapeCount, 11);
  assert.throws(() => setKidsTapeCount(report, 12), /0 to 11/);
  assert.throws(() => setRankTapeCount(report, 5), /0 to 6|0 to 4|degree/);
});

test('an old file stays on adult belts, and a custom template can reorder belts', () => {
  const parsed = parseProgressPacket(exportProgressPacket(blankStudentReport(10)));
  assert.equal(parsed.ok, true);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return;
  assert.equal(parsed.value.beltBook, undefined);
  assert.equal(beltModeOf(parsed.value), 'adult');
  assert.equal(showsAdultCheckpoints(parsed.value), true);

  const custom: BeltTemplateRecord = {
    id: 'custom-kids.1',
    name: 'My kids belts',
    kind: 'custom',
    version: 1,
    baseId: KIDS_IBJJF_TEMPLATE_ID,
    ageMode: 'kids',
    belts: [
      {
        id: 'extra',
        name: 'Extra',
        base: '#4a5a3a',
        center: 'solid',
        ink: 'white',
        tapeColors: ['#f4f1ea', '#f4f1ea', '#112233'],
        ageMin: 4,
      },
      {
        id: 'white',
        name: 'White',
        base: '#f1eee5',
        center: 'solid',
        ink: 'navy',
        tapeColors: ['#f4f1ea'],
      },
    ],
  };
  let report = setBeltMode(parsed.value, 'kids', 11);
  report = {
    ...report,
    beltBook: { ...report.beltBook, templateId: custom.id, templates: [custom] },
  };
  report = setKidsTapeCount(report, 1, 12);
  const saved = saveStudentReport(memory(), report);
  assert.deepEqual(kidsLadder(saved).map((rung) => rung.label), ['Extra', 'White']);
  assert.equal(kidsLadder(saved)[0]?.tapeColors[2], '#112233');
  assert.equal(showsAdultCheckpoints(saved), false);
  const back = setBeltMode(saved, 'adult', 12);
  assert.equal(back.beltBook?.templateId, ADULT_IBJJF_TEMPLATE_ID);
  assert.equal(back.beltBook?.kidsTemplateId, custom.id);
  const again = setBeltMode(back, 'kids', 13);
  assert.equal(again.beltBook?.templateId, custom.id);
  assert.equal(kidsLadder(again)[0]?.label, 'Extra');
  assert.equal(currentKidsBelt(again).label, 'White');

  const year = new Date().getFullYear() - 16;
  const prompted = setBirthYear(again, year, 14);
  assert.equal(showAdultPrompt(prompted), true);
  assert.equal(showAdultPrompt(setBeltMode(prompted, 'adult', 15)), false);

  let incoming = setBeltMode(blankStudentReport(16), 'kids', 17);
  incoming = setKidsTapeCount(incoming, 1, 18);
  incoming.studentId = saved.studentId;
  const merged = mergeStudentProgress(saved, incoming);
  assert.equal(merged.report.beltBook?.mode, 'kids');
  assert.equal(merged.report.beltBook?.kids?.beltId, 'white');
  assert.equal(merged.report.beltBook?.templates?.[0]?.belts[0]?.name, 'Extra');
  assert.match(merged.conflicts.join('\n'), /Kids belts were kept/);
});
