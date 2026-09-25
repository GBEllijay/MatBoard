/** Roster CSV. Browser file in/out — UTF-8 (BOM), Excel CRLF, Windows-1252 fallback. */

import { studentFromInput, type Student } from './rosterStore.ts';

export const ROSTER_CSV_HEADERS = ['Name', 'Belt', 'Gym name', 'Last promotion', 'Notes'] as const;
export const ROSTER_CSV_SEP_LINE = 'sep=,';
export const ROSTER_CSV_SAVE_HINT =
  'Save as CSV UTF-8 (comma-separated), not an Excel workbook (.xlsx).';
export const ROSTER_CSV_WORKBOOK_ERROR =
  'That looks like an Excel workbook. Save as CSV UTF-8 (comma-separated), then import.';
export const ROSTER_CSV_BELT_GUIDE =
  `# ${ROSTER_CSV_SAVE_HINT} One competitor per row. Belts (required on every row): White, Blue, Purple, Brown, Black, Coral; kids Grey, Yellow, Orange, Green. Also accepted: black, Black, blackbelt, black belt, Black Belt, BB, white belt, bluebelt, and the same color + belt spellings for each rank.`;
export const ROSTER_CSV_EXAMPLE = {
  name: 'Alex Rivera',
  belt: 'Purple',
  gym: 'Alliance',
  lastPromotion: '2026-03-12',
  note: 'Example - delete this row. Save as CSV UTF-8.',
} as const;

export type RosterCsvRow = Pick<Student, 'name' | 'belt' | 'gym' | 'lastPromotion' | 'note'>;

export type RosterCsvImport = {
  students: Student[];
  imported: number;
  skipped: number;
  error?: string;
  skippedDetail?: string;
};

type HeaderField = 'name' | 'firstName' | 'lastName' | 'belt' | 'gym' | 'lastPromotion' | 'note';

const HEADER_ALIASES: Record<string, HeaderField> = {
  name: 'name',
  student: 'name',
  competitor: 'name',
  'student name': 'name',
  'full name': 'name',
  'competitor name': 'name',
  first: 'firstName',
  'first name': 'firstName',
  firstname: 'firstName',
  'given name': 'firstName',
  last: 'lastName',
  'last name': 'lastName',
  lastname: 'lastName',
  surname: 'lastName',
  'family name': 'lastName',
  belt: 'belt',
  rank: 'belt',
  'belt rank': 'belt',
  'belt color': 'belt',
  gym: 'gym',
  'gym name': 'gym',
  school: 'gym',
  academy: 'gym',
  'school name': 'gym',
  'academy name': 'gym',
  team: 'gym',
  'last promotion': 'lastPromotion',
  lastpromotion: 'lastPromotion',
  promotion: 'lastPromotion',
  'promotion date': 'lastPromotion',
  'last promoted': 'lastPromotion',
  promoted: 'lastPromotion',
  notes: 'note',
  note: 'note',
  'short note': 'note',
  comments: 'note',
  comment: 'note',
};

const DELIMITERS = [',', ';', '\t'] as const;

/** UTF-8 BOM (EF BB BF) mis-read as Latin-1 / Windows-1252 — Sheets shows `ï»¿Name`. */
const UTF8_BOM_MOJIBAKE = '\u00EF\u00BB\u00BF';

export function withUtf8Bom(text: string): string {
  return text.startsWith('\uFEFF') ? text : `\uFEFF${text}`;
}

function stripBomPrefix(text: string): string {
  if (text.startsWith('\uFEFF')) return text.slice(1);
  if (text.startsWith(UTF8_BOM_MOJIBAKE)) return text.slice(UTF8_BOM_MOJIBAKE.length);
  return text;
}

function latin1Bytes(text: string): Uint8Array | null {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code > 255) return null;
    bytes[i] = code;
  }
  return bytes;
}

/** True when UTF-8 was decoded as Latin-1 (`ï»¿`, `LamÃ¨y`). */
export function looksLikeUtf8Mojibake(text: string): boolean {
  if (text.includes(UTF8_BOM_MOJIBAKE)) return true;
  return /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]/.test(text);
}

/** Turn `ï»¿Name` / `LamÃ¨y` back into a BOM-free UTF-8 string (`Name` / `Lamèy`). */
export function repairUtf8Mojibake(text: string): string {
  const stripped = stripBomPrefix(text);
  if (!looksLikeUtf8Mojibake(text)) return stripped.replace(/\u0000/g, '');
  const bytes = latin1Bytes(text.startsWith('\uFEFF') ? stripped : text);
  if (!bytes) return stripped.replace(/\u0000/g, '');
  try {
    return stripBomPrefix(new TextDecoder('utf-8', { fatal: true }).decode(bytes)).replace(/\u0000/g, '');
  } catch {
    return stripped.replace(/\u0000/g, '');
  }
}

