/**
 * Kids belt ladder stored beside the adult rank.
 * Adult stripes, degrees, and profile.belt are never written here.
 * The file uses tape counts. It does not use a stripe, stripes, or levelKey field.
 */

import {
  ADULT_IBJJF_TEMPLATE_ID,
  IBJJF_KIDS_TEMPLATE,
  KIDS_IBJJF_TEMPLATE_ID,
  templateFromRecord,
  type BeltTemplate,
} from './beltTemplates.ts';
import {
  BELT_CENTERS,
  BELT_TAPE_SLOT_MAX,
  BELT_TEMPLATE_BELTS_MAX,
  BELT_TEMPLATE_MAX,
  CLASSES_PER_TAPE_MAX,
  DEFAULT_CLASSES_PER_TAPE,
  PROGRESS_ID_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_RANK_HISTORY_MAX,
  type BeltBook,
  type BeltCenter,
  type BeltSystemMode,
  type BeltTemplateDef,
  type BeltTemplateRecord,
  type KidsBeltHistory,
  type KidsBeltRank,
  type StudentProgressReport,
  type TapeGuide,
} from './progress/types.ts';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const TEMPLATE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._@-]{0,79}$/;
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

export type KidsRung = {
  beltId: string;
  label: string;
  base: string;
  center: BeltCenter;
  centerColor: string;
  ink: 'navy' | 'white';
  tapeColors: string[];
  ageMin?: number;
  ageMax?: number;
  current: boolean;
  awardedOn: string;
  tapeCount: number;
  tapeDates: string[];
  historyId: string;
};

export function beltModeOf(report: StudentProgressReport): BeltSystemMode {
  return report.beltBook?.mode === 'kids' ? 'kids' : 'adult';
}

export function classesPerTapeOf(report: StudentProgressReport): number {
  const value = report.beltBook?.classesPerTape;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) return DEFAULT_CLASSES_PER_TAPE;
  return Math.min(CLASSES_PER_TAPE_MAX, value);
}

export function guideOf(report: StudentProgressReport): TapeGuide {
  return report.beltBook?.guide === 'time' ? 'time' : 'classes';
}

/** IBJJF age is the calendar year minus the birth year. */
export function ibjjfAge(birthYear: number, today = new Date()): number {
  return today.getFullYear() - birthYear;
}

/**
 * Soft note for the belt the student wears. Empty when the belt has no age advice.
 * A birth year adds the student's age. It never blocks the belt.
 */
export function ageWarning(belt: Pick<BeltTemplateDef, 'ageMin' | 'ageMax'>, birthYear?: number, today = new Date()): string {
  if (belt.ageMin == null) return '';
  const base = `IBJJF suggests this belt from age ${belt.ageMin}.`;
  if (birthYear == null || !Number.isInteger(birthYear)) return base;
  const age = ibjjfAge(birthYear, today);
  if (age < 0 || age > 120) return base;
  if (age < belt.ageMin || (belt.ageMax != null && age > belt.ageMax)) return `${base} This reads as age ${age}.`;
  return base;
}

/** Gentle prompt only. The student stays on kids belts until they switch. */
export function showAdultPrompt(report: StudentProgressReport, today = new Date()): boolean {
  if (beltModeOf(report) !== 'kids') return false;
  const year = report.beltBook?.birthYear;
  if (year == null) return false;
  return ibjjfAge(year, today) >= 16;
}

export function kidsTemplateOf(report: StudentProgressReport): BeltTemplate {
  const id = report.beltBook?.templateId;
  if (id && id !== ADULT_IBJJF_TEMPLATE_ID && id !== KIDS_IBJJF_TEMPLATE_ID) {
    const custom = report.beltBook?.templates?.find((item) => item.id === id);
    if (custom && custom.belts.length) return templateFromRecord(custom);
  }
  return IBJJF_KIDS_TEMPLATE;
}

export function kidsRankOf(report: StudentProgressReport): KidsBeltRank {
  return normalizeKids(report.beltBook?.kids, kidsTemplateOf(report));
}

/**
 * Letters sit on the belt cloth, clear of the center band.
 * Light cloth (white, grey, yellow) is navy. Darker cloth (orange, green) is white.
 */
export function labelInk(belt: Pick<BeltTemplateDef, 'ink'>): 'navy' | 'white' {
  return belt.ink;
}

export type TapeRun = { color: string; count: number; start: number };

/** Consecutive tape colors. The stored list stays the source of truth. */
export function tapeRuns(colors: string[]): TapeRun[] {
  const runs: TapeRun[] = [];
  for (let index = 0; index < colors.length; index += 1) {
    const color = colors[index] ?? '';
    const last = runs[runs.length - 1];
    if (last && last.color === color) last.count += 1;
    else runs.push({ color, count: 1, start: index });
  }
  return runs;
}

