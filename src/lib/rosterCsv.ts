/** Roster CSV. Browser file in/out only — UTF-8 for Excel / Sheets / Numbers. */

import { studentFromInput, type Student } from './rosterStore.ts';

export const ROSTER_CSV_HEADERS = ['Name', 'Belt', 'Last promotion', 'Notes'] as const;
export const ROSTER_CSV_EXAMPLE = {
  name: 'Alex Rivera',
  belt: 'Purple',
  lastPromotion: '2026-03-12',
  note: 'Example - delete this row',
} as const;

export type RosterCsvRow = Pick<Student, 'name' | 'belt' | 'lastPromotion' | 'note'>;

export type RosterCsvImport = {
  students: Student[];
  imported: number;
  skipped: number;
  error?: string;
};

const HEADER_FIELDS = ['name', 'belt', 'lastPromotion', 'note'] as const;
type HeaderField = (typeof HEADER_FIELDS)[number];

const HEADER_ALIASES: Record<string, HeaderField> = {
  name: 'name',
  student: 'name',
  'student name': 'name',
  'full name': 'name',
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

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
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
    if (char === ',') {
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
  return serializeRosterCsv([
    {
      name: ROSTER_CSV_EXAMPLE.name,
      belt: ROSTER_CSV_EXAMPLE.belt,
      lastPromotion: ROSTER_CSV_EXAMPLE.lastPromotion,
      note: ROSTER_CSV_EXAMPLE.note,
    },
  ]);
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

export function formatRosterCsvSummary(imported: number, skipped: number): string {
  return `${imported} imported, ${skipped} skipped`;
}

export function importRosterCsv(text: string): RosterCsvImport {
  const rows = parseCsv(text);
  if (!rows.length) {
    return { students: [], imported: 0, skipped: 0, error: 'Need a Name and Belt column.' };
  }
  const columns = mapHeaders(rows[0]);
  if (columns.name == null || columns.belt == null) {
    return { students: [], imported: 0, skipped: 0, error: 'Need a Name and Belt column.' };
  }

  const students: Student[] = [];
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const name = row[columns.name] ?? '';
    const belt = row[columns.belt] ?? '';
    const lastPromotion = parseImportDate(row[columns.lastPromotion ?? -1] ?? '');
    const note = row[columns.note ?? -1] ?? '';
    const next = studentFromInput({ name, belt, lastPromotion, note });
    if (next) students.push(next);
    else skipped += 1;
  }
  return { students, imported: students.length, skipped };
}
