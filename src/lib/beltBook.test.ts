import assert from 'node:assert/strict';
import test from 'node:test';
import { ADULT_IBJJF_TEMPLATE_ID, IBJJF_ADULT_TEMPLATE, IBJJF_KIDS_TEMPLATE, KIDS_IBJJF_TEMPLATE_ID, ibjjfMonthlyTapes } from './beltTemplates.ts';
import {
  addClassDot,
  addKidsBenchmark,
  adultStartChoices,
  ageWarning,
  beltModeOf,
  compactSlotCount,
  compactSlots,
  currentKidsBelt,
  earlierKidRows,
  kidsBenchmarksOf,
  kidsLadder,
  labelInk,
  literalSlots,
  literalTapeCountAfterTap,
  removeClassDot,
  setBeltMode,
  setBirthYear,
  setClassesPerTape,
  setKidsBelt,
  setKidsTapeCount,
  setLastTapeColor,
  setTapeGuide,
  showAdultPrompt,
  tapeCountAfterTap,
  timeGuideText,
  withBeltTemplate,
} from './beltBook.ts';
import { exportProgressPacket, mergeStudentProgress, parseProgressPacket } from './progress/format.ts';
import type { BeltTemplateRecord, StudentProgressReport } from './progress/types.ts';
import { blankStudentReport, saveStudentReport } from './studentEdition.ts';
import { showsAdultCheckpoints } from './studentTools.ts';
import { graduateToAdult, setInstructorBars, setRankBelt, setRankTapeCount } from './studentRank.ts';

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
  assert.deepEqual(greyWhite?.tapeColors, ibjjfMonthlyTapes(true));
  assert.equal(grey?.tapeColors.length, 11);
  assert.deepEqual(grey?.tapeColors.slice(8), ['#121214', '#121214', '#121214']);
  assert.equal(greyWhite?.ink, 'navy');
  assert.equal(labelInk(greyWhite ?? { ink: 'navy' }), 'navy');
  assert.equal(labelInk(IBJJF_KIDS_TEMPLATE.belts[3] ?? { ink: 'navy' }), 'navy');
  assert.equal(IBJJF_KIDS_TEMPLATE.belts[6]?.ink, 'navy');
  assert.equal(labelInk(IBJJF_KIDS_TEMPLATE.belts[6] ?? { ink: 'navy' }), 'navy');
  assert.equal(labelInk(IBJJF_KIDS_TEMPLATE.belts[5] ?? { ink: 'navy' }), 'navy');
  assert.equal(greyWhite?.center, 'white');
  assert.equal(IBJJF_KIDS_TEMPLATE.belts[3]?.center, 'black');
  assert.equal(IBJJF_KIDS_TEMPLATE.belts[5]?.ageMin, 7);
  assert.equal(ageWarning(IBJJF_KIDS_TEMPLATE.belts[0] ?? { ageMin: undefined }), '');
  assert.equal(ageWarning({ ageMin: 7, group: 'yellow' }), '');
  assert.equal(
    ageWarning({ ageMin: 7, ageMax: 15, group: 'yellow' }, 2020, new Date('2026-10-25T12:00:00Z')),
    'IBJJF age group: Yellow, ages 7-15.',
  );
  assert.equal(ageWarning({ ageMin: 7, ageMax: 15, group: 'yellow' }, 2016, new Date('2026-10-25T12:00:00Z')), '');
  assert.equal(kidsLadder(setBeltMode(blankStudentReport(3), 'kids', 4)).length, 13);
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
  report = setKidsTapeCount(report, 5, 36);
  assert.equal(report.beltBook?.kids?.tapeCount, 5);
  assert.throws(() => setKidsTapeCount(report, 6), /0 to 5/);
  report = setKidsBelt(report, 'white', 37);
  assert.throws(() => setKidsTapeCount(report, 6), /0 to 5/);
  report = setKidsBelt(report, 'grey', 38);
  report = setKidsTapeCount(report, 11, 39);
  assert.equal(report.beltBook?.kids?.tapeCount, 11);
  assert.throws(() => setKidsTapeCount(report, 12), /0 to 11/);
  assert.throws(() => setRankTapeCount(report, 5), /0 to 6|0 to 4|degree/);
});

