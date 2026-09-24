/** Class Schedule CSV. Browser file in/out — UTF-8 (BOM), Excel CRLF. */

import {
  isScheduleTemplate,
  normalizeGymCalendar,
  WEEKDAY_LABELS,
  type ScheduleTemplate,
  type SpecialDate,
  type Weekday,
  type WeeklyClassSlot,
  type GymCalendarState,
} from './gymCalendar.ts';
import type { ScheduleImportPayload } from './scheduleStore.ts';
import {
  csvField,
  decodeRosterCsvBytes,
  detectCsvDelimiter,
  isSpreadsheetWorkbook,
  looksLikeWorkbookBytes,
  looksLikeWorkbookText,
  parseCsv,
  ROSTER_CSV_SEP_LINE,
  ROSTER_CSV_WORKBOOK_ERROR,
} from './rosterCsv.ts';

export const SCHEDULE_CSV_HEADERS = [
  'Record',
  'Day',
  'Time',
  'Class name',
  'Mat',
  'Detail',
  'Date',
  'Title',
  'Body',
  'Board title',
  'QR link',
  'Notices',
  'Template',
  'Play on TV',
  'Id',
  'Flyer id',
] as const;

export const SCHEDULE_CSV_SAVE_HINT =
  'Save as CSV UTF-8 (comma-separated), not an Excel workbook (.xlsx).';

export const SCHEDULE_CSV_GUIDE =
  `# ${SCHEDULE_CSV_SAVE_HINT} Import replaces the schedule on this device after you confirm. It does not merge. Save a backup before you clear site data or reset the app. Time is 24-hour HH:MM (17:00) or 5:00 PM. Day is Monday or Mon.`;

const TEMPLATE_ALIASES: Record<string, ScheduleTemplate> = {
  week: 'week',
  'weekly list': 'weekly-list',
  'weekly-list': 'weekly-list',
  list: 'weekly-list',
  'week grid': 'week-grid',
  'week-grid': 'week-grid',
  grid: 'week-grid',
  monthly: 'monthly',
  month: 'monthly',
};

const DAY_ALIASES: Record<string, Weekday> = {
  mon: 'mon',
  monday: 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  wed: 'wed',
  wednesday: 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  fri: 'fri',
  friday: 'fri',
  sat: 'sat',
  saturday: 'sat',
  sun: 'sun',
  sunday: 'sun',
};

type Field =
  | 'record'
  | 'day'
  | 'time'
  | 'className'
  | 'mat'
  | 'detail'
  | 'date'
  | 'title'
  | 'body'
  | 'boardTitle'
  | 'qr'
  | 'notices'
  | 'template'
  | 'cast'
  | 'id'
  | 'flyerId';

const HEADER_ALIASES: Record<string, Field> = {
  record: 'record',
  type: 'record',
  kind: 'record',
  day: 'day',
  weekday: 'day',
  time: 'time',
  start: 'time',
  'start time': 'time',
  'class name': 'className',
  class: 'className',
  classname: 'className',
  'class title': 'className',
  mat: 'mat',
  location: 'mat',
  room: 'mat',
  detail: 'detail',
  subtitle: 'detail',
  details: 'detail',
  date: 'date',
  'notice title': 'title',
  title: 'title',
  body: 'body',
  'notice detail': 'body',
  'board title': 'boardTitle',
  'gym name': 'boardTitle',
  gym: 'boardTitle',
  'qr link': 'qr',
  qr: 'qr',
  'qr url': 'qr',
  url: 'qr',
  notices: 'notices',
  notes: 'notices',
  notice: 'notices',
  template: 'template',
  layout: 'template',
  'play on tv': 'cast',
  cast: 'cast',
  'on tv': 'cast',
  id: 'id',
  'flyer id': 'flyerId',
  flyer: 'flyerId',
};

export type ScheduleCsvMode = 'replace-board' | 'replace-classes';

export type ScheduleCsvImport = {
  payload: ScheduleImportPayload | null;
  classCount: number;
  specialCount: number;
  skipped: number;
  mode: ScheduleCsvMode;
  error?: string;
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function parseScheduleDay(value: string): Weekday | null {
  const key = value.trim().toLowerCase().replace(/\./g, '');
  return DAY_ALIASES[key] ?? null;
}

/** 17:00, 17:00:00, 5:00 PM, and 5 PM → HH:MM. Blank when it is not a clock time. */
export function parseScheduleClock(value: string): string {
  const trimmed = value.trim();
  const h24 = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (h24) {
    const hours = Number(h24[1]);
    const minutes = Number(h24[2]);
    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    return '';
  }
  const h12 = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?$/i);
  if (!h12) return '';
  let hours = Number(h12[1]);
  const minutes = Number(h12[2] ?? '0');
  const suffix = h12[3].toLowerCase();
  if (hours < 1 || hours > 12 || minutes > 59) return '';
  if (suffix === 'a' && hours === 12) hours = 0;
  if (suffix === 'p' && hours !== 12) hours += 12;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTemplate(value: string): ScheduleTemplate | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (isScheduleTemplate(key)) return key;
  return TEMPLATE_ALIASES[key] ?? null;
}

