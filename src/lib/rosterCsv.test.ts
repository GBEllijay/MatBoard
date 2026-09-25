import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ROSTER_CSV_WORKBOOK_ERROR,
  csvField,
  decodeRosterCsvBytes,
  detectCsvDelimiter,
  formatRosterCsvSummary,
  importRosterCsv,
  importRosterCsvBytes,
  importRosterCsvFile,
  isSpreadsheetWorkbook,
  parseCsv,
  parseImportDate,
  rosterCsvTemplate,
  serializeRosterCsv,
  withUtf8Bom,
} from './rosterCsv.ts';

const THREE_ROW_PEOPLE = [
  { name: 'Hapkidoka', belt: 'Blue' },
  { name: 'Kristofer Núñez', belt: 'Black' },
  { name: 'José Peña', belt: 'Purple' },
] as const;

function threeRowCsv(eol = '\r\n', bom = false): string {
  const body = [
    'Name,Belt,Last promotion,Notes',
    'Hapkidoka,Blue,,',
    'Kristofer Núñez,Black,,',
    'José Peña,Purple,,',
  ].join(eol);
  return `${bom ? '\uFEFF' : ''}${body}${eol}`;
}

function encodeWindows1252(text: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code > 255) throw new Error(`Cannot encode ${char}`);
    bytes.push(code);
  }
  return Uint8Array.from(bytes);
}