test('compact stripes fill white, then turn red, then black', () => {
  const full = ibjjfMonthlyTapes(false);
  const white = '#f4f1ea';
  const red = '#d21f1f';
  const black = '#121214';
  assert.equal(compactSlots(full, 0).length, 4);
  assert.deepEqual(compactSlots(full, 0).map((slot) => slot.on), [false, false, false, false]);
  assert.deepEqual(compactSlots(full, 4).map((slot) => slot.color), [white, white, white, white]);
  assert.deepEqual(compactSlots(full, 6).map((slot) => slot.color), [red, red, white, white]);
  assert.deepEqual(compactSlots(full, 8).map((slot) => slot.color), [red, red, red, red]);
  assert.deepEqual(compactSlots(full, 9).map((slot) => slot.color), [black, red, red, red]);
  assert.deepEqual(compactSlots(full, 11).map((slot) => slot.color), [black, black, black, red]);
  assert.equal(tapeCountAfterTap(full, 0, 4), 4);
  assert.equal(tapeCountAfterTap(full, 4, 4), 3);
  assert.equal(tapeCountAfterTap(full, 4, 1), 5);
  assert.equal(tapeCountAfterTap(full, 5, 4), 8);
  assert.equal(tapeCountAfterTap(full, 8, 1), 9);
  assert.equal(tapeCountAfterTap(full, 9, 3), 11);
  assert.equal(tapeCountAfterTap(full, 11, 4), 11);
  assert.equal(tapeCountAfterTap(full, 11, 3), 10);

  const short = ibjjfMonthlyTapes(true);
  assert.equal(compactSlots(short, 0).length, 4);
  assert.deepEqual(compactSlots(short, 5).map((slot) => slot.color), [red, white, white, white]);
  assert.equal(tapeCountAfterTap(short, 4, 1), 5);
  assert.equal(tapeCountAfterTap(short, 4, 2), 4);
  assert.equal(tapeCountAfterTap(short, 5, 1), 4);
  assert.equal(tapeCountAfterTap(short, 5, 2), 5);

  const custom = ['#f4f1ea', '#f4f1ea', '#112233'];
  assert.equal(compactSlots(custom, 0).length, 2);
  assert.equal(tapeCountAfterTap(custom, 2, 1), 3);
  assert.deepEqual(compactSlots(custom, 3).map((slot) => slot.color), ['#112233', '#f4f1ea']);

  let report = setBeltMode(blankStudentReport(40), 'kids', 41);
  const ink = new Map(kidsLadder(report).map((rung) => [rung.label, rung.ink]));
  assert.equal(ink.get('Grey/White'), 'navy');
  assert.equal(ink.get('Yellow/White'), 'navy');
  assert.equal(ink.get('Orange/White'), 'white');
  assert.equal(ink.get('Grey/Black'), 'navy');
  assert.equal(ink.get('Yellow/Black'), 'navy');
  assert.equal(ink.get('Yellow'), 'navy');
  assert.equal(ink.get('Grey'), 'navy');
});

