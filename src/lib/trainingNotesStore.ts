/**
 * Coach Daily Lesson Plan text, saved on this device as the coach types.
 * Instructor Collaboration may mirror that text into the gym's Google Drive
 * folder, and copy attached technique videos into that day's training-videos
 * folder (`lessonDrive.ts`). Video bytes go to the customer's Drive only.
 * This store still keeps the lesson text on the phone.
 */

import { asRecord, clampText } from './plainValue.ts';

export const TRAINING_NOTES_STORAGE_KEY = 'matboard.coach.trainingNotes.v1';
/** Previous free-text jot. Read once into today's Intro, then removed. */
export const LEGACY_TRAINING_NOTES_STORAGE_KEY = 'matboard.trainingNotes.v1';

export const COACH_NAME_MAX = 80;
/** Free-text class label, such as "GB1". Not a fixed list. */
export const CLASS_DESIGNATION_MAX = 40;
/** Optional title for this class, such as "Guard passing". Empty on older plans. */
export const LESSON_TITLE_MAX = 80;
/** Free-text class time, such as "5:00 PM". Not a clock widget. */
export const CLASS_TIME_MAX = 40;
export const INTRO_MAX = 8_000;
export const WARMUP_NOTE_MAX = 1_500;
export const SPECIFIC_NOTE_MAX = 1_500;
export const COOLDOWN_NOTE_MAX = 1_500;
export const CLOSING_MAX = 2_000;
export const TECHNIQUE_TITLE_MAX = 120;
export const TECHNIQUE_NOTES_MAX = 2_000;
/** Free-text expected duration, such as "5 min". Not a countdown. */
export const EXPECTED_MAX = 40;
export const MIN_TECHNIQUES = 3;
export const MAX_TECHNIQUES = 20;
/** Today plus the previous 13 local dates. */
export const PLAN_RETENTION_DAYS = 14;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export type TechniqueBlock = {
  id: string;
  /**
   * Stable id for this drill on this day.
   * Daily Training Videos pair by parallel slot order, not by this id.
   */
  slotId: string;
  title: string;
  notes: string;
  /** How long the coach expects this drill to take. A note, not a timer. */
  expected: string;
  waterBreak: boolean;
  /**
   * Explicit Technique Tree id chosen on this drill.
   * Absent means a title match may still open a tree.
   */
  treeId?: string;
};

export type TrainingNotesPlan = {
  version: 1;
  /** Stable id so one day can hold more than one class plan. */
  id: string;
  coachName: string;
  /** Free-text class label under the coach name, such as "GB1". */
  classDesignation: string;
  /** Optional lesson title beside the class designation. Empty when unset. */
  lessonTitle: string;
  /** Free-text class time under the coach name, such as "5:00 PM". */
  classTime: string;
  intro: string;
  introExpected: string;
  warmupNote: string;
  warmupExpected: string;
  techniques: TechniqueBlock[];
  /** Positional sparring / rounds for this day. No Daily Training Videos slot. */
  specificNote: string;
  specificExpected: string;
  cooldownNote: string;
  cooldownExpected: string;
  closing: string;
};

/** One calendar day. Several class plans can share the date. */
export type TrainingNotesDay = {
  plans: TrainingNotesPlan[];
};

/**
 * Same storage key as the single-plan card.
 * `version: 3` holds one or more plans per local calendar date (`YYYY-MM-DD`).
 * `version: 2` stored one plan per date and is wrapped into `plans` on read.
 * A stored `version: 1` plan is moved onto today the first time it is read.
 */
export type TrainingNotesArchive = {
  version: 3;
  days: Record<string, TrainingNotesDay>;
};

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

/** Device local calendar date. A phone set to America/New_York rolls over at local midnight. */
export function localDateKey(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateFromKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year || 1970, (month || 1) - 1, day || 1);
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + deltaDays);
  return localDateKey(date);
}

export function isWithinRetention(dateKey: string, todayKey: string, days = PLAN_RETENTION_DAYS): boolean {
  if (!DATE_KEY.test(dateKey) || !DATE_KEY.test(todayKey)) return false;
  const diff = Math.round((dateFromKey(todayKey).getTime() - dateFromKey(dateKey).getTime()) / DAY_MS);
  return diff >= 0 && diff < days;
}

