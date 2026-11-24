/**
 * Class Schedule JSON backup. Every field the editor saves, belt levels
 * included, in one file that Import reads back exactly. The CSV is for
 * spreadsheets; this file is the full-fidelity copy.
 */
import {
  CLASS_LEVEL_META,
  CLASS_LEVEL_ORDER,
  classLevelCounts,
  normalizeGymCalendar,
  type GymCalendarState,
  type WeeklyClassSlot,
} from './gymCalendar.ts';
import type { ScheduleCsvImport } from './scheduleCsv.ts';

export const SCHEDULE_JSON_FORMAT = 'advantage-class-schedule';
export const SCHEDULE_JSON_VERSION = 1;
/** Far above a real gym week; stops a wrong file from freezing the editor. */
export const SCHEDULE_JSON_MAX_CHARS = 1_000_000;
export const SCHEDULE_JSON_MAX_CLASSES = 400;
export const SCHEDULE_JSON_MAX_SPECIALS = 400;

export type ScheduleJsonFile = {
  format: typeof SCHEDULE_JSON_FORMAT;
  version: typeof SCHEDULE_JSON_VERSION;
  exportedAt: string;
  schedule: {
    title: string;
    qrUrl: string;
    notes: string;
    template: GymCalendarState['template'];
    castEnabled: boolean;
    classes: Array<Omit<WeeklyClassSlot, 'level'> & { level: NonNullable<WeeklyClassSlot['level']> }>;
    specials: GymCalendarState['specials'];
  };
};

export function serializeScheduleJson(state: GymCalendarState, now = new Date()): string {
  const clean = normalizeGymCalendar(state);
  const file: ScheduleJsonFile = {
    format: SCHEDULE_JSON_FORMAT,
    version: SCHEDULE_JSON_VERSION,
    exportedAt: now.toISOString(),
    schedule: {
      title: clean.title,
      qrUrl: clean.qrUrl,
      notes: clean.notes,
      template: clean.template,
      castEnabled: clean.castEnabled,
      classes: clean.classes.map((row) => ({ ...row, level: row.level ?? 'none' })),
      specials: clean.specials,
    },
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function scheduleJsonFileName(): string {
  return 'advantage-class-schedule.json';
}

function failed(error: string): ScheduleCsvImport {
  return { payload: null, classCount: 0, specialCount: 0, skipped: 0, mode: 'replace-board', error };
}

/** True when the picked file should go through the JSON reader instead of CSV. */
export function looksLikeScheduleJson(file: { name?: string; type?: string }, text?: string): boolean {
  if (/\.json$/i.test(file.name ?? '')) return true;
  if ((file.type ?? '').includes('json')) return true;
  return typeof text === 'string' && /^\s*[{[]/.test(text.replace(/^\uFEFF/, ''));
}

/**
 * Reads an Advantage schedule JSON (or a raw saved board). Nothing is applied
 * here; the editor shows a preview and replaces the board only after Confirm.
 */
export function importScheduleJson(text: string): ScheduleCsvImport {
  const body = text.replace(/^\uFEFF/, '');
  if (body.length > SCHEDULE_JSON_MAX_CHARS) return failed('That file is too large to be a class schedule.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return failed('That file is not valid JSON. Use a file from Export JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return failed('That file is not an Advantage class schedule.');
  }
  const top = parsed as Record<string, unknown>;
  if (typeof top.format === 'string' && top.format !== SCHEDULE_JSON_FORMAT) {
    return failed('That file is not an Advantage class schedule.');
  }
  if (typeof top.version === 'number' && top.version > SCHEDULE_JSON_VERSION) {
    return failed('That schedule file is from a newer version of Advantage. Refresh the app, then try again.');
  }
  const raw = (top.format === SCHEDULE_JSON_FORMAT ? top.schedule : top) as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.classes)) {
    return failed('That file has no class list. Use a file from Export JSON.');
  }
  const rawClasses = raw.classes as unknown[];
  const rawSpecials = Array.isArray(raw.specials) ? (raw.specials as unknown[]) : [];
  if (rawClasses.length > SCHEDULE_JSON_MAX_CLASSES || rawSpecials.length > SCHEDULE_JSON_MAX_SPECIALS) {
    return failed('That file has more classes than a schedule can hold.');
  }
  const clean = normalizeGymCalendar(raw);
  if (!clean.classes.length && !clean.specials.length) {
    return failed('No classes or special dates were found in that file.');
  }
  const skipped = rawClasses.length - clean.classes.length + (rawSpecials.length - clean.specials.length);
  return {
    payload: {
      classes: clean.classes,
      specials: clean.specials,
      title: typeof raw.title === 'string' ? clean.title : null,
      qrUrl: typeof raw.qrUrl === 'string' ? clean.qrUrl : null,
      notes: typeof raw.notes === 'string' ? clean.notes : null,
      template: raw.template === undefined ? null : clean.template,
      castEnabled: typeof raw.castEnabled === 'boolean' ? clean.castEnabled : null,
    },
    classCount: clean.classes.length,
    specialCount: clean.specials.length,
    skipped: Math.max(0, skipped),
    mode: 'replace-board',
  };
}

function levelName(id: (typeof CLASS_LEVEL_ORDER)[number]): string {
  if (id === 'kids') return 'Kids All Levels';
  if (id === 'kids-advanced') return CLASS_LEVEL_META[id].short;
  return CLASS_LEVEL_META[id].label;
}

/** "Levels: 3 Fundamentals, 2 Advanced, 1 No level" for the import preview. */
export function describeClassLevels(classes: readonly Pick<WeeklyClassSlot, 'level'>[]): string {
  if (!classes.length) return '';
  const counts = classLevelCounts(classes);
  const parts = CLASS_LEVEL_ORDER.filter((id) => counts[id] > 0).map(
    (id) => `${counts[id]} ${levelName(id)}`,
  );
  return `Levels: ${parts.join(', ')}.`;
}