/** How many stripe buttons to draw. The widest color run, so 11 tapes fit on one row. */
export function compactSlotCount(colors: string[]): number {
  const runs = tapeRuns(colors);
  if (!runs.length) return 0;
  return Math.max(...runs.map((run) => run.count));
}

export type CompactSlot = { slot: number; on: boolean; color: string };

/**
 * Paint the compact row from the tape count.
 * Whites fill first. Later runs repaint those same slots red, then black.
 */
export function compactSlots(colors: string[], tapeCount: number): CompactSlot[] {
  const runs = tapeRuns(colors);
  const width = compactSlotCount(colors);
  const slots: CompactSlot[] = Array.from({ length: width }, (_, index) => ({ slot: index + 1, on: false, color: '' }));
  const count = Math.max(0, Math.min(Number.isInteger(tapeCount) ? tapeCount : 0, colors.length));
  let consumed = 0;
  for (const run of runs) {
    if (count <= consumed) break;
    const earned = Math.min(run.count, count - consumed);
    for (let index = 0; index < earned && index < width; index += 1) {
      slots[index] = { slot: index + 1, on: true, color: run.color };
    }
    consumed += run.count;
  }
  return slots;
}

/**
 * Tap a compact slot. Inside a color, this matches adult stripes.
 * On a full color, tap the last slot to step back, or an earlier slot to start the next color.
 */
export function tapeCountAfterTap(colors: string[], tapeCount: number, slot: number): number {
  const runs = tapeRuns(colors);
  const total = colors.length;
  const count = Math.max(0, Math.min(Number.isInteger(tapeCount) ? tapeCount : 0, total));
  if (!runs.length || !Number.isInteger(slot) || slot < 1) return count;
  const phase = count === 0 ? 0 : runs.findIndex((run) => count > run.start && count <= run.start + run.count);
  const run = runs[phase === -1 ? runs.length - 1 : phase];
  if (!run) return count;
  const atEnd = count === run.start + run.count;
  const next = runs[(phase === -1 ? runs.length - 1 : phase) + 1];
  if (atEnd && next) {
    if (slot === Math.min(run.count, compactSlotCount(colors))) return count - 1;
    if (slot <= next.count) return next.start + slot;
    return count;
  }
  const local = count - run.start;
  if (slot === local && local > 0) return count - 1;
  if (slot <= run.count) return run.start + slot;
  return count;
}

export function kidsLadder(report: StudentProgressReport): KidsRung[] {
  const template = kidsTemplateOf(report);
  const kids = normalizeKids(report.beltBook?.kids, template);
  const known = template.belts.some((belt) => belt.id === kids.beltId);
  const history = new Map(kids.history.map((row) => [row.beltId, row]));
  const currentIndex = template.belts.findIndex((belt) => belt.id === kids.beltId);
  const rungs = template.belts.map((belt, index) => {
    // A higher belt is not the one they wear. Old stripes stay in the history list, not on that cloth.
    const past = index < currentIndex ? history.get(belt.id) : undefined;
    return rungFrom(belt, kids, past);
  });
  if (!known) rungs.unshift(savedRung(kids));
  return rungs;
}

export function currentKidsBelt(report: StudentProgressReport): KidsRung {
  const rungs = kidsLadder(report);
  return rungs.find((rung) => rung.current) ?? rungs[0];
}

/**
 * Switch the ladder My rank shows.
 * Adult stripes, degrees, photos, and profile.belt stay where they are.
 * Kids belts stay on the book when the student switches back to adult.
 */
export function setBeltMode(report: StudentProgressReport, mode: BeltSystemMode, now = Date.now()): StudentProgressReport {
  if (beltModeOf(report) === mode) return report;
  const book = cloneBook(report.beltBook);
  book.mode = mode;
  if (mode === 'kids') {
    book.templateId = book.kidsTemplateId || KIDS_IBJJF_TEMPLATE_ID;
    book.kids = normalizeKids(book.kids, templateForBook(book));
    if (book.classesPerTape == null) book.classesPerTape = DEFAULT_CLASSES_PER_TAPE;
    if (book.guide == null) book.guide = 'classes';
  } else {
    if (book.templateId && book.templateId !== ADULT_IBJJF_TEMPLATE_ID) book.kidsTemplateId = book.templateId;
    book.templateId = ADULT_IBJJF_TEMPLATE_ID;
  }
  return touch(report, book, now);
}

export function setBirthYear(report: StudentProgressReport, year: number | null, now = Date.now()): StudentProgressReport {
  if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) throw new Error('Birth year must be a whole year.');
  const book = cloneBook(report.beltBook);
  if (year == null) delete book.birthYear;
  else book.birthYear = year;
  if ((book.birthYear ?? null) === (report.beltBook?.birthYear ?? null)) return report;
  return touch(report, book, now);
}

