import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptCoachBlueBelt,
  blueBeltNotes,
  blueBeltPreviewSample,
  blueCheerSeen,
  claimBlueCheer,
  cleanBirthYear,
  coachKidsToBlue,
  isKidsToBlueUpdate,
} from './blueBeltCheer.ts';
import { buildCoachRankUpdate, dismissCoachRankUpdate, emptyUpdateLedger } from './coachRankUpdate.ts';
import { exportProgressPacket, parseProgressPacket } from './progress/format.ts';
import { blankStudentReport } from './studentEdition.ts';
import { assignStudentId } from './studentIdentity.ts';
import { beltModeOf, earlierKidRows } from './beltBook.ts';
import { setBeltMode, setBirthYear, setKidsBelt, setKidsTapeCount, setRankBelt } from './studentRank.ts';

const TODAY = new Date(2026, 10, 11);

function memory() {
  const bag = new Map<string, string>();
  return {
    getItem: (key: string) => bag.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bag.set(key, value);
    },
  };
}

function kidFile(beltId = 'green') {
  let report = assignStudentId(blankStudentReport(10), 'stu-kid');
  report = setBeltMode(report, 'kids', 11);
  report = setBirthYear(report, 2010, 12);
  report = setKidsBelt(report, beltId, 13);
  report = setKidsTapeCount(report, 2, 14);
  return report;
}

