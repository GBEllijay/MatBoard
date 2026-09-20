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

  it('splits semicolon and tab files when a delimiter is passed', () => {
    assert.deepEqual(parseCsv('Name;Belt\nSam;Blue\n', ';'), [
      ['Name', 'Belt'],
      ['Sam', 'Blue'],
    ]);
    assert.deepEqual(parseCsv('Name\tBelt\nSam\tBlue\n', '\t'), [
      ['Name', 'Belt'],
      ['Sam', 'Blue'],
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

  it('imports every data row from a 20-person Excel CRLF spreadsheet', () => {
    const people = Array.from({ length: 20 }, (_, index) => {
      const n = String(index + 1).padStart(2, '0');
      return `Student ${n},Blue,2026-01-${n},Row ${n}`;
    });
    const csv = ['Name,Belt,Last promotion,Notes', ...people].join('\r\n');
    const next = importRosterCsv(csv);
    assert.equal(next.error, undefined);
    assert.equal(next.imported, 20);
    assert.equal(next.skipped, 0);
    assert.equal(next.students[0]?.name, 'Student 01');
    assert.equal(next.students[19]?.name, 'Student 20');
    assert.equal(next.students.every((row) => row.belt === 'Blue'), true);
  });

  it('maps flexible belt spellings including blackbelt and black belt', () => {
    const csv = [
      'Name,Belt',
      'Pat,blackbelt',
      'Alex,black belt',
      'Sam,Black Belt',
      'Kim,BB',
      'Lee,BLACK',
      'Jo,white belt',
      'Bo,bluebelt',
      'Ty,purple',
      'Cy,brown belt',
      'Val,coral belt',
      'Gray Kid,gray',
    ].join('\n');
    const next = importRosterCsv(csv);
    assert.equal(next.imported, 11);
    assert.deepEqual(
      next.students.map((row) => `${row.name}:${row.belt}`),
      [
        'Pat:Black',
        'Alex:Black',
        'Sam:Black',
        'Kim:Black',
        'Lee:Black',
        'Jo:White',
        'Bo:Blue',
        'Ty:Purple',
        'Cy:Brown',
        'Val:Coral',
        'Gray Kid:Grey',
      ],
    );
  });

  it('reads semicolon CSV, tab CSV, and a # belt-guide row above the header', () => {
    const semi = importRosterCsv('Name;Belt\nPat;blackbelt\nSam;Blue\n');
    assert.equal(semi.imported, 2);
    assert.equal(semi.students[0]?.belt, 'Black');

    const tabs = importRosterCsv('Name\tBelt\nPat\tblack belt\n');
    assert.equal(tabs.imported, 1);
    assert.equal(tabs.students[0]?.name, 'Pat');

    const guided = importRosterCsv(
      '# Belts: blackbelt, black belt, BB\r\nName,Belt\r\nAlex,blackbelt\r\n',
    );
    assert.equal(guided.imported, 1);
    assert.equal(guided.students[0]?.belt, 'Black');
  });

  it('joins first + last name columns and splits a multiline Name cell', () => {
    const split = importRosterCsv('First name,Last name,Belt\nJohn,Smith,blackbelt\n');
    assert.equal(split.imported, 1);
    assert.equal(split.students[0]?.name, 'John Smith');
    assert.equal(split.students[0]?.belt, 'Black');

    const stacked = importRosterCsv('Name,Belt\n"Pat Lee\nAlex Kim\nSam Jo",purple\n');
    assert.equal(stacked.imported, 3);
    assert.deepEqual(
      stacked.students.map((row) => `${row.name}:${row.belt}`),
      ['Pat Lee:Purple', 'Alex Kim:Purple', 'Sam Jo:Purple'],
    );
  });
});

describe('serializeRosterCsv', () => {
  it('writes the template headers plus one example row', () => {
    const csv = rosterCsvTemplate();
    assert.equal(csv.startsWith('# Belts'), true);
    assert.match(csv, /blackbelt/i);
    assert.match(csv, /black belt/i);
    assert.equal(csv.includes('Name,Belt,Last promotion,Notes\r\n'), true);
    assert.equal(csv.includes('Alex Rivera,Purple,2026-03-12,'), true);
    const roundTrip = importRosterCsv(csv);
    assert.equal(roundTrip.imported, 1);
    assert.equal(roundTrip.students[0]?.name, 'Alex Rivera');
    assert.equal(roundTrip.students[0]?.belt, 'Purple');
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