export function setTapeGuide(report: StudentProgressReport, guide: TapeGuide, now = Date.now()): StudentProgressReport {
  if (guide !== 'classes' && guide !== 'time') throw new Error('Progress is classes or time.');
  if (guideOf(report) === guide && report.beltBook?.guide === guide) return report;
  const book = cloneBook(report.beltBook);
  book.guide = guide;
  return touch(report, book, now);
}

/** How many classes the student wants toward the next stripe. Does not change stripes already on the belt. */
export function setClassesPerTape(report: StudentProgressReport, count: number, now = Date.now()): StudentProgressReport {
  if (!Number.isInteger(count) || count < 1 || count > CLASSES_PER_TAPE_MAX) {
    throw new Error(`Classes per stripe are 1 to ${CLASSES_PER_TAPE_MAX}.`);
  }
  const book = cloneBook(report.beltBook);
  book.classesPerTape = count;
  if (book.kids) book.kids = { ...book.kids, classCount: Math.min(book.kids.classCount, count) };
  if (report.beltBook?.classesPerTape === count && (report.beltBook.kids?.classCount ?? 0) === (book.kids?.classCount ?? 0)) return report;
  return touch(report, book, now);
}

/** One class toward the next stripe. A full card does not put the stripe on the belt. */
export function addClassDot(report: StudentProgressReport, now = Date.now()): StudentProgressReport {
  const max = classesPerTapeOf(report);
  const book = cloneBook(report.beltBook);
  const kids = normalizeKids(book.kids, templateForBook(book));
  if (kids.classCount >= max) return report;
  book.kids = { ...kids, classCount: kids.classCount + 1 };
  return touch(report, book, now);
}

export function removeClassDot(report: StudentProgressReport, now = Date.now()): StudentProgressReport {
  const book = cloneBook(report.beltBook);
  const kids = normalizeKids(book.kids, templateForBook(book));
  if (kids.classCount <= 0) return report;
  book.kids = { ...kids, classCount: kids.classCount - 1 };
  return touch(report, book, now);
}

export function setKidsBelt(report: StudentProgressReport, beltId: string, now = Date.now()): StudentProgressReport {
  const book = cloneBook(report.beltBook);
  const template = templateForBook(book);
  const belt = template.belts.find((row) => row.id === beltId);
  if (!belt) throw new Error('That belt is not on this list.');
  const kids = normalizeKids(book.kids, template);
  if (kids.beltId === beltId) return report;
  let history = kids.history;
  if (kidsBeltMarked(kids)) {
    if (history.length >= PROGRESS_RANK_HISTORY_MAX) throw new Error('The promotion history is full.');
    history = [
      ...history,
      {
        id: newId(now),
        beltId: kids.beltId,
        awardedOn: kids.awardedOn,
        tapeCount: kids.tapeCount,
        tapeDates: kids.tapeDates.slice(0, kids.tapeCount),
      },
    ];
  } else {
    history = history.filter((row) => row.beltId !== kids.beltId);
  }
  book.kids = {
    beltId,
    awardedOn: '',
    tapeCount: 0,
    tapeDates: emptyDates(belt.tapeColors.length),
    history,
    classCount: 0,
  };
  return touch(report, book, now);
}

/** The student or instructor sets the stripe. Class dots do not do this. */
export function setKidsTapeCount(report: StudentProgressReport, count: number, now = Date.now()): StudentProgressReport {
  const book = cloneBook(report.beltBook);
  const template = templateForBook(book);
  const kids = normalizeKids(book.kids, template);
  const slots = slotsFor(template, kids.beltId);
  if (!Number.isInteger(count) || count < 0 || count > slots) throw new Error(`Stripes are 0 to ${slots}.`);
  if (kids.tapeCount === count) return report;
  book.kids = {
    ...kids,
    tapeCount: count,
    tapeDates: maskDates(kids.tapeDates, count, slots),
    classCount: count > kids.tapeCount ? 0 : kids.classCount,
  };
  return touch(report, book, now);
}

export function setKidsAwardedOn(report: StudentProgressReport, date: string, now = Date.now()): StudentProgressReport {
  const awardedOn = cleanDate(date);
  const book = cloneBook(report.beltBook);
  const kids = normalizeKids(book.kids, templateForBook(book));
  if (kids.awardedOn === awardedOn) return report;
  book.kids = { ...kids, awardedOn };
  return touch(report, book, now);
}