function normalizeCsvText(text: string): string {
  return repairUtf8Mojibake(text).replace(/\u0000/g, '');
}

function looksLikeUtf16Le(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const even = bytes.length % 2 === 0;
  const sample = Math.min(bytes.length, even ? bytes.length : bytes.length - 1);
  if (sample < 8) return false;
  let oddNuls = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < sample; i += 2) {
    pairs += 1;
    if (bytes[i + 1] === 0) oddNuls += 1;
  }
  return pairs >= 4 && oddNuls / pairs >= 0.6;
}

function looksLikeUtf16Be(bytes: Uint8Array): boolean {
  if (bytes.length < 8) return false;
  const sample = Math.min(bytes.length, bytes.length % 2 === 0 ? bytes.length : bytes.length - 1);
  if (sample < 8) return false;
  let evenNuls = 0;
  let pairs = 0;
  for (let i = 0; i + 1 < sample; i += 2) {
    pairs += 1;
    if (bytes[i] === 0) evenNuls += 1;
  }
  return pairs >= 4 && evenNuls / pairs >= 0.6;
}

export function looksLikeWorkbookBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)) {
    return true;
  }
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

/** Decode Excel / Sheets / Numbers CSV bytes. UTF-8 (+ BOM), UTF-16, then Windows-1252. */
export function decodeRosterCsvBytes(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return repairUtf8Mojibake(new TextDecoder('utf-8').decode(bytes));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return repairUtf8Mojibake(new TextDecoder('utf-16le').decode(bytes));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return repairUtf8Mojibake(new TextDecoder('utf-16be').decode(bytes));
  }
  if (looksLikeWorkbookBytes(bytes)) {
    return new TextDecoder('latin1').decode(bytes);
  }
  if (looksLikeUtf16Le(bytes)) {
    return repairUtf8Mojibake(new TextDecoder('utf-16le').decode(bytes));
  }
  if (looksLikeUtf16Be(bytes)) {
    return repairUtf8Mojibake(new TextDecoder('utf-16be').decode(bytes));
  }
  try {
    return repairUtf8Mojibake(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return repairUtf8Mojibake(new TextDecoder('windows-1252').decode(bytes));
  }
}

function normalizeHeader(value: string): string {
  return stripBomPrefix(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function countUnquoted(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) count += 1;
  }
  return count;
}