function parseCast(value: string): boolean | null {
  const key = value.trim().toLowerCase();
  if (!key) return null;
  if (['yes', 'true', 'on', '1', 'y'].includes(key)) return true;
  if (['no', 'false', 'off', '0', 'n'].includes(key)) return false;
  return null;
}

function mapHeaders(headerRow: string[]): Partial<Record<Field, number>> {
  const map: Partial<Record<Field, number>> = {};
  headerRow.forEach((cellValue, index) => {
    const field = HEADER_ALIASES[normalizeHeader(cellValue)];
    if (field && map[field] == null) map[field] = index;
  });
  if (map.className == null && map.title != null && map.record == null) {
    map.className = map.title;
    delete map.title;
  }
  return map;
}

function cell(row: string[], index: number | undefined): string {
  if (index == null || index < 0) return '';
  return row[index] ?? '';
}

function isSkippableRow(row: string[]): boolean {
  const first = row[0]?.trim() ?? '';
  return first.startsWith('#') || /^sep=/i.test(first);
}

function findHeader(rows: string[][]): { index: number; columns: Partial<Record<Field, number>> } | null {
  for (let index = 0; index < rows.length; index += 1) {
    if (isSkippableRow(rows[index])) continue;
    const columns = mapHeaders(rows[index]);
    const classSheet = columns.day != null && (columns.className != null || columns.time != null);
    const fullSheet = columns.record != null && classSheet;
    if (fullSheet || classSheet) return { index, columns };
  }
  return null;
}

function recordKind(value: string): 'board' | 'special' | 'class' {
  const key = value.trim().toLowerCase();
  if (['board', 'meta', 'schedule', 'header'].includes(key)) return 'board';
  if (['special', 'notice', 'event', 'date'].includes(key)) return 'special';
  return 'class';
}

function line(cells: string[]): string {
  return cells.map(csvField).join(',');
}

export function serializeScheduleCsv(state: GymCalendarState): string {
  const board = [
    'board',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    state.title,
    state.qrUrl,
    state.notes,
    state.template,
    state.castEnabled ? 'yes' : 'no',
    '',
    '',
  ];
  const classes = state.classes.map((row) => [
    'class',
    WEEKDAY_LABELS[row.day],
    row.time,
    row.title,
    row.location,
    row.subtitle,
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    row.id,
    '',
  ]);
  const specials = state.specials.map((row) => [
    'special',
    '',
    '',
    '',
    '',
    '',
    row.date,
    row.title,
    row.body,
    '',
    '',
    '',
    '',
    '',
    row.id,
    row.flyerId ?? '',
  ]);
  const lines = [SCHEDULE_CSV_HEADERS.join(','), line(board), ...classes.map(line), ...specials.map(line)];
  return `${lines.join('\r\n')}\r\n`;
}

export function scheduleCsvTemplate(): string {
  const sample: GymCalendarState = {
    version: 1,
    title: 'Sample Academy',
    qrUrl: 'https://example.com/class-schedule',
    notes: 'Example notice — delete this row.',
    template: 'week',
    castEnabled: true,
    classes: [
      {
        id: '',
        kind: 'class',
        day: 'mon',
        time: '17:00',
        title: 'Fundamentals',
        location: 'MAT 1',
        subtitle: 'Example — delete this row',
      },
    ],
    specials: [
      {
        id: '',
        kind: 'special',
        date: '2026-12-24',
        title: 'Closed',
        body: 'Example — delete this row',
        flyerId: null,
      },
    ],
  };
  return `${ROSTER_CSV_SEP_LINE}\r\n${csvField(SCHEDULE_CSV_GUIDE)}\r\n${serializeScheduleCsv(sample)}`;
}

function emptyImport(error: string): ScheduleCsvImport {
  return {
    payload: null,
    classCount: 0,
    specialCount: 0,
    skipped: 0,
    mode: 'replace-classes',
    error,
  };
}