export function setKidsTapeDate(report: StudentProgressReport, index: number, date: string, now = Date.now()): StudentProgressReport {
  const book = cloneBook(report.beltBook);
  const template = templateForBook(book);
  const kids = normalizeKids(book.kids, template);
  const slots = slotsFor(template, kids.beltId);
  if (!Number.isInteger(index) || index < 0 || index >= slots) throw new Error(`Stripes are 0 to ${slots}.`);
  if (index >= kids.tapeCount) throw new Error('That stripe is not on the belt yet.');
  const awarded = cleanDate(date);
  if ((kids.tapeDates[index] ?? '') === awarded) return report;
  const tapeDates = kids.tapeDates.slice();
  tapeDates[index] = awarded;
  book.kids = { ...kids, tapeDates };
  return touch(report, book, now);
}

export function setKidsHistoryAwardedOn(report: StudentProgressReport, id: string, date: string, now = Date.now()): StudentProgressReport {
  const awardedOn = cleanDate(date);
  const book = cloneBook(report.beltBook);
  const kids = normalizeKids(book.kids, templateForBook(book));
  if (!kids.history.some((row) => row.id === id)) return report;
  if (kids.history.some((row) => row.id === id && row.awardedOn === awardedOn)) return report;
  book.kids = {
    ...kids,
    history: kids.history.map((row) => (row.id === id ? { ...row, awardedOn } : row)),
  };
  return touch(report, book, now);
}

export function removeKidsHistory(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  const book = cloneBook(report.beltBook);
  const kids = normalizeKids(book.kids, templateForBook(book));
  if (!kids.history.some((row) => row.id === id)) return report;
  book.kids = { ...kids, history: kids.history.filter((row) => row.id !== id) };
  return touch(report, book, now);
}

export function timeGuideText(report: StudentProgressReport, today = new Date()): string {
  const base = 'IBJJF suggests about one month between stripes.';
  const kids = kidsRankOf(report);
  const dates = [...kids.tapeDates, kids.awardedOn].filter(isIsoDate).sort();
  const latest = dates[dates.length - 1];
  if (!latest) return base;
  const [year, month, day] = latest.split('-').map(Number);
  const then = Date.UTC(year, month - 1, day);
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((now - then) / 86_400_000);
  if (days < 0) return base;
  const word = days === 1 ? '1 day' : `${days} days`;
  return `${base} ${word} since the last date on this belt.`;
}

export function readBeltBook(value: unknown): { book?: BeltBook; errors: string[] } {
  if (value == null) return { errors: [] };
  const errors: string[] = [];
  const record = asRecord(value);
  if (!record) {
    errors.push('Belt book must be an object.');
    return { errors };
  }
  const book: BeltBook = {};
  if (record.mode != null) {
    if (record.mode !== 'adult' && record.mode !== 'kids') errors.push('Belt book mode must be adult or kids.');
    else book.mode = record.mode;
  }
  const templateId = readTemplateId(record.templateId, 'Belt template', errors);
  if (templateId) book.templateId = templateId;
  const kidsTemplateId = readTemplateId(record.kidsTemplateId, 'Kids belt template', errors);
  if (kidsTemplateId) book.kidsTemplateId = kidsTemplateId;
  if (record.birthYear != null && record.birthYear !== '') {
    if (typeof record.birthYear !== 'number' || !Number.isInteger(record.birthYear) || record.birthYear < 1900 || record.birthYear > 2100) {
      errors.push('Birth year must be a whole year.');
    } else book.birthYear = record.birthYear;
  }
  if (record.classesPerTape != null && record.classesPerTape !== '') {
    if (typeof record.classesPerTape !== 'number' || !Number.isInteger(record.classesPerTape) || record.classesPerTape < 1 || record.classesPerTape > CLASSES_PER_TAPE_MAX) {
      errors.push(`Classes per stripe are 1 to ${CLASSES_PER_TAPE_MAX}.`);
    } else book.classesPerTape = record.classesPerTape;
  }
  if (record.guide != null) {
    if (record.guide !== 'classes' && record.guide !== 'time') errors.push('Progress is classes or time.');
    else book.guide = record.guide;
  }
  if (record.kids != null) book.kids = readKidsRank(record.kids, errors);
  if (record.templates != null) book.templates = readTemplates(record.templates, errors);
  if (!hasBookFields(book)) return { errors };
  return { book, errors };
}