test('stepping a kids belt back to zero clears every slot, including after a demotion', () => {
  const full = ibjjfMonthlyTapes(false);
  const white = '#f4f1ea';
  const red = '#d21f1f';
  let count = full.length;
  while (count > 0) {
    const slots = compactSlots(full, count);
    if (count <= 4) {
      assert.equal(slots.filter((slot) => slot.on).length, count);
      assert.ok(slots.every((slot) => !slot.on || slot.color === white));
    }
    if (count === 5) assert.deepEqual(slots.map((slot) => slot.color), [red, white, white, white]);
    let stepped = count;
    for (let slot = 1; slot <= compactSlotCount(full); slot += 1) {
      if (tapeCountAfterTap(full, count, slot) === count - 1) {
        stepped = count - 1;
        break;
      }
    }
    assert.equal(stepped, count - 1);
    count = stepped;
  }
  assert.ok(compactSlots(full, 0).every((slot) => !slot.on && slot.color === ''));

  let report = setBeltMode(blankStudentReport(50), 'kids', 51);
  for (const belt of IBJJF_KIDS_TEMPLATE.belts) {
    report = setKidsBelt(report, belt.id, 52);
    report = setKidsTapeCount(report, belt.tapeColors.length, 53);
    report = setKidsTapeCount(report, 0, 54);
    assert.ok(compactSlots(currentKidsBelt(report).tapeColors, currentKidsBelt(report).tapeCount).every((slot) => !slot.on));
    report = setKidsBelt(report, 'white', 55);
    const left = kidsLadder(report).find((rung) => rung.beltId === belt.id);
    assert.equal(left?.tapeCount, 0);
    assert.ok(compactSlots(left?.tapeColors ?? [], left?.tapeCount ?? 0).every((slot) => !slot.on && slot.color === ''));
  }

  report = setKidsBelt(report, 'grey-white', 56);
  report = setKidsTapeCount(report, 5, 57);
  report = setKidsBelt(report, 'white', 58);
  const shown = kidsLadder(report).find((rung) => rung.label === 'Grey/White');
  assert.equal(shown?.tapeCount, 0);
  assert.ok(compactSlots(shown?.tapeColors ?? full, 0).every((slot) => slot.color !== red));
  assert.equal(report.beltBook?.kids?.history.some((row) => row.beltId === 'grey-white' && row.tapeCount === 5), true);
  report = setKidsBelt(report, 'grey-white', 59);
  report = setKidsBelt(report, 'white', 60);
  assert.equal(report.beltBook?.kids?.history.some((row) => row.beltId === 'grey-white'), false);
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

test('an old adult file keeps its rank when it is wrapped as adult IBJJF', () => {
  const adult = adultWithDegree();
  const raw = JSON.parse(exportProgressPacket(adult)) as StudentProgressReport;
  delete raw.beltBook;
  const text = JSON.stringify(raw);
  assert.equal(text.includes('adult-ibjjf@1'), false);
  const store = memory();
  store.setItem('matboard.studentEdition.v1', text);
  const loaded = saveStudentReport(store, JSON.parse(store.getItem('matboard.studentEdition.v1') ?? '{}') as StudentProgressReport);
  assert.equal(loaded.beltBook?.templateId, ADULT_IBJJF_TEMPLATE_ID);
  assert.equal(loaded.beltBook?.mode, 'adult');
  assert.equal(loaded.profile.belt, 'blue');
  assert.equal(loaded.rank?.tapeCount, 2);
  assert.equal(loaded.rank?.history.some((row) => row.belt === 'black' && row.tapeCount === 3), true);
  assert.equal(IBJJF_ADULT_TEMPLATE.belts[0]?.name, 'White');
  assert.equal(IBJJF_ADULT_TEMPLATE.belts[4]?.tapeColors.length, 6);
  const wrapped = withBeltTemplate(adult);
  assert.equal(exportProgressPacket(wrapped).includes('adult-ibjjf@1'), true);
  assert.equal(exportProgressPacket(wrapped).includes('"tapeCount":3'), true);
});

test('kids stripe slots stay one per tape, and the last three colors can change', () => {
  const full = ibjjfMonthlyTapes(false);
  const slots = literalSlots(full, 6);
  assert.equal(slots.length, 11);
  assert.deepEqual(slots.slice(0, 6).map((slot) => slot.on), [true, true, true, true, true, true]);
  assert.equal(slots[5]?.color, '#d21f1f');
  assert.equal(slots[8]?.on, false);
  assert.equal(literalTapeCountAfterTap(full, 4, 4), 3);
  assert.equal(literalTapeCountAfterTap(full, 4, 9), 9);
  const short = literalSlots(ibjjfMonthlyTapes(true), 5);
  assert.equal(short.length, 5);
  assert.equal(short[4]?.color, '#d21f1f');

  let report = setBeltMode(blankStudentReport(70), 'kids', 71);
  report = setKidsBelt(report, 'grey', 72);
  report = setLastTapeColor(report, '#2255aa', 73);
  const grey = currentKidsBelt(report);
  assert.deepEqual(grey.tapeColors.slice(8), ['#2255aa', '#2255aa', '#2255aa']);
  assert.equal(report.beltBook?.templateId, 'student-kids');
  assert.equal(currentKidsBelt(setKidsBelt(report, 'white', 74)).tapeColors.length, 5);
  assert.throws(() => setLastTapeColor(setKidsBelt(report, 'white', 75), '#2255aa', 76), /keeps its stripe colors/);
});

test('turning 16 can start the adult belt and keep kids belts read-only', () => {
  const today = new Date(2026, 5, 1);
  let report = setBeltMode(blankStudentReport(80), 'kids', 81);
  report = setBirthYear(report, 2010, 82);
  report = setKidsBelt(report, 'grey-white', 83);
  report = setKidsTapeCount(report, 2, 84);
  report = setKidsBelt(report, 'green', 85);
  report = setKidsTapeCount(report, 3, 86);
  assert.deepEqual(adultStartChoices(currentKidsBelt(report)), ['blue', 'purple']);
  assert.throws(() => graduateToAdult(report, 'white', 87, today), /not the IBJJF step/);
  const blue = graduateToAdult(report, 'blue', 88, today);
  assert.equal(blue.profile.belt, 'blue');
  assert.equal(blue.rank?.tapeCount, 0);
  assert.equal(blue.rank?.awardedOn, '2026-06-01');
  assert.equal(beltModeOf(blue), 'adult');
  assert.equal(blue.beltBook?.templateId, ADULT_IBJJF_TEMPLATE_ID);
  assert.equal(blue.beltBook?.kids?.beltId, 'green');
  assert.equal(blue.beltBook?.kids?.tapeCount, 3);
  assert.equal(earlierKidRows(blue).some((row) => row.label === 'Grey/White' && row.tapeCount === 2), true);
  assert.equal(earlierKidRows(blue).some((row) => row.label === 'Green' && row.tapeCount === 3), true);
  const purple = graduateToAdult(report, 'purple', 89, today);
  assert.equal(purple.profile.belt, 'purple');
  const whiteKid = setKidsBelt(setBirthYear(setBeltMode(blankStudentReport(90), 'kids', 91), 2010, 92), 'white', 93);
  assert.deepEqual(adultStartChoices(currentKidsBelt(whiteKid)), ['white']);
  assert.equal(graduateToAdult(whiteKid, 'white', 94, today).profile.belt, 'white');
  const yellow = setKidsBelt(whiteKid, 'yellow', 95);
  assert.deepEqual(adultStartChoices(currentKidsBelt(yellow)), ['blue']);
  assert.equal(kidsBenchmarksOf(addKidsBenchmark(yellow, 'yellow', 'Bridge', 96), 'yellow')[0]?.name, 'Bridge');
});
