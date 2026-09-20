/** Roster CSV. Browser file in/out only — UTF-8 for Excel / Sheets / Numbers. */

import { studentFromInput, type Student } from './rosterStore.ts';

export const ROSTER_CSV_HEADERS = ['Name', 'Belt', 'Last promotion', 'Notes'] as const;
export const ROSTER_CSV_BELT_GUIDE =
  '# Belts (required on every row): White, Blue, Purple, Brown, Black, Coral; kids Grey, Yellow, Orange, Green. Also accepted: black, Black, blackbelt, black belt, Black Belt, BB, white belt, bluebelt, and the same color + belt spellings for each rank.';
export const ROSTER_CSV_EXAMPLE = {
  name: 'Alex Rivera',
  belt: 'Purple',
  lastPromotion: '2026-03-12',
  note: 'Example - delete this row. Belts: white / blue / purple / brown / black (blackbelt, black belt, BB) / coral; kids grey yellow orange green.',
} as const;

export type RosterCsvRow = Pick<Student, 'name' | 'belt' | 'lastPromotion' | 'note'>;

export type RosterCsvImport = {
  students: Student[];
  imported: number;
  skipped: number;
  error?: string;
};

type HeaderField = 'name' | 'firstName' | 'lastName' | 'belt' | 'lastPromotion' | 'note';

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

function normalizeCsvText(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\u0000/g, '');
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
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

export function detectCsvDelimiter(text: string): string {
  const lines = firstContentLines(text);
  for (const line of lines) {
    const sep = line.match(/^sep=(.)$/i);
    if (sep) return sep[1];
  }
  const header = lines.find((line) => !line.startsWith('#') && !/^sep=/i.test(line)) ?? '';
  let best: string = ',';
  let bestCount = 0;
  for (const delimiter of DELIMITERS) {
    const count = countUnquoted(header, delimiter);
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
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
    if (row.some((cell) => cell.trim())) rows.push(row);
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
      [row.name, row.belt, row.lastPromotion, row.note].map(csvField).join(','),
    ),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export function rosterCsvTemplate(): string {
  return `${ROSTER_CSV_BELT_GUIDE}\r\n${serializeRosterCsv([
    {
      name: ROSTER_CSV_EXAMPLE.name,
      belt: ROSTER_CSV_EXAMPLE.belt,
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
  headerRow.forEach((cell, index) => {
    const field = HEADER_ALIASES[normalizeHeader(cell)];
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

function splitNames(name: string): string[] {
  const parts = name
    .split(/\r\n|\n|\r/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts;
}

function findHeaderRow(rows: string[][]): { index: number; columns: Partial<Record<HeaderField, number>> } | null {
  for (let index = 0; index < rows.length; index += 1) {
    if (isSkippableRow(rows[index])) continue;
    const columns = mapHeaders(rows[index]);
    if (hasRequiredColumns(columns)) return { index, columns };
  }
  return null;
}

export function formatRosterCsvSummary(imported: number, skipped: number): string {
  return `${imported} imported, ${skipped} skipped`;
}

export function importRosterCsv(text: string): RosterCsvImport {
  const rows = parseCsv(text, detectCsvDelimiter(text));
  if (!rows.length) {
    return { students: [], imported: 0, skipped: 0, error: 'Need a Name and Belt column.' };
  }
  const header = findHeaderRow(rows);
  if (!header) {
    return { students: [], imported: 0, skipped: 0, error: 'Need a Name and Belt column.' };
  }

  const students: Student[] = [];
  let skipped = 0;
  for (const row of rows.slice(header.index + 1)) {
    if (isSkippableRow(row)) continue;
    const names = splitNames(combineName(row, header.columns));
    const belt = cell(row, header.columns.belt);
    const lastPromotion = parseImportDate(cell(row, header.columns.lastPromotion));
    const note = cell(row, header.columns.note);
    if (!names.length) {
      skipped += 1;
      continue;
    }
    let added = 0;
    for (const name of names) {
      const next = studentFromInput({ name, belt, lastPromotion, note });
      if (next) {
        students.push(next);
        added += 1;
      }
    }
    if (!added) skipped += 1;
  }
  return { students, imported: students.length, skipped };
}