export function mergeBeltBooks(local?: BeltBook, incoming?: BeltBook): { book?: BeltBook; conflicts: string[] } {
  if (!incoming) return { book: local ? cloneBook(local) : undefined, conflicts: [] };
  if (!local) return { book: cloneBook(incoming), conflicts: [] };
  const conflicts: string[] = [];
  const book = cloneBook(local);
  if ((local.mode ?? 'adult') !== (incoming.mode ?? 'adult')) conflicts.push('Belt system was kept.');
  if (local.birthYear == null && incoming.birthYear != null) book.birthYear = incoming.birthYear;
  else if (local.birthYear != null && incoming.birthYear != null && local.birthYear !== incoming.birthYear) conflicts.push('Birth year was kept.');
  if (local.classesPerTape == null && incoming.classesPerTape != null) book.classesPerTape = incoming.classesPerTape;
  if (local.guide == null && incoming.guide != null) book.guide = incoming.guide;
  if (!local.templateId && incoming.templateId) book.templateId = incoming.templateId;
  if (!local.kidsTemplateId && incoming.kidsTemplateId) book.kidsTemplateId = incoming.kidsTemplateId;
  if (!kidsHasMark(local.kids) && incoming.kids && kidsHasMark(incoming.kids)) book.kids = cloneKids(incoming.kids);
  else if (kidsHasMark(local.kids) && incoming.kids && kidsHasMark(incoming.kids) && JSON.stringify(local.kids) !== JSON.stringify(incoming.kids)) {
    conflicts.push('Kids belts were kept.');
  }
  if ((!local.templates || local.templates.length === 0) && incoming.templates?.length) book.templates = incoming.templates.map(cloneTemplate);
  else if (local.templates?.length && incoming.templates?.length && JSON.stringify(local.templates) !== JSON.stringify(incoming.templates)) {
    conflicts.push('Belt templates were kept.');
  }
  return { book, conflicts };
}

function templateForBook(book: BeltBook): BeltTemplate {
  const id = book.mode === 'adult' ? book.kidsTemplateId : book.templateId;
  if (id && id !== ADULT_IBJJF_TEMPLATE_ID && id !== KIDS_IBJJF_TEMPLATE_ID) {
    const custom = book.templates?.find((item) => item.id === id);
    if (custom && custom.belts.length) return templateFromRecord(custom);
  }
  return IBJJF_KIDS_TEMPLATE;
}

function rungFrom(belt: BeltTemplateDef, kids: KidsBeltRank, past: KidsBeltHistory | undefined): KidsRung {
  if (belt.id === kids.beltId) {
    return {
      ...visual(belt),
      current: true,
      awardedOn: kids.awardedOn,
      tapeCount: kids.tapeCount,
      tapeDates: kids.tapeDates.slice(),
      historyId: '',
    };
  }
  if (past) {
    const tapeCount = clampCount(past.tapeCount, belt.tapeColors.length);
    return {
      ...visual(belt),
      current: false,
      awardedOn: past.awardedOn,
      tapeCount,
      tapeDates: maskDates(past.tapeDates, tapeCount, belt.tapeColors.length),
      historyId: past.id,
    };
  }
  return {
    ...visual(belt),
    current: false,
    awardedOn: '',
    tapeCount: 0,
    tapeDates: emptyDates(belt.tapeColors.length),
    historyId: '',
  };
}

function savedRung(kids: KidsBeltRank): KidsRung {
  const slots = Math.max(kids.tapeDates.length, kids.tapeCount, 1);
  return {
    beltId: kids.beltId,
    label: kids.beltId,
    base: '#f1eee5',
    center: 'solid',
    centerColor: '#f1eee5',
    ink: 'navy',
    tapeColors: Array.from({ length: slots }, () => TAPE_WHITE_FALLBACK),
    current: true,
    awardedOn: kids.awardedOn,
    tapeCount: kids.tapeCount,
    tapeDates: maskDates(kids.tapeDates, kids.tapeCount, slots),
    historyId: '',
  };
}

const TAPE_WHITE_FALLBACK = '#f4f1ea';

function visual(belt: BeltTemplateDef): Omit<KidsRung, 'current' | 'awardedOn' | 'tapeCount' | 'tapeDates' | 'historyId'> {
  return {
    beltId: belt.id,
    label: belt.name,
    base: belt.base,
    center: belt.center,
    centerColor: belt.centerColor || (belt.center === 'white' ? '#f7f4ee' : belt.center === 'black' ? '#161616' : belt.base),
    ink: labelInk(belt),
    tapeColors: [...belt.tapeColors],
    ageMin: belt.ageMin,
    ageMax: belt.ageMax,
  };
}

function slotsFor(template: BeltTemplate, beltId: string): number {
  return template.belts.find((belt) => belt.id === beltId)?.tapeColors.length ?? BELT_TAPE_SLOT_MAX;
}