export function planDayTitle(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === shiftDateKey(todayKey, -1)) return 'Yesterday';
  return planDayStamp(dateKey);
}

export function planDayStamp(dateKey: string): string {
  return dateFromKey(dateKey).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function createTechnique(): TechniqueBlock {
  return {
    id: createId('tech'),
    slotId: createId('slot'),
    title: '',
    notes: '',
    expected: '',
    waterBreak: false,
  };
}

export function emptyPlan(): TrainingNotesPlan {
  return {
    version: 1,
    id: createId('plan'),
    coachName: '',
    classDesignation: '',
    lessonTitle: '',
    classTime: '',
    intro: '',
    introExpected: '',
    warmupNote: '',
    warmupExpected: '',
    techniques: [createTechnique(), createTechnique(), createTechnique()],
    specificNote: '',
    specificExpected: '',
    cooldownNote: '',
    cooldownExpected: '',
    closing: '',
  };
}

export function planHasContent(plan: TrainingNotesPlan): boolean {
  if (
    plan.coachName.trim() ||
    plan.classDesignation.trim() ||
    plan.lessonTitle.trim() ||
    plan.classTime.trim() ||
    plan.intro.trim() ||
    plan.introExpected.trim() ||
    plan.warmupNote.trim() ||
    plan.warmupExpected.trim() ||
    plan.specificNote.trim() ||
    plan.specificExpected.trim() ||
    plan.cooldownNote.trim() ||
    plan.cooldownExpected.trim() ||
    plan.closing.trim()
  ) {
    return true;
  }
  return plan.techniques.some(
    (tech) =>
      tech.title.trim() ||
      tech.notes.trim() ||
      tech.expected.trim() ||
      tech.waterBreak ||
      Boolean(tech.treeId),
  );
}

function sanitizeTechnique(value: unknown): { block: TechniqueBlock; repaired: boolean } {
  const raw = asRecord(value);
  let repaired = !raw;
  const idValue = raw && typeof raw.id === 'string' ? raw.id.trim() : '';
  const slotValue = raw && typeof raw.slotId === 'string' ? raw.slotId.trim() : '';
  const id = idValue ? idValue.slice(0, 80) : createId('tech');
  const slotId = slotValue
    ? slotValue.slice(0, 80)
    : idValue
      ? `slot-${idValue.slice(0, 70)}`
      : createId('slot');
  if (!idValue || !slotValue) repaired = true;
  if (raw && raw.waterBreak !== true && raw.waterBreak !== false) repaired = true;
  const title = clampText(raw?.title, TECHNIQUE_TITLE_MAX);
  const notes = clampText(raw?.notes, TECHNIQUE_NOTES_MAX);
  const expected = clampText(raw?.expected, EXPECTED_MAX);
  if (raw && (raw.title !== title || raw.notes !== notes || raw.expected !== expected)) repaired = true;
  let treeId: string | undefined;
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'treeId')) {
    if (typeof raw.treeId === 'string') {
      const trimmed = raw.treeId.trim().slice(0, 80);
      if (raw.treeId !== trimmed) repaired = true;
      if (trimmed) treeId = trimmed;
    } else if (raw.treeId != null) {
      repaired = true;
    }
  }
  return {
    repaired,
    block: {
      id,
      slotId,
      title,
      notes,
      expected,
      waterBreak: raw?.waterBreak === true,
      ...(treeId ? { treeId } : {}),
    },
  };
}

function uniquify(techniques: TechniqueBlock[]): boolean {
  const ids = new Set<string>();
  const slots = new Set<string>();
  let changed = false;
  for (const tech of techniques) {
    if (ids.has(tech.id)) {
      tech.id = createId('tech');
      changed = true;
    }
    ids.add(tech.id);
    if (slots.has(tech.slotId)) {
      tech.slotId = createId('slot');
      changed = true;
    }
    slots.add(tech.slotId);
  }
  return changed;
}