export function importScheduleCsv(text: string): ScheduleCsvImport {
  if (looksLikeWorkbookText(text)) return emptyImport(ROSTER_CSV_WORKBOOK_ERROR);
  const rows = parseCsv(text, detectCsvDelimiter(text));
  const header = findHeader(rows);
  if (!header) return emptyImport('Need a Day and Class name column.');
  const { columns } = header;
  const fullBoard = columns.record != null;
  const classRows: Array<Omit<WeeklyClassSlot, 'kind'> & { kind?: 'class' }> = [];
  const specialRows: SpecialDate[] = [];
  let skipped = 0;
  let board: {
    title: string | null;
    qrUrl: string | null;
    notes: string | null;
    template: ScheduleTemplate | null;
    castEnabled: boolean | null;
  } | null = null;

  for (const row of rows.slice(header.index + 1)) {
    if (isSkippableRow(row)) continue;
    const kind = fullBoard ? recordKind(cell(row, columns.record)) : 'class';
    if (kind === 'board') {
      const title = cell(row, columns.boardTitle);
      const qrUrl = cell(row, columns.qr);
      const notes = cell(row, columns.notices);
      board = {
        title: columns.boardTitle == null ? null : title,
        qrUrl: columns.qr == null ? null : qrUrl,
        notes: columns.notices == null ? null : notes,
        template: parseTemplate(cell(row, columns.template)),
        castEnabled: parseCast(cell(row, columns.cast)),
      };
      continue;
    }
    if (kind === 'special') {
      specialRows.push({
        id: cell(row, columns.id).trim(),
        kind: 'special',
        date: cell(row, columns.date).trim(),
        title: cell(row, columns.title).trim(),
        body: cell(row, columns.body).trim(),
        flyerId: cell(row, columns.flyerId).trim() || null,
      });
      continue;
    }
    const day = parseScheduleDay(cell(row, columns.day));
    const time = parseScheduleClock(cell(row, columns.time)) || cell(row, columns.time).trim();
    const title = cell(row, columns.className).trim();
    if (!day || (!title && !time)) {
      skipped += 1;
      continue;
    }
    classRows.push({
      id: cell(row, columns.id).trim(),
      day,
      time,
      title,
      location: cell(row, columns.mat).trim(),
      subtitle: cell(row, columns.detail).trim(),
    });
  }

  const normalizedClasses = normalizeGymCalendar({
    classes: classRows.map((row) => ({ ...row, kind: 'class' })),
  }).classes;
  const normalizedSpecials = normalizeGymCalendar({ specials: specialRows }).specials;
  skipped += classRows.length - normalizedClasses.length;
  skipped += specialRows.length - normalizedSpecials.length;

  if (!fullBoard && normalizedClasses.length === 0) {
    return emptyImport('No classes to import. Check the Day, Time, and Class name columns.');
  }
  if (fullBoard && !board && normalizedClasses.length === 0 && normalizedSpecials.length === 0) {
    return emptyImport('No classes to import. Check the Day, Time, and Class name columns.');
  }

  const payload: ScheduleImportPayload = fullBoard
    ? {
        classes: normalizedClasses,
        specials: normalizedSpecials,
        title: board?.title ?? null,
        qrUrl: board?.qrUrl ?? null,
        notes: board?.notes ?? null,
        template: board?.template ?? null,
        castEnabled: board?.castEnabled ?? null,
      }
    : {
        classes: normalizedClasses,
        specials: null,
        title: null,
        qrUrl: null,
        notes: null,
        template: null,
        castEnabled: null,
      };

  return {
    payload,
    classCount: normalizedClasses.length,
    specialCount: fullBoard ? normalizedSpecials.length : 0,
    skipped,
    mode: fullBoard ? 'replace-board' : 'replace-classes',
  };
}

export function importScheduleCsvBytes(bytes: Uint8Array): ScheduleCsvImport {
  if (looksLikeWorkbookBytes(bytes)) return emptyImport(ROSTER_CSV_WORKBOOK_ERROR);
  return importScheduleCsv(decodeRosterCsvBytes(bytes));
}

export async function importScheduleCsvFile(file: {
  name?: string;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ScheduleCsvImport> {
  if (isSpreadsheetWorkbook(file)) return emptyImport(ROSTER_CSV_WORKBOOK_ERROR);
  const bytes = new Uint8Array(await file.arrayBuffer());
  return importScheduleCsvBytes(bytes);
}

export function formatScheduleCsvSummary(result: ScheduleCsvImport): string {
  if (result.error) return result.error;
  const classes = `${result.classCount} ${result.classCount === 1 ? 'class' : 'classes'}`;
  const skipped = result.skipped ? ` ${result.skipped} skipped.` : '';
  if (result.mode === 'replace-classes') {
    return `Replaced weekly classes (${classes}). Gym name, QR, and notices stayed.${skipped}`;
  }
  const specials = `${result.specialCount} special ${result.specialCount === 1 ? 'date' : 'dates'}`;
  return `Replaced the schedule (${classes}, ${specials}).${skipped}`;
}

export function scheduleCsvFileName(kind: 'backup' | 'template'): string {
  return kind === 'template' ? 'advantage-class-schedule-template.csv' : 'advantage-class-schedule.csv';
}