function normalizeKids(kids: KidsBeltRank | undefined, template: BeltTemplate): KidsBeltRank {
  const source = kids ?? emptyKids(template);
  const known = template.belts.find((belt) => belt.id === source.beltId);
  const slots = known ? known.tapeColors.length : Math.min(BELT_TAPE_SLOT_MAX, Math.max(source.tapeDates?.length ?? 0, source.tapeCount ?? 0, 1));
  const tapeCount = clampCount(source.tapeCount, slots);
  const classMax = CLASSES_PER_TAPE_MAX;
  const classCount = clampCount(source.classCount, classMax);
  return {
    beltId: source.beltId || known?.id || template.belts[0]?.id || 'white',
    awardedOn: isIsoDate(source.awardedOn) ? source.awardedOn : '',
    tapeCount,
    tapeDates: maskDates(source.tapeDates, tapeCount, slots),
    history: (source.history ?? []).slice(0, PROGRESS_RANK_HISTORY_MAX).map(cloneHistory),
    classCount,
  };
}

function emptyKids(template: BeltTemplate): KidsBeltRank {
  const first = template.belts[0];
  return {
    beltId: first?.id ?? 'white',
    awardedOn: '',
    tapeCount: 0,
    tapeDates: emptyDates(first?.tapeColors.length ?? 0),
    history: [],
    classCount: 0,
  };
}

function kidsHasMark(kids: KidsBeltRank | undefined): boolean {
  if (!kids) return false;
  return kidsBeltMarked(kids) || kids.classCount > 0 || kids.history.length > 0;
}

/** A date or a stripe is enough to keep the belt on the history list. Class dots stay on the belt you wear. */
function kidsBeltMarked(kids: KidsBeltRank): boolean {
  return Boolean(kids.awardedOn) || kids.tapeCount > 0 || kids.tapeDates.some((date) => date.trim());
}

function emptyDates(slots: number): string[] {
  return Array.from({ length: Math.max(0, slots) }, () => '');
}

function maskDates(dates: readonly string[] | undefined, count: number, slots: number): string[] {
  const next = emptyDates(slots);
  const source = dates ?? [];
  for (let index = 0; index < count && index < slots; index += 1) {
    const value = source[index] ?? '';
    next[index] = isIsoDate(value) ? value : '';
  }
  return next;
}

function clampCount(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return 0;
  return Math.min(max, value);
}

function cleanDate(date: string): string {
  const trimmed = date.trim();
  if (!trimmed) return '';
  if (!isIsoDate(trimmed)) throw new Error('Date must be YYYY-MM-DD.');
  return trimmed;
}

function isIsoDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function touch(report: StudentProgressReport, book: BeltBook, now: number): StudentProgressReport {
  return { ...report, updatedAt: now, beltBook: cleanBook(book) };
}

function cleanBook(book: BeltBook): BeltBook {
  const next: BeltBook = {};
  if (book.mode) next.mode = book.mode;
  if (book.templateId) next.templateId = book.templateId;
  if (book.kidsTemplateId) next.kidsTemplateId = book.kidsTemplateId;
  if (book.birthYear != null) next.birthYear = book.birthYear;
  if (book.classesPerTape != null) next.classesPerTape = book.classesPerTape;
  if (book.guide) next.guide = book.guide;
  if (book.kids) next.kids = cloneKids(book.kids);
  if (book.templates?.length) next.templates = book.templates.map(cloneTemplate);
  return next;
}

function cloneBook(book: BeltBook | undefined): BeltBook {
  if (!book) return {};
  return cleanBook(book);
}

function cloneKids(kids: KidsBeltRank): KidsBeltRank {
  return {
    beltId: kids.beltId,
    awardedOn: kids.awardedOn,
    tapeCount: kids.tapeCount,
    tapeDates: kids.tapeDates.slice(),
    history: kids.history.map(cloneHistory),
    classCount: kids.classCount,
  };
}

function cloneHistory(row: KidsBeltHistory): KidsBeltHistory {
  return {
    id: row.id,
    beltId: row.beltId,
    awardedOn: row.awardedOn,
    tapeCount: row.tapeCount,
    tapeDates: row.tapeDates.slice(),
  };
}

function cloneTemplate(record: BeltTemplateRecord): BeltTemplateRecord {
  return {
    ...record,
    belts: record.belts.map((belt) => ({ ...belt, tapeColors: [...belt.tapeColors] })),
  };
}

function hasBookFields(book: BeltBook): boolean {
  return Boolean(
    book.mode ||
      book.templateId ||
      book.kidsTemplateId ||
      book.birthYear != null ||
      book.classesPerTape != null ||
      book.guide ||
      book.kids ||
      book.templates?.length,
  );
}