export function sanitizePlan(input: unknown): { plan: TrainingNotesPlan; repaired: boolean } {
  const raw = asRecord(input);
  let repaired = !raw || raw.version !== 1;
  const source = Array.isArray(raw?.techniques) ? raw.techniques : [];
  if (!raw || !Array.isArray(raw.techniques) || source.length < MIN_TECHNIQUES || source.length > MAX_TECHNIQUES) {
    repaired = true;
  }
  const techniques = source.slice(0, MAX_TECHNIQUES).map((item) => {
    const next = sanitizeTechnique(item);
    if (next.repaired) repaired = true;
    return next.block;
  });
  while (techniques.length < MIN_TECHNIQUES) {
    techniques.push(createTechnique());
    repaired = true;
  }
  if (uniquify(techniques)) repaired = true;

  const idRaw = raw && typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = idRaw ? idRaw.slice(0, 80) : createId('plan');
  if (!idRaw || (raw && raw.id !== id)) repaired = true;
  const coachName = clampText(raw?.coachName, COACH_NAME_MAX);
  const classDesignation = clampText(raw?.classDesignation, CLASS_DESIGNATION_MAX);
  const lessonTitle = clampText(raw?.lessonTitle, LESSON_TITLE_MAX);
  const classTime = clampText(raw?.classTime, CLASS_TIME_MAX);
  const intro = clampText(raw?.intro, INTRO_MAX);
  const introExpected = clampText(raw?.introExpected, EXPECTED_MAX);
  const warmupNote = clampText(raw?.warmupNote, WARMUP_NOTE_MAX);
  const warmupExpected = clampText(raw?.warmupExpected, EXPECTED_MAX);
  const specificNote = clampText(raw?.specificNote, SPECIFIC_NOTE_MAX);
  const specificExpected = clampText(raw?.specificExpected, EXPECTED_MAX);
  const cooldownNote = clampText(raw?.cooldownNote, COOLDOWN_NOTE_MAX);
  const cooldownExpected = clampText(raw?.cooldownExpected, EXPECTED_MAX);
  const closing = clampText(raw?.closing, CLOSING_MAX);
  if (
    raw &&
    (raw.coachName !== coachName ||
      raw.classDesignation !== classDesignation ||
      raw.lessonTitle !== lessonTitle ||
      raw.classTime !== classTime ||
      raw.intro !== intro ||
      raw.introExpected !== introExpected ||
      raw.warmupNote !== warmupNote ||
      raw.warmupExpected !== warmupExpected ||
      raw.specificNote !== specificNote ||
      raw.specificExpected !== specificExpected ||
      raw.cooldownNote !== cooldownNote ||
      raw.cooldownExpected !== cooldownExpected ||
      raw.closing !== closing)
  ) {
    repaired = true;
  }

  return {
    repaired,
    plan: {
      version: 1,
      id,
      coachName,
      classDesignation,
      lessonTitle,
      classTime,
      intro,
      introExpected,
      warmupNote,
      warmupExpected,
      techniques,
      specificNote,
      specificExpected,
      cooldownNote,
      cooldownExpected,
      closing,
    },
  };
}

/** Fresh technique ids so a copied day does not share a later video slot with the source. */
export function copyPlan(source: TrainingNotesPlan): TrainingNotesPlan {
  const { plan } = sanitizePlan(source);
  return {
    ...plan,
    id: createId('plan'),
    techniques: plan.techniques.map((tech) => ({
      ...tech,
      id: createId('tech'),
      slotId: createId('slot'),
    })),
  };
}

function uniquifyPlanIds(plans: TrainingNotesPlan[]): boolean {
  const ids = new Set<string>();
  let changed = false;
  for (const plan of plans) {
    if (!plan.id || ids.has(plan.id)) {
      plan.id = createId('plan');
      changed = true;
    }
    ids.add(plan.id);
  }
  return changed;
}

