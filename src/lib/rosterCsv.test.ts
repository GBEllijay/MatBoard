import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatRosterCsvSummary,
  importRosterCsv,
  parseCsv,
  parseImportDate,
  rosterCsvTemplate,
  serializeRosterCsv,
} from './rosterCsv.ts';

describe('parseCsv', () => {
  it('splits comma fields and strips a UTF-8 BOM', () => {
    assert.deepEqual(parseCsv('\uFEFFName,Belt\nAlex,Blue\n'), [
      ['Name', 'Belt'],
      ['Alex', 'Blue'],
    ]);
  });

  it('keeps quoted commas, quotes, and blank trailing cells', () => {
    assert.deepEqual(parseCsv('Notes\n"Left knee, rest"\n"He said ""go"""\n,\n'), [
      ['Notes'],
      ['Left knee, rest'],
      ['He said "go"'],
    ]);
  });
});

describe('importRosterCsv', () => {
  it('maps columns by header in any order and skips incomplete rows', () => {
    const csv = [
      'Notes,Belt,Name,Last promotion',
      'Quiet,Blue,Sam,2026-01-15',
      ',Purple,,',
      'Skip me,,Pat,',
      'Keep,black,Alex,',
      '',
    ].join('\n');
    const next = importRosterCsv(csv);
    assert.equal(next.error, undefined);
    assert.equal(next.imported, 2);
    assert.equal(next.skipped, 2);
    assert.deepEqual(
      next.students.map((row) => `${row.name}:${row.belt}:${row.lastPromotion}:${row.note}`),
      ['Sam:Blue:2026-01-15:Quiet', 'Alex:Black::Keep'],
    );
  });

  it('accepts header aliases, US dates, and quoted notes', () => {
    const csv = 'Student name,Rank,Promotion date,Short note\r\n"Rivera, Alex",purple,3/12/2026,"Left knee, rest"\r\n';
    const next = importRosterCsv(csv);
    assert.equal(next.imported, 1);
    assert.equal(next.students[0]?.name, 'Rivera, Alex');
    assert.equal(next.students[0]?.belt, 'Purple');
    assert.equal(next.students[0]?.lastPromotion, '2026-03-12');
    assert.equal(next.students[0]?.note, 'Left knee, rest');
  });

  it('keeps a student when the date is junk and reports missing headers', () => {
    const kept = importRosterCsv('Name,Belt,Last promotion\nSam,Blue,March 12\n');
    assert.equal(kept.imported, 1);
    assert.equal(kept.students[0]?.lastPromotion, '');
    const missing = importRosterCsv('Title,Color\nSam,Blue\n');
    assert.equal(missing.error, 'Need a Name and Belt column.');
    assert.equal(missing.imported, 0);
  });
});

describe('serializeRosterCsv', () => {
  it('writes the template headers plus one example row', () => {
    const csv = rosterCsvTemplate();
    assert.equal(csv.startsWith('Name,Belt,Last promotion,Notes\r\n'), true);
    assert.equal(csv.includes('Alex Rivera,Purple,2026-03-12,Example - delete this row'), true);
    const roundTrip = importRosterCsv(csv);
    assert.equal(roundTrip.imported, 1);
    assert.equal(roundTrip.students[0]?.name, 'Alex Rivera');
  });

  it('quotes notes so a round-trip keeps commas', () => {
    const csv = serializeRosterCsv([
      { name: 'Sam', belt: 'Blue', lastPromotion: '2026-01-02', note: 'Rest, ice' },
    ]);
    const next = importRosterCsv(csv);
    assert.deepEqual(
      next.students.map((row) => `${row.name}:${row.note}`),
      ['Sam:Rest, ice'],
    );
  });
});

describe('parseImportDate and summary', () => {
  it('accepts ISO and US dates and formats the import line', () => {
    assert.equal(parseImportDate('2026-03-12'), '2026-03-12');
    assert.equal(parseImportDate('3/12/2026'), '2026-03-12');
    assert.equal(parseImportDate('03-12-2026'), '2026-03-12');
    assert.equal(parseImportDate('2026-13-01'), '');
    assert.equal(formatRosterCsvSummary(12, 2), '12 imported, 2 skipped');
  });
});