function assertThreeRowImport(next: ReturnType<typeof importRosterCsv>) {
  assert.equal(next.error, undefined);
  assert.equal(next.imported, 3);
  assert.equal(next.skipped, 0);
  assert.deepEqual(
    next.students.map((row) => `${row.name}:${row.belt}`),
    THREE_ROW_PEOPLE.map((row) => `${row.name}:${row.belt}`),
  );
}

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

  it('reads an Excel-saved quoted CSV with BOM, blank columns, and extra empty rows', () => {
    const people = Array.from({ length: 20 }, (_, index) => {
      const n = String(index + 1).padStart(2, '0');
      const belt = index === 0 ? 'blackbelt' : 'Blue';
      return `"Student ${n}","${belt}","2026-01-${n}","",,`;
    });
    const csv = `\uFEFF" name "," BELT ","Last  Promotion"," notes ",,\r\n\r\n${people.join('\r\n')}\r\n\r\n`;
    const next = importRosterCsv(csv);
    assert.equal(next.error, undefined);
    assert.equal(next.imported, 20);
    assert.equal(next.skipped, 0);
    assert.equal(next.students[0]?.name, 'Student 01');
    assert.equal(next.students[0]?.belt, 'Black');
    assert.equal(next.students[19]?.name, 'Student 20');
  });

  it('rejects an Excel workbook instead of silently importing junk', () => {
    assert.equal(isSpreadsheetWorkbook({ name: 'roster.xlsx' }), true);
    assert.equal(isSpreadsheetWorkbook({ name: 'roster.csv' }), false);
    const zip = importRosterCsv('PK\u0003\u0004[Content_Types].xml');
    assert.equal(zip.error, ROSTER_CSV_WORKBOOK_ERROR);
    assert.equal(zip.imported, 0);
    const person = importRosterCsv('Name,Belt\nPK Smith,bluebelt\n');
    assert.equal(person.imported, 1);
    assert.equal(person.students[0]?.name, 'PK Smith');
    assert.equal(person.students[0]?.belt, 'Blue');
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

describe('gym column', () => {
  it('keeps an optional gym and still imports older files that have no gym column', () => {
    const withGym = importRosterCsv('Name,School,Belt\nAlex Rivera,Checkmat,Purple\n');
    assert.equal(withGym.students[0]?.gym, 'Checkmat');
    const academy = importRosterCsv('Name,Belt,Academy\nSam,Blue,Atos\n');
    assert.equal(academy.students[0]?.gym, 'Atos');
    const older = importRosterCsv('Name,Belt,Last promotion,Notes\nPat,Brown,2026-01-02,Quiet\n');
    assert.equal(older.imported, 1);
    assert.equal(older.students[0]?.gym, '');
    assert.equal(older.students[0]?.note, 'Quiet');
    assert.equal(older.students[0]?.division, '');
  });
});

describe('division column', () => {
  it('round-trips a division and still imports older files that omit it', () => {
    const csv = serializeRosterCsv([
      {
        name: 'Sam',
        belt: 'Blue',
        division: 'Adult Blue, Gi',
        gym: 'Atos',
        lastPromotion: '2026-01-02',
        note: 'Quiet',
      },
    ]);
    assert.match(csv, /Sam,Blue,"Adult Blue, Gi",Atos,2026-01-02,Quiet/);
    const next = importRosterCsv(csv);
    assert.equal(next.imported, 1);
    assert.equal(next.students[0]?.division, 'Adult Blue, Gi');
    assert.equal(next.students[0]?.gym, 'Atos');

    const older = importRosterCsv('Name,Belt,Gym name,Last promotion,Notes\nPat,Brown,Alliance,2026-01-02,Quiet\n');
    assert.equal(older.imported, 1);
    assert.equal(older.students[0]?.division, '');
    assert.equal(older.students[0]?.gym, 'Alliance');

    const aliased = importRosterCsv('Name,Belt,Weight class\nAlex,Purple,Masters 1\n');
    assert.equal(aliased.students[0]?.division, 'Masters 1');
  });
});

describe('serializeRosterCsv', () => {
  it('writes an Excel-friendly UTF-8 template with a single-cell belt guide', () => {
    const csv = rosterCsvTemplate();
    assert.match(csv, /^sep=,/);
    assert.match(csv, /Save as CSV UTF-8/);
    assert.match(csv, /blackbelt/i);
    assert.match(csv, /black belt/i);
    assert.equal(csv.includes('Name,Belt,Division,Gym name,Last promotion,Notes\r\n'), true);
    assert.equal(csv.includes('Alex Rivera,Purple,Adult Purple,Alliance,2026-03-12,'), true);
    const guideRow = parseCsv(csv, detectCsvDelimiter(csv)).find((row) => row[0]?.trim().startsWith('#'));
    assert.equal(guideRow?.length, 1);
    assert.equal(withUtf8Bom(csv).startsWith('\uFEFF'), true);
    const roundTrip = importRosterCsv(csv);
    assert.equal(roundTrip.imported, 1);
    assert.equal(roundTrip.students[0]?.name, 'Alex Rivera');
    assert.equal(roundTrip.students[0]?.belt, 'Purple');
    assert.equal(roundTrip.students[0]?.gym, 'Alliance');
    assert.equal(roundTrip.students[0]?.division, 'Adult Purple');
  });

  it('imports every filled template row with mixed belts and an accented name', () => {
    const csv = `${rosterCsvTemplate().trimEnd()}\r\n${THREE_ROW_PEOPLE.map((row) => `${csvField(row.name)},${row.belt},,`).join('\r\n')}\r\n`;
    const next = importRosterCsv(csv);
    assert.equal(next.imported, 4);
    assert.deepEqual(
      next.students.map((row) => `${row.name}:${row.belt}`),
      ['Alex Rivera:Purple', ...THREE_ROW_PEOPLE.map((row) => `${row.name}:${row.belt}`)],
    );
  });

  it('quotes notes so a round-trip keeps commas', () => {
    const csv = serializeRosterCsv([
      {
        name: 'Sam',
        belt: 'Blue',
        division: 'Kids Gi',
        gym: 'Atos',
        lastPromotion: '2026-01-02',
        note: 'Rest, ice',
      },
    ]);
    assert.match(csv, /Sam,Blue,Kids Gi,Atos,2026-01-02,"Rest, ice"/);
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
    assert.equal(
      formatRosterCsvSummary(1, 2, 'Kristofer Núñez: no belt; José Peña: no belt'),
      '1 imported, 2 skipped (Kristofer Núñez: no belt; José Peña: no belt)',
    );
  });
});

describe('Excel / encoding roster CSV', () => {
  it('imports a 3-row Excel CRLF file with a UTF-8 BOM, accented name, and mixed belts', () => {
    assertThreeRowImport(importRosterCsv(threeRowCsv('\r\n', true)));
  });

  it('imports the same 3-row file from Windows-1252 bytes (Excel ANSI CSV)', () => {
    const bytes = encodeWindows1252(threeRowCsv('\r\n', false));
    assert.match(decodeRosterCsvBytes(bytes), /Kristofer Núñez/);
    assert.match(decodeRosterCsvBytes(bytes), /José Peña/);
    assertThreeRowImport(importRosterCsvBytes(bytes));
  });

  it('does not misread a real UTF-8 accented file as Windows-1252', () => {
    const bytes = new TextEncoder().encode(threeRowCsv('\n', false));
    assertThreeRowImport(importRosterCsvBytes(bytes));
  });

  it('reads UTF-16 LE BOM bytes the way Excel Unicode CSV is saved', () => {
    const bytes = new Uint8Array(Buffer.from(`\uFEFF${threeRowCsv('\r\n', false)}`, 'utf16le'));
    assertThreeRowImport(importRosterCsvBytes(bytes));
  });

  it('maps belts per row when Excel quotes every cell', () => {
    const csv = `\uFEFF"Name","Belt","Last promotion","Notes"\r\n"Hapkidoka","Blue","",""\r\n"Kristofer Núñez","blackbelt","",""\r\n"José Peña","purple","",""\r\n`;
    const next = importRosterCsv(csv);
    assert.deepEqual(
      next.students.map((row) => `${row.name}:${row.belt}`),
      ['Hapkidoka:Blue', 'Kristofer Núñez:Black', 'José Peña:Purple'],
    );
  });

  it('recovers a one-column Excel export where each line is a quoted CSV row', () => {
    const csv = [
      '"Name,Belt,Last promotion,Notes"',
      '"Hapkidoka,Blue,,"',
      '"Kristofer Núñez,Black,,"',
      '"José Peña,Purple,,"',
    ].join('\r\n');
    assertThreeRowImport(importRosterCsv(csv));
  });

  it('does not bleed belts when an unclosed quote swallows later rows', () => {
    const csv = 'Name,Belt\r\nHapkidoka,Blue\r\n"Kristofer Núñez,Black\r\nJosé Peña,Purple\r\n';
    assertThreeRowImport(importRosterCsv(csv));
  });

  it('zips stacked Name and Belt cells so each person keeps their own rank', () => {
    const csv = 'Name,Belt\n"Hapkidoka\nKristofer Núñez\nJosé Peña","Blue\nBlack\nPurple"\n';
    assertThreeRowImport(importRosterCsv(csv));
  });

  it('reads Windows-1252 bytes through importRosterCsvFile the way the roster page does', async () => {
    const bytes = encodeWindows1252(threeRowCsv('\r\n', false));
    const file = new File([bytes], 'roster.csv', { type: 'text/csv' });
    assertThreeRowImport(await importRosterCsvFile(file));
  });

  it('imports the owner advantage-roster.csv: UTF-8 BOM + Kristofer Lamèy, belts per row', () => {
    const csv = [
      'Name,Belt,Last promotion,Notes',
      'Justin Guise,Black,2026-03-12,Jokes too much in class.',
      'Kristofer Lamèy,Purple,2026-05-20,Needs to attack more from his guard and rack up advantage',
      'Paige Galitello,Brown,2024-09-24,"Amazing, jiu jitsu. Internationally renowned competitor and"',
    ].join('\r\n');
    const expected = [
      'Justin Guise:Black',
      'Kristofer Lamèy:Purple',
      'Paige Galitello:Brown',
    ];

    const withBom = `\uFEFF${csv}\r\n`;
    const bomImport = importRosterCsv(withBom);
    assert.equal(bomImport.error, undefined);
    assert.equal(bomImport.imported, 3);
    assert.deepEqual(
      bomImport.students.map((row) => `${row.name}:${row.belt}`),
      expected,
    );

    const utf8Bytes = new TextEncoder().encode(withBom);
    assert.deepEqual(utf8Bytes.slice(0, 3), Uint8Array.from([0xef, 0xbb, 0xbf]));
    const fromBytes = importRosterCsvBytes(utf8Bytes);
    assert.deepEqual(
      fromBytes.students.map((row) => `${row.name}:${row.belt}`),
      expected,
    );

    // Google Sheets / Android: UTF-8 BOM file opened as Latin-1 → ï»¿Name and LamÃ¨y
    const sheetsView = new TextDecoder('windows-1252').decode(utf8Bytes);
    assert.equal(sheetsView.startsWith('ï»¿Name'), true);
    assert.equal(sheetsView.includes('LamÃ¨y'), true);
    const recovered = importRosterCsv(sheetsView);
    assert.equal(recovered.error, undefined);
    assert.equal(recovered.imported, 3);
    assert.equal(recovered.skipped, 0);
    assert.deepEqual(
      recovered.students.map((row) => `${row.name}:${row.belt}`),
      expected,
    );
    assert.equal(recovered.students[1]?.name, 'Kristofer Lamèy');
    assert.equal(recovered.students[0]?.belt, 'Black');
    assert.equal(recovered.students[1]?.belt, 'Purple');
    assert.equal(recovered.students[2]?.belt, 'Brown');

    const sheetsResave = importRosterCsvBytes(new TextEncoder().encode(sheetsView));
    assert.deepEqual(
      sheetsResave.students.map((row) => `${row.name}:${row.belt}`),
      expected,
    );
    assert.equal(sheetsResave.students[1]?.name, 'Kristofer Lamèy');
  });
});