function readDayPlans(value: unknown): { plans: TrainingNotesPlan[]; repaired: boolean } | null {
  const raw = asRecord(value);
  if (!raw) return null;
  if (Array.isArray(raw.plans)) {
    let repaired = false;
    const plans: TrainingNotesPlan[] = [];
    for (const item of raw.plans) {
      const next = sanitizePlan(item);
      if (next.repaired) repaired = true;
      if (!planHasContent(next.plan)) {
        repaired = true;
        continue;
      }
      plans.push(next.plan);
    }
    if (uniquifyPlanIds(plans)) repaired = true;
    return { plans, repaired };
  }
  if (raw.version === 1 || Array.isArray(raw.techniques) || typeof raw.coachName === 'string') {
    const { plan } = sanitizePlan(raw);
    return { plans: planHasContent(plan) ? [plan] : [], repaired: true };
  }
  return null;
}

function pruneDays(days: Record<string, TrainingNotesDay>, todayKey: string): Record<string, TrainingNotesDay> {
  const next: Record<string, TrainingNotesDay> = {};
  for (const [key, day] of Object.entries(days)) {
    if (!isWithinRetention(key, todayKey)) continue;
    const plans = day.plans.filter(planHasContent);
    if (!plans.length) continue;
    next[key] = plans.length === day.plans.length ? day : { plans };
  }
  return next;
}

/** Plans with a blank class designation share this folder. */
export const UNLABELED_CLASS_LABEL = 'No class name';

export type ClassFolderDate = {
  dateKey: string;
  plans: TrainingNotesPlan[];
};

export type ClassFolder = {
  /** Trimmed lowercase designation. Empty string is the unlabeled folder. */
  key: string;
  label: string;
  dates: ClassFolderDate[];
};

export function classFolderKey(designation: string): string {
  return designation.trim().toLowerCase();
}

/**
 * Saved plans grouped as class folders, then dates newest first.
 * "GB2" and "gb2" share a folder. The newest saved spelling is the folder name.
 */
export function classBrowseFolders(archive: TrainingNotesArchive, todayKey: string): ClassFolder[] {
  const groups = new Map<string, { label: string; dates: Map<string, TrainingNotesPlan[]> }>();
  const dateKeys = Object.keys(archive.days)
    .filter((key) => isWithinRetention(key, todayKey))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  for (const dateKey of dateKeys) {
    for (const plan of archive.days[dateKey]?.plans ?? []) {
      if (!planHasContent(plan)) continue;
      const raw = plan.classDesignation.trim();
      const key = classFolderKey(raw);
      let group = groups.get(key);
      if (!group) {
        group = { label: raw || UNLABELED_CLASS_LABEL, dates: new Map() };
        groups.set(key, group);
      }
      const plans = group.dates.get(dateKey) ?? [];
      plans.push(plan);
      group.dates.set(dateKey, plans);
    }
  }

  const folders: ClassFolder[] = [];
  for (const [key, group] of groups) {
    const dates: ClassFolderDate[] = [];
    for (const [dateKey, plans] of group.dates) dates.push({ dateKey, plans });
    folders.push({ key, label: group.label, dates });
  }
  folders.sort((a, b) => {
    if (!a.key && b.key) return 1;
    if (a.key && !b.key) return -1;
    return a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
  });
  return folders;
}

/** Coach / time row inside a class folder. Designation stays in the label when it is set. */
export function classPlanRowLabel(plan: TrainingNotesPlan): string {
  const coach = plan.coachName.trim() || 'Coach';
  const designation = plan.classDesignation.trim();
  const title = plan.lessonTitle.trim();
  const time = plan.classTime.trim() || 'Time';
  if (designation && title) return `${coach} / ${designation} / ${title} / ${time}`;
  if (designation) return `${coach} / ${designation} / ${time}`;
  if (title) return `${coach} / ${title} · ${time}`;
  return `${coach} · ${time}`;
}

/** Coach / GB1 / 5:00 PM, so a day with several classes is easy to scan. */
export function planListLabel(plan: TrainingNotesPlan): string {
  const coach = plan.coachName.trim();
  const designation = plan.classDesignation.trim();
  const title = plan.lessonTitle.trim();
  const time = plan.classTime.trim();
  if (!coach && !designation && !title && !time) return 'New class plan';
  const parts = [coach || 'Coach'];
  if (title) parts.push(title);
  parts.push(designation || 'Class', time || 'Time');
  return parts.join(' / ');
}

export function plansOnDay(archive: TrainingNotesArchive, dateKey: string): TrainingNotesPlan[] {
  return archive.days[dateKey]?.plans ?? [];
}