function rankPacket(belt: string, updateId = 'rank-blue-1', studentId = 'stu-kid', stripeCount = 0) {
  const built = buildCoachRankUpdate({ studentId, belt, stripeCount, promotionDate: '2026-11-10', now: 20, updateId });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

test('coach side: only a kids belt saved as Blue asks for the blue-belt confirmation', () => {
  for (const from of ['Grey', 'Yellow', 'Orange', 'Green', 'gray']) assert.equal(coachKidsToBlue(from, 'Blue'), true, from);
  assert.equal(coachKidsToBlue('White', 'Blue'), false);
  assert.equal(coachKidsToBlue('Blue', 'Purple'), false);
  assert.equal(coachKidsToBlue('Blue', 'Blue'), false);
  assert.equal(coachKidsToBlue('Green', 'Purple'), false);
  assert.equal(coachKidsToBlue('Yellow', 'Orange'), false);
  assert.equal(coachKidsToBlue(null, 'Blue'), false);
});

test('gentle notes: under 16 by birth year, under a year of training, or missing data', () => {
  assert.deepEqual(blueBeltNotes({ birthYear: 2010, trainingSince: '2020-01-01', name: 'Ana' }, TODAY), []);
  const young = blueBeltNotes({ birthYear: 2012, trainingSince: '2026-03-01', name: 'Ana' }, TODAY);
  assert.equal(young.length, 2);
  assert.match(young[0], /Ana turns 14 this year\. IBJJF adult belts start at 16/);
  assert.match(young[1], /under a year/);
  const blank = blueBeltNotes({ birthYear: null, trainingSince: '' }, TODAY);
  assert.match(blank[0], /No birth year/);
  assert.match(blank[1], /No training start date/);
  assert.match(blueBeltNotes({ birthYear: 2012, trainingSince: '2020-01-01', self: true }, TODAY)[0], /you turn 14/);
  assert.equal(cleanBirthYear('2010', TODAY), 2010);
  assert.equal(cleanBirthYear('20', TODAY), null);
  assert.equal(cleanBirthYear('2030', TODAY), null);
});

test('kids file + coach Blue packet: confirm moves to adult blue, keeps kids belts, cheers once', () => {
  const report = kidFile();
  const packet = rankPacket('Blue');
  // The packet is the same v2 rank update. Nothing new rides on it.
  assert.equal(parseProgressPacket(exportProgressPacket(packet)).ok, true);
  assert.equal(packet.schemaVersion, 2);
  assert.equal(isKidsToBlueUpdate(report, packet), true);
  const ledger = emptyUpdateLedger();
  const result = acceptCoachBlueBelt(report, packet, ledger, { birthYear: 2010 }, 30);
  assert.equal(result.applied, true);
  assert.equal(result.cheer, true);
  assert.equal(result.report.profile.belt, 'blue');
  assert.equal(beltModeOf(result.report), 'adult');
  assert.equal(result.report.rank?.awardedOn, '2026-11-10');
  assert.equal(result.report.rank?.tapeCount, 0);
  assert.equal(result.report.beltBook?.birthYear, 2010);
  assert.equal(result.report.beltBook?.kids?.beltId, 'green');
  assert.equal(earlierKidRows(result.report).some((row) => row.label === 'Green' && row.tapeCount === 2), true);
  assert.equal(result.report.journal.length, report.journal.length + 1);
  assert.deepEqual(result.ledger.accepted, ['rank-blue-1']);

  // The same update again never re-applies or re-cheers.
  const again = acceptCoachBlueBelt(result.report, packet, result.ledger, { birthYear: 2010 }, 31);
  assert.equal(again.applied, false);
  assert.equal(again.cheer, false);

  // Seen flag per profile: the first claim fires, a reload does not.
  const store = memory();
  assert.equal(claimBlueCheer(store, 'stu-kid', packet.updateId), true);
  assert.equal(claimBlueCheer(store, 'stu-kid', packet.updateId), false);
  assert.equal(blueCheerSeen(store, 'stu-kid', packet.updateId), true);
  assert.equal(blueCheerSeen(store, 'stu-other', packet.updateId), false);
  assert.equal(claimBlueCheer(store, 'stu-other', packet.updateId), true);
});

test('confirmed birth year is saved; stripes on the blue update still apply', () => {
  const report = kidFile('yellow');
  const result = acceptCoachBlueBelt(report, rankPacket('Blue', 'rank-blue-2', 'stu-kid', 1), emptyUpdateLedger(), { birthYear: 2009 }, 30);
  assert.equal(result.applied, true);
  assert.equal(result.report.beltBook?.birthYear, 2009);
  assert.equal(result.report.profile.belt, 'blue');
  assert.equal(result.report.rank?.tapeCount, 1);
});

test('adult promotions and other belts never take the blue-belt path or cheer', () => {
  const adultWhite = assignStudentId(blankStudentReport(10), 'stu-kid');
  assert.equal(isKidsToBlueUpdate(adultWhite, rankPacket('Blue')), false);
  const plain = acceptCoachBlueBelt(adultWhite, rankPacket('Blue'), emptyUpdateLedger(), { birthYear: 2000 }, 30);
  assert.equal(plain.applied, true);
  assert.equal(plain.cheer, false);
  assert.equal(plain.report.beltBook?.birthYear, undefined);

  const adultBlue = setRankBelt(adultWhite, 'blue', 11);
  assert.equal(isKidsToBlueUpdate(adultBlue, rankPacket('Purple')), false);
  assert.equal(acceptCoachBlueBelt(adultBlue, rankPacket('Purple', 'rank-p'), emptyUpdateLedger(), { birthYear: null }, 30).cheer, false);

  const kid = kidFile();
  assert.equal(isKidsToBlueUpdate(kid, rankPacket('Purple')), false);
  assert.equal(isKidsToBlueUpdate(kid, rankPacket('Green')), false);
  assert.equal(isKidsToBlueUpdate(kid, { kind: 'coach-note-update' }), false);
});

test('declined confirmation leaves the kids file untouched', () => {
  const report = kidFile();
  const packet = rankPacket('Blue');
  // "Not yet" applies nothing: the file and ledger are the same objects as before.
  const ledger = emptyUpdateLedger();
  assert.equal(beltModeOf(report), 'kids');
  const dismissed = dismissCoachRankUpdate(report, packet, ledger);
  assert.equal(dismissed.report, report);
  assert.equal(beltModeOf(dismissed.report), 'kids');
  assert.deepEqual(dismissed.ledger.dismissed, ['rank-blue-1']);
  // A dismissed update cannot be confirmed later.
  const late = acceptCoachBlueBelt(report, packet, dismissed.ledger, { birthYear: 2010 }, 40);
  assert.equal(late.applied, false);
  assert.equal(late.cheer, false);
  assert.equal(late.report, report);
});

test('a packet for another student never applies', () => {
  const result = acceptCoachBlueBelt(kidFile(), rankPacket('Blue', 'rank-x', 'stu-someone-else'), emptyUpdateLedger(), { birthYear: 2010 }, 30);
  assert.equal(result.applied, false);
  assert.equal(result.cheer, false);
});

test('preview sample is a green-belt kid with a Blue update', () => {
  const { report, packet } = blueBeltPreviewSample(TODAY, 5);
  assert.equal(beltModeOf(report), 'kids');
  assert.equal(report.beltBook?.birthYear, 2010);
  assert.equal(isKidsToBlueUpdate(report, packet), true);
  assert.equal(packet.studentId, report.studentId);
});