function readKidsRank(value: unknown, errors: string[]): KidsBeltRank | undefined {
  const record = asRecord(value);
  if (!record) {
    errors.push('Kids rank must be an object.');
    return undefined;
  }
  const beltId = readId(record.beltId, 'Kids belt', errors) || 'white';
  const tapeCount = readSlotCount(record.tapeCount, 'Kids tape count', errors);
  const tapeDates = readDateList(record.tapeDates, 'Kids tape dates', errors);
  const classCount = readClassCount(record.classCount, errors);
  const history = readHistory(record.history, errors);
  return {
    beltId,
    awardedOn: readLooseDate(record.awardedOn),
    tapeCount,
    tapeDates: maskDates(tapeDates, tapeCount, Math.max(tapeDates.length, tapeCount)),
    history,
    classCount,
  };
}

function readHistory(value: unknown, errors: string[]): KidsBeltHistory[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push('Kids belt history must be a list.');
    return [];
  }
  if (value.length > PROGRESS_RANK_HISTORY_MAX) errors.push('Kids belt history is full.');
  const history: KidsBeltHistory[] = [];
  const seen = new Set<string>();
  value.slice(0, PROGRESS_RANK_HISTORY_MAX).forEach((row, index) => {
    const record = asRecord(row);
    const label = `Kids belt history ${index + 1}`;
    if (!record) {
      errors.push(`${label} must be an object.`);
      return;
    }
    const id = readId(record.id, `${label} id`, errors);
    if (id && seen.has(id)) errors.push(`${label} id ${id} is repeated.`);
    if (id) seen.add(id);
    const tapeCount = readSlotCount(record.tapeCount, `${label} tape count`, errors);
    const tapeDates = readDateList(record.tapeDates, `${label} tape dates`, errors);
    history.push({
      id,
      beltId: readId(record.beltId, `${label} belt`, errors) || 'white',
      awardedOn: readLooseDate(record.awardedOn),
      tapeCount,
      tapeDates: maskDates(tapeDates, tapeCount, Math.max(tapeDates.length, tapeCount)),
    });
  });
  return history;
}

function readTemplates(value: unknown, errors: string[]): BeltTemplateRecord[] | undefined {
  if (!Array.isArray(value)) {
    errors.push('Belt templates must be a list.');
    return undefined;
  }
  if (value.length > BELT_TEMPLATE_MAX) errors.push('Belt templates has more than the saved limit.');
  const templates: BeltTemplateRecord[] = [];
  const seen = new Set<string>();
  value.slice(0, BELT_TEMPLATE_MAX).forEach((row, index) => {
    const template = readTemplate(row, index, errors);
    if (!template) return;
    if (seen.has(template.id)) errors.push(`Belt template id ${template.id} is repeated.`);
    seen.add(template.id);
    templates.push(template);
  });
  return templates;
}

function readTemplate(value: unknown, index: number, errors: string[]): BeltTemplateRecord | null {
  const record = asRecord(value);
  const label = `Belt template ${index + 1}`;
  if (!record) {
    errors.push(`${label} must be an object.`);
    return null;
  }
  if (record.kind !== 'custom') errors.push(`${label} must be a custom template.`);
  const version = record.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > 999) {
    errors.push(`${label} version must be a whole number.`);
  }
  const ageMode = record.ageMode;
  if (ageMode !== 'kids' && ageMode !== 'adult' && ageMode !== 'any') errors.push(`${label} age mode must be kids, adult, or any.`);
  const belts = readBeltDefs(record.belts, label, errors);
  const id = readTemplateId(record.id, `${label} id`, errors);
  if (!id || !belts) return null;
  const template: BeltTemplateRecord = {
    id,
    name: readName(record.name, `${label} name`, errors) || 'Custom belts',
    kind: 'custom',
    version: typeof version === 'number' && Number.isInteger(version) ? version : 1,
    ageMode: ageMode === 'adult' || ageMode === 'any' ? ageMode : 'kids',
    belts,
  };
  const baseId = readTemplateId(record.baseId, `${label} base`, errors);
  if (baseId) template.baseId = baseId;
  return template;
}

function readBeltDefs(value: unknown, label: string, errors: string[]): BeltTemplateDef[] | null {
  if (!Array.isArray(value) || value.length < 1) {
    errors.push(`${label} needs at least one belt.`);
    return null;
  }
  if (value.length > BELT_TEMPLATE_BELTS_MAX) errors.push(`${label} has more belts than the saved limit.`);
  const belts: BeltTemplateDef[] = [];
  const seen = new Set<string>();
  value.slice(0, BELT_TEMPLATE_BELTS_MAX).forEach((row, index) => {
    const belt = readBeltDef(row, `${label} belt ${index + 1}`, errors);
    if (!belt) return;
    if (seen.has(belt.id)) errors.push(`${label} belt id ${belt.id} is repeated.`);
    seen.add(belt.id);
    belts.push(belt);
  });
  return belts.length ? belts : null;
}