export function earliestPlanDate(todayKey: string): string {
  return shiftDateKey(todayKey, -(PLAN_RETENTION_DAYS - 1));
}

/** Previous or next day inside the retention window. Null at the ends. */
export function shiftPlanDate(viewKey: string, todayKey: string, delta: number): string | null {
  if (!delta) return isWithinRetention(viewKey, todayKey) ? viewKey : null;
  const next = shiftDateKey(viewKey, delta);
  return isWithinRetention(next, todayKey) ? next : null;
}

export type LessonPlanHit = {
  dateKey: string;
  planId: string;
  label: string;
};

/** Match coach, class, time, section text, or the date. Empty query matches nothing. */
export function searchLessonPlans(
  archive: TrainingNotesArchive,
  todayKey: string,
  query: string,
): LessonPlanHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: LessonPlanHit[] = [];
  const keys = Object.keys(archive.days)
    .filter((dateKey) => isWithinRetention(dateKey, todayKey))
    .sort();
  for (const dateKey of keys) {
    for (const plan of archive.days[dateKey]?.plans ?? []) {
      const haystack = [
        dateKey,
        planDayStamp(dateKey),
        plan.coachName,
        plan.classDesignation,
        plan.classTime,
        plan.intro,
        plan.warmupNote,
        plan.specificNote,
        plan.cooldownNote,
        plan.closing,
        ...plan.techniques.flatMap((tech) => [tech.title, tech.notes]),
      ]
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(needle)) continue;
      hits.push({
        dateKey,
        planId: plan.id,
        label: `${planDayStamp(dateKey)} · ${classPlanRowLabel(plan)}`,
      });
    }
  }
  return hits;
}

export function findPlanById(archive: TrainingNotesArchive, planId: string): TrainingNotesPlan | null {
  for (const day of Object.values(archive.days)) {
    const found = day.plans.find((plan) => plan.id === planId);
    if (found) return found;
  }
  return null;
}

function archiveFromStored(
  parsed: unknown,
  todayKey: string,
): { archive: TrainingNotesArchive; rewrite: boolean } | null {
  const raw = asRecord(parsed);
  if (!raw) return null;

  if (
    (raw.version === 2 || raw.version === 3) &&
    raw.days &&
    typeof raw.days === 'object' &&
    !Array.isArray(raw.days)
  ) {
    const days: Record<string, TrainingNotesDay> = {};
    let rewrite = raw.version !== 3;
    for (const [key, value] of Object.entries(raw.days as Record<string, unknown>)) {
      if (!DATE_KEY.test(key)) {
        rewrite = true;
        continue;
      }
      const read = readDayPlans(value);
      if (!read) {
        rewrite = true;
        continue;
      }
      if (read.repaired) rewrite = true;
      if (!read.plans.length) {
        rewrite = true;
        continue;
      }
      days[key] = { plans: read.plans };
    }
    const pruned = pruneDays(days, todayKey);
    if (Object.keys(pruned).length !== Object.keys(days).length) rewrite = true;
    return { archive: { version: 3, days: pruned }, rewrite };
  }

  if (raw.version === 1 || Array.isArray(raw.techniques) || typeof raw.coachName === 'string') {
    const { plan } = sanitizePlan(raw);
    const days = planHasContent(plan) ? { [todayKey]: { plans: [plan] } } : {};
    return { archive: { version: 3, days }, rewrite: true };
  }

  return null;
}

function writeArchive(archive: TrainingNotesArchive): TrainingNotesArchive | null {
  try {
    localStorage.setItem(TRAINING_NOTES_STORAGE_KEY, JSON.stringify(archive));
    return archive;
  } catch {
    return null;
  }
}

function readLegacyIntro(): string | null {
  try {
    const raw = localStorage.getItem(LEGACY_TRAINING_NOTES_STORAGE_KEY);
    if (typeof raw !== 'string') return null;
    const text = raw.slice(0, INTRO_MAX);
    return text.trim() ? text : null;
  } catch {
    return null;
  }
}

function dropLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_TRAINING_NOTES_STORAGE_KEY);
  } catch {
    /* keep the legacy jot if the new key could not be confirmed */
  }
}