function firstContentLines(text: string): string[] {
  return normalizeCsvText(text)
    .split(/\r\n|\n|\r/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isPreambleLine(line: string): boolean {
  const trimmed = stripBomPrefix(line.trim());
  if (!trimmed) return true;
  if (/^sep=/i.test(trimmed)) return true;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.startsWith('"#')) return true;
  return false;
}

export function detectCsvDelimiter(text: string): string {
  const lines = firstContentLines(text);
  for (const line of lines) {
    const sep = line.match(/^sep=(.)$/i);
    if (sep) return sep[1];
  }
  const candidates = lines.filter((line) => !isPreambleLine(line)).slice(0, 6);
  const scan = candidates.length ? candidates : lines;
  let best: string = ',';
  let bestCount = 0;
  for (const line of scan) {
    for (const delimiter of DELIMITERS) {
      const count = countUnquoted(line, delimiter);
      if (count > bestCount) {
        best = delimiter;
        bestCount = count;
      }
    }
  }
  return best;
}

export function parseCsv(text: string, delimiter = ','): string[][] {
  const src = normalizeCsvText(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushRow = () => {
    row.push(field);
    field = '';
    if (row.some((cellValue) => cellValue.trim())) rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const char = src[i];
    if (inQuotes) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && src[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  if (inQuotes || field.length || row.length) pushRow();
  return rows;
}

export function csvField(value: string): string {
  if (/[",\r\n]/.test(value) || value.startsWith(' ') || value.endsWith(' ')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeRosterCsv(rows: RosterCsvRow[]): string {
  const lines = [
    ROSTER_CSV_HEADERS.join(','),
    ...rows.map((row) =>
      [row.name, row.belt, row.gym, row.lastPromotion, row.note].map(csvField).join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function rosterCsvTemplate(): string {
  return `${ROSTER_CSV_SEP_LINE}\r\n${csvField(ROSTER_CSV_BELT_GUIDE)}\r\n${serializeRosterCsv([
    {
      name: ROSTER_CSV_EXAMPLE.name,
      belt: ROSTER_CSV_EXAMPLE.belt,
      gym: ROSTER_CSV_EXAMPLE.gym,
      lastPromotion: ROSTER_CSV_EXAMPLE.lastPromotion,
      note: ROSTER_CSV_EXAMPLE.note,
    },
  ])}`;
}

export function parseImportDate(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return trimmed;
    }
    return '';
  }
  const us = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const month = Number(us[1]);
    const day = Number(us[2]);
    const year = Number(us[3]);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return '';
}

function mapHeaders(headerRow: string[]): Partial<Record<HeaderField, number>> {
  const map: Partial<Record<HeaderField, number>> = {};
  headerRow.forEach((cellValue, index) => {
    const field = HEADER_ALIASES[normalizeHeader(cellValue)];
    if (field && map[field] == null) map[field] = index;
  });
  return map;
}

function isSkippableRow(row: string[]): boolean {
  const first = row[0]?.trim() ?? '';
  return first.startsWith('#') || /^sep=/i.test(first);
}

function hasRequiredColumns(columns: Partial<Record<HeaderField, number>>): boolean {
  const hasName = columns.name != null || columns.firstName != null || columns.lastName != null;
  return hasName && columns.belt != null;
}

function cell(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return '';
  return row[index] ?? '';
}

function combineName(row: string[], columns: Partial<Record<HeaderField, number>>): string {
  const full = cell(row, columns.name).trim();
  const first = cell(row, columns.firstName).trim();
  const last = cell(row, columns.lastName).trim();
  if (full) {
    if (last && !full.toLowerCase().includes(last.toLowerCase())) return `${full} ${last}`.trim();
    return full;
  }
  return [first, last].filter(Boolean).join(' ');
}

function splitLines(value: string): string[] {
  return value
    .split(/\r\n|\n|\r/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findHeaderRow(rows: string[][]): { index: number; columns: Partial<Record<HeaderField, number>> } | null {
  for (let index = 0; index < rows.length; index += 1) {
    if (isSkippableRow(rows[index])) continue;
    const columns = mapHeaders(rows[index]);
    if (hasRequiredColumns(columns)) return { index, columns };
  }
  return null;
}

function looksLikeHeaderText(text: string): boolean {
  const inner = parseCsv(`${text}\n`, detectCsvDelimiter(`${text}\n`))[0] ?? [];
  return hasRequiredColumns(mapHeaders(inner));
}

function expandEmbeddedSingleColumn(rows: string[][]): string[][] {
  if (rows.length < 2) return rows;
  const singles = rows.filter((row) => row.length === 1);
  if (singles.length < rows.length / 2) return rows;
  if (!singles.some((row) => looksLikeHeaderText(row[0] ?? ''))) return rows;
  return rows.map((row) => {
    if (row.length !== 1) return row;
    const text = row[0] ?? '';
    if (!/[,;\t]/.test(text)) return row;
    const inner = parseCsv(`${text}\n`, detectCsvDelimiter(`${text}\n`))[0];
    return inner && inner.length > 1 ? inner : row;
  });
}

function gymForIndex(gymCell: string, names: string[], index: number): string {
  const gyms = splitLines(gymCell);
  if (gyms.length === names.length) return gyms[index] ?? '';
  if (gyms.length === 1) return gyms[0];
  return index === 0 ? gymCell.trim() : '';
}

function peopleFromCells(
  nameCell: string,
  beltCell: string,
  gymCell: string,
  lastPromotion: string,
  note: string,
): Array<{ name: string; belt: string; gym: string; lastPromotion: string; note: string }> {
  const names = splitLines(nameCell);
  const belts = splitLines(beltCell);
  if (!names.length) return [];
  const beltFor = (index: number) =>
    belts.length === names.length ? belts[index] : (belts[0] ?? beltCell.trim());
  return names.map((name, index) => ({
    name,
    belt: beltFor(index),
    gym: gymForIndex(gymCell, names, index),
    lastPromotion,
    note,
  }));
}

export function formatRosterCsvSummary(imported: number, skipped: number, skippedDetail?: string): string {
  const base = `${imported} imported, ${skipped} skipped`;
  return skippedDetail ? `${base} (${skippedDetail})` : base;
}

export function isSpreadsheetWorkbook(file: { name?: string; type?: string }): boolean {
  const name = (file.name ?? '').toLowerCase();
  const type = (file.type ?? '').toLowerCase();
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xlsm') ||
    name.endsWith('.xls') ||
    name.endsWith('.ods') ||
    type.includes('spreadsheetml') ||
    type.includes('ms-excel') ||
    type.includes('opendocument.spreadsheet')
  );
}

export function looksLikeWorkbookText(text: string): boolean {
  if (
    text.startsWith('PK\u0003\u0004') ||
    text.startsWith('PK\u0005\u0006') ||
    text.startsWith('PK\u0007\u0008')
  ) {
    return true;
  }
  const head = text.slice(0, 256);
  if (head.includes('[Content_Types].xml') || head.includes('xl/workbook')) return true;
  return head.charCodeAt(0) === 0xd0 && head.charCodeAt(1) === 0xcf;
}

function chunkLooksLikeRosterCsv(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || !/[,;\t]/.test(trimmed)) return false;
  const lines = trimmed.split(/\r\n|\n|\r/).filter((line) => line.trim());
  if (lines.length < 1) return false;
  return lines.some((line) => countUnquoted(line, ',') >= 1 || countUnquoted(line, ';') >= 1 || countUnquoted(line, '\t') >= 1);
}

type ImportOptions = { salvage?: boolean };

function importParsedRows(rows: string[][], options: ImportOptions): RosterCsvImport {
  const expanded = expandEmbeddedSingleColumn(rows);
  if (!expanded.length) {
    return { students: [], imported: 0, skipped: 0, error: 'Need a Name and Belt column.' };
  }
  const header = findHeaderRow(expanded);
  if (!header) {
    return { students: [], imported: 0, skipped: 0, error: 'Need a Name and Belt column.' };
  }
  const { columns } = header;
  const start = header.index + 1;

  const students: Student[] = [];
  const skippedReasons: string[] = [];
  let skipped = 0;

  const pushStudent = (input: {
    name: string;
    belt: string;
    gym: string;
    lastPromotion: string;
    note: string;
  }) => {
    const next = studentFromInput(input);
    if (next) {
      students.push(next);
      return true;
    }
    skipped += 1;
    const label = input.name.trim() || 'row';
    skippedReasons.push(input.name.trim() ? `${label}: no belt` : 'missing name');
    return false;
  };

  const salvageChunk = (text: string): Student[] => {
    if (!options.salvage || !chunkLooksLikeRosterCsv(text)) return [];
    const nested = importRosterCsvInternal(text, { salvage: false });
    if (nested.imported) return nested.students;
    const headed = importRosterCsvInternal(`${ROSTER_CSV_HEADERS.join(',')}\r\n${text}`, { salvage: false });
    return headed.imported ? headed.students : [];
  };

  for (const row of expanded.slice(start)) {
    if (isSkippableRow(row)) continue;

    const nameCell = combineName(row, columns);
    const beltCell = cell(row, columns.belt);
    const gymCell = cell(row, columns.gym);
    const lastPromotion = parseImportDate(cell(row, columns.lastPromotion));
    let note = cell(row, columns.note);

    if (options.salvage && !studentFromInput({ name: splitLines(nameCell)[0] ?? '', belt: splitLines(beltCell)[0] ?? '' })) {
      const fat = [nameCell, beltCell, note].find((value) => splitLines(value).length > 1 && /[,;\t]/.test(value));
      if (fat) {
        const recovered = salvageChunk(fat);
        if (recovered.length) {
          students.push(...recovered);
          continue;
        }
      }
    }

    if (options.salvage && /[\r\n]/.test(note) && /[,;\t]/.test(note)) {
      const lines = splitLines(note);
      for (let index = 1; index < lines.length; index += 1) {
        const chunk = lines.slice(index).join('\n');
        const recovered = salvageChunk(chunk);
        if (recovered.length) {
          note = lines.slice(0, index).join('\n');
          students.push(...recovered);
          break;
        }
      }
    }

    const people = peopleFromCells(nameCell, beltCell, gymCell, lastPromotion, note);
    if (!people.length) {
      skipped += 1;
      skippedReasons.push('missing name');
      continue;
    }
    for (const person of people) pushStudent(person);
  }

  const skippedDetail = skippedReasons.length
    ? skippedReasons.slice(0, 4).join('; ') + (skippedReasons.length > 4 ? '…' : '')
    : undefined;
  return { students, imported: students.length, skipped, skippedDetail };
}

function importRosterCsvInternal(text: string, options: ImportOptions): RosterCsvImport {
  if (looksLikeWorkbookText(text)) {
    return { students: [], imported: 0, skipped: 0, error: ROSTER_CSV_WORKBOOK_ERROR };
  }
  const delimiter = detectCsvDelimiter(text);
  return importParsedRows(parseCsv(text, delimiter), options);
}

export function importRosterCsv(text: string): RosterCsvImport {
  return importRosterCsvInternal(text, { salvage: true });
}

export function importRosterCsvBytes(bytes: Uint8Array): RosterCsvImport {
  if (looksLikeWorkbookBytes(bytes)) {
    return { students: [], imported: 0, skipped: 0, error: ROSTER_CSV_WORKBOOK_ERROR };
  }
  return importRosterCsv(decodeRosterCsvBytes(bytes));
}

export async function importRosterCsvFile(file: {
  name?: string;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<RosterCsvImport> {
  if (isSpreadsheetWorkbook(file)) {
    return { students: [], imported: 0, skipped: 0, error: ROSTER_CSV_WORKBOOK_ERROR };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return importRosterCsvBytes(bytes);
}