function readBeltDef(value: unknown, label: string, errors: string[]): BeltTemplateDef | null {
  const record = asRecord(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
    return null;
  }
  const id = readId(record.id, `${label} id`, errors);
  const name = readName(record.name, `${label} name`, errors);
  const base = readHex(record.base, `${label} color`, errors);
  const center = record.center;
  if (!BELT_CENTERS.includes(center as BeltCenter)) errors.push(`${label} center must be solid, white, or black.`);
  const ink = record.ink === 'navy' || record.ink === 'white' ? record.ink : null;
  if (!ink) errors.push(`${label} ink must be navy or white.`);
  const tapeColors = readHexList(record.tapeColors, `${label} tapes`, errors);
  if (!id || !name || !base || !ink || !tapeColors) return null;
  const belt: BeltTemplateDef = {
    id,
    name,
    base,
    center: BELT_CENTERS.includes(center as BeltCenter) ? (center as BeltCenter) : 'solid',
    ink,
    tapeColors,
  };
  if (record.centerColor != null && record.centerColor !== '') {
    const centerColor = readHex(record.centerColor, `${label} center color`, errors);
    if (centerColor) belt.centerColor = centerColor;
  }
  if (record.ageMin != null && record.ageMin !== '') belt.ageMin = readAge(record.ageMin, `${label} age`, errors);
  if (record.ageMax != null && record.ageMax !== '') belt.ageMax = readAge(record.ageMax, `${label} age`, errors);
  if (belt.ageMin != null && belt.ageMax != null && belt.ageMax < belt.ageMin) errors.push(`${label} age window is out of order.`);
  if (typeof record.group === 'string' && record.group.trim()) belt.group = record.group.trim().slice(0, 40);
  if (record.minMonths != null && record.minMonths !== '') {
    if (typeof record.minMonths !== 'number' || !Number.isInteger(record.minMonths) || record.minMonths < 0 || record.minMonths > 240) {
      errors.push(`${label} months must be a whole number.`);
    } else belt.minMonths = record.minMonths;
  }
  return belt;
}

function readHexList(value: unknown, label: string, errors: string[]): string[] | null {
  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list.`);
    return null;
  }
  if (value.length > BELT_TAPE_SLOT_MAX) errors.push(`${label} has more than ${BELT_TAPE_SLOT_MAX} tapes.`);
  const colors: string[] = [];
  for (const row of value.slice(0, BELT_TAPE_SLOT_MAX)) {
    const color = readHex(row, label, errors);
    if (color) colors.push(color);
  }
  return colors;
}

function readHex(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || !HEX_RE.test(value)) {
    errors.push(`${label} must be a color.`);
    return '';
  }
  return value.toLowerCase();
}

function readAge(value: unknown, label: string, errors: string[]): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 99) {
    errors.push(`${label} must be a whole number.`);
    return undefined;
  }
  return value;
}

function readName(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || !value.trim()) {
    errors.push(`${label} must be text.`);
    return '';
  }
  if (value.length > PROGRESS_NAME_MAX) errors.push(`${label} is too long.`);
  return value.trim().slice(0, PROGRESS_NAME_MAX);
}

function readTemplateId(value: unknown, label: string, errors: string[]): string {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !TEMPLATE_ID_RE.test(value)) {
    errors.push(`${label} must be a stable id.`);
    return '';
  }
  return value;
}

function readId(value: unknown, label: string, errors: string[]): string {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    errors.push(`${label} must be a stable id.`);
    return '';
  }
  return value;
}

function readSlotCount(value: unknown, label: string, errors: string[]): number {
  if (value == null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > BELT_TAPE_SLOT_MAX) {
    errors.push(`${label} must be a whole number from 0 to ${BELT_TAPE_SLOT_MAX}.`);
    return 0;
  }
  return value;
}

function readClassCount(value: unknown, errors: string[]): number {
  if (value == null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > CLASSES_PER_TAPE_MAX) {
    errors.push(`Classes toward the next stripe are 0 to ${CLASSES_PER_TAPE_MAX}.`);
    return 0;
  }
  return value;
}

function readDateList(value: unknown, label: string, errors: string[]): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} must be a list.`);
    return [];
  }
  if (value.length > BELT_TAPE_SLOT_MAX) errors.push(`${label} has more than ${BELT_TAPE_SLOT_MAX} dates.`);
  return value.slice(0, BELT_TAPE_SLOT_MAX).map((row) => (typeof row === 'string' && isIsoDate(row) ? row : ''));
}

function readLooseDate(value: unknown): string {
  if (typeof value !== 'string' || !isIsoDate(value)) return '';
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function newId(now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `kids.${now.toString(36)}.${rand}`.slice(0, PROGRESS_ID_MAX);
}
