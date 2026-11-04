import assert from 'node:assert/strict';
import test, { describe, it } from 'node:test';
import { ROSTER_CSV_EXPORT_HEADERS, ROSTER_CSV_HEADERS, importRosterCsv, serializeRosterCsv, rosterCsvTemplate } from './rosterCsv.ts';
import {
  ROSTER_CARD_KEY,
  ROSTER_CARD_PRIVATE_KEY,
  applyCsvCardFields,
  csvCardLookup,
  csvCardRows,
  readCardFile,
  writePrivateNotes,
  type KeyValueStore,
} from './rosterCardFields.ts';

function memory(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => void map.set(key, value) };
}

describe('roster CSV card columns', () => {
  it('template keeps the old columns first and adds the five optional card columns', () => {
    const header = rosterCsvTemplate().split('\r\n')[0];
    assert.ok(header.startsWith('Name,Belt,Division,Gym name / nickname,Last promotion,Last promotion detail,Notes,Check In'));
    assert.ok(header.endsWith('Belt achieved,Last stripe awarded,Stripes,Training start date,Gi / No-Gi / Both'));
  });

  it('round-trips belt achieved, last stripe, stripes, training start, and Gi / No-Gi through export and import', () => {
    const storage = memory();
    storage.setItem(
      ROSTER_CARD_KEY,
      JSON.stringify({
        cards: {
          a1: { trainingStartedOn: '2021-02-03', trainingStyle: 'nogi', coachRank: { belt: 'Blue', awardedOn: '2024-05-01', stripeDates: ['2024-09-01', '2025-01-15'] } },
        },
      }),
    );
    const csv = serializeRosterCsv(
      [{ id: 'a1', name: 'Ana Lima', belt: 'Blue', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: 'Tuesday class', checkedIn: false, stripes: 2 }],
      undefined,
      csvCardLookup(storage),
    );
    assert.match(csv, /2024-05-01,2025-01-15,2,2021-02-03,No-Gi/);

    const parsed = importRosterCsv(csv);
    assert.equal(parsed.students.length, 1);
    assert.equal(parsed.students[0].stripes, 2);
    const fields = parsed.cardFields?.[parsed.students[0].id];
    assert.deepEqual(fields, { beltAchievedOn: '2024-05-01', lastStripeOn: '2025-01-15', trainingStartedOn: '2021-02-03', trainingStyle: 'nogi' });

    // Import onto a fresh device: the new roster id gets the card fields.
    const fresh = memory();
    const added = [{ id: 'new-1', belt: 'Blue', stripes: 2 }];
    const changed = applyCsvCardFields(csvCardRows(parsed.students, added, parsed.cardFields), fresh, 1000);
    assert.equal(changed, 1);
    const card = readCardFile(fresh).cards['new-1'];
    assert.equal(card.trainingStartedOn, '2021-02-03');
    assert.equal(card.trainingStyle, 'nogi');
    assert.equal(card.coachRank?.awardedOn, '2024-05-01');
    assert.equal(card.coachRank?.stripeDates.at(-1), '2025-01-15');
  });

  it('accepts header aliases in any order', () => {
    const parsed = importRosterCsv(
      'Training style,Name,Belt,Member since,Belt date,Stripe date,Stripe count\r\nBoth,Rui,Purple,2019-01-01,2023-03-03,2023-10-10,3\r\n',
    );
    assert.equal(parsed.students.length, 1);
    assert.equal(parsed.students[0].stripes, 3);
    assert.deepEqual(parsed.cardFields?.[parsed.students[0].id], {
      beltAchievedOn: '2023-03-03',
      lastStripeOn: '2023-10-10',
      trainingStartedOn: '2019-01-01',
      trainingStyle: 'both',
    });
  });

  it('still imports an old CSV with none of the new columns, and adds no card fields', () => {
    const parsed = importRosterCsv('Name,Belt,Notes\r\nOld Timer,White,Likes guard\r\n');
    assert.equal(parsed.students.length, 1);
    assert.equal(parsed.students[0].note, 'Likes guard');
    assert.equal(parsed.cardFields, undefined);
    assert.deepEqual(csvCardRows(parsed.students, [{ id: 'x', belt: 'White' }], parsed.cardFields), []);
  });

  it('CSV import fills blank card fields only and never overwrites a card', () => {
    const storage = memory();
    storage.setItem(ROSTER_CARD_KEY, JSON.stringify({ cards: { k: { trainingStyle: 'gi' } } }));
    applyCsvCardFields(
      [{ rosterId: 'k', belt: 'White', fields: { beltAchievedOn: '', lastStripeOn: '', trainingStartedOn: '2020-01-01', trainingStyle: 'nogi' } }],
      storage,
    );
    const card = readCardFile(storage).cards.k;
    assert.equal(card.trainingStyle, 'gi');
    assert.equal(card.trainingStartedOn, '2020-01-01');
  });

  it('never writes private coach notes or photos into the CSV', () => {
    const storage = memory();
    writePrivateNotes(storage, { p1: 'SECRET injury history' });
    assert.ok(storage.map.get(ROSTER_CARD_PRIVATE_KEY)?.includes('SECRET'));
    const csv = serializeRosterCsv(
      [{ id: 'p1', name: 'Pat', belt: 'White', division: '', gym: '', lastPromotion: '', lastPromotionDetail: '', note: 'public note', checkedIn: false }],
      undefined,
      csvCardLookup(storage),
    );
    assert.doesNotMatch(csv, /SECRET/);
    assert.doesNotMatch(csv.toLowerCase(), /photo|data:image/);
    assert.match(csv, /public note/);
  });
});

test('a scouting Style column is not read as Gi / No-Gi / Both, and the base headers stay eight', () => {
  const result = importRosterCsv('Name,Belt,Style\nSam,Blue,pressure passer\n');
  assert.equal(result.error, undefined);
  assert.equal(result.students.length, 1);
  assert.equal(Object.keys(result.cardFields ?? {}).length, 0);
  assert.equal(ROSTER_CSV_HEADERS.length, 8);
  assert.equal(ROSTER_CSV_EXPORT_HEADERS.length, 13);
  assert.equal(serializeRosterCsv([]).split('\r\n').find((line) => line.startsWith('Name')), ROSTER_CSV_EXPORT_HEADERS.join(','));
});