export function recentDateKeys(archive: TrainingNotesArchive, todayKey: string): string[] {
  return Object.keys(archive.days)
    .filter((key) => isWithinRetention(key, todayKey))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

export function loadTrainingArchive(today = localDateKey()): TrainingNotesArchive {
  let archive: TrainingNotesArchive = { version: 3, days: {} };
  let rewrite = false;

  try {
    const raw = localStorage.getItem(TRAINING_NOTES_STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim()) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      const restored = parsed ? archiveFromStored(parsed, today) : null;
      if (restored) {
        archive = restored.archive;
        rewrite = restored.rewrite;
      } else {
        rewrite = true;
      }
    }
  } catch {
    /* fall through to legacy */
  }

  if (!Object.keys(archive.days).length) {
    const legacy = readLegacyIntro();
    if (legacy) {
      const plan = emptyPlan();
      plan.intro = legacy.slice(0, INTRO_MAX);
      const { plan: clean } = sanitizePlan(plan);
      archive = { version: 3, days: { [today]: { plans: [clean] } } };
      const written = writeArchive(archive);
      if (written) dropLegacy();
      return written ?? archive;
    }
  }

  if (rewrite) writeArchive(archive);
  return archive;
}

export function loadDay(dateKey: string, today = localDateKey()): TrainingNotesPlan {
  const archive = loadTrainingArchive(today);
  return plansOnDay(archive, dateKey)[0] ?? emptyPlan();
}

/**
 * Insert or replace one class plan on a date. Sibling plans on that date stay.
 * An empty plan removes only that id. The day key drops when nothing remains.
 */
export function saveDay(
  dateKey: string,
  plan: TrainingNotesPlan,
  today = localDateKey(),
): { archive: TrainingNotesArchive; plan: TrainingNotesPlan } {
  const loaded = loadTrainingArchive(today);
  const { plan: clean } = sanitizePlan(plan);
  const days = { ...loaded.days };
  const existing = days[dateKey]?.plans ?? [];
  if (planHasContent(clean) && isWithinRetention(dateKey, today)) {
    const index = existing.findIndex((item) => item.id === clean.id);
    const plans = index >= 0 ? existing.map((item, i) => (i === index ? clean : item)) : [...existing, clean];
    days[dateKey] = { plans };
  } else {
    const plans = existing.filter((item) => item.id !== clean.id);
    if (plans.length) days[dateKey] = { plans };
    else delete days[dateKey];
  }
  const archive: TrainingNotesArchive = { version: 3, days: pruneDays(days, today) };
  return { archive: writeArchive(archive) ?? archive, plan: clean };
}

/** Drop one class plan. Other plans on that date stay. */
export function removeDayPlan(
  dateKey: string,
  planId: string,
  today = localDateKey(),
): TrainingNotesArchive {
  const loaded = loadTrainingArchive(today);
  const days = { ...loaded.days };
  const plans = (days[dateKey]?.plans ?? []).filter((item) => item.id !== planId);
  if (plans.length) days[dateKey] = { plans };
  else delete days[dateKey];
  const archive: TrainingNotesArchive = { version: 3, days: pruneDays(days, today) };
  return writeArchive(archive) ?? archive;
}

export function loadTrainingNotes(today = localDateKey()): TrainingNotesPlan {
  return loadDay(today, today);
}

export function saveTrainingNotes(plan: TrainingNotesPlan, today = localDateKey()): TrainingNotesPlan {
  return saveDay(today, plan, today).plan;
}

export function addTechnique(plan: TrainingNotesPlan): TrainingNotesPlan {
  if (plan.techniques.length >= MAX_TECHNIQUES) return plan;
  return {
    ...plan,
    techniques: [...plan.techniques, createTechnique()],
  };
}

/** Drop a block only after the first three. Earlier blocks stay. */
export function removeTechnique(plan: TrainingNotesPlan, id: string): TrainingNotesPlan {
  const index = plan.techniques.findIndex((tech) => tech.id === id);
  if (index < MIN_TECHNIQUES) return plan;
  return {
    ...plan,
    techniques: plan.techniques.filter((tech) => tech.id !== id),
  };
}
