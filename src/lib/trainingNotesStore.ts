/** Coach Daily Lesson Plan. On-device days only — no cloud, no Pro archive. */

export const TRAINING_NOTES_STORAGE_KEY = 'matboard.coach.trainingNotes.v1';
/** Previous free-text jot. Read once into today's Intro, then removed. */
export const LEGACY_TRAINING_NOTES_STORAGE_KEY = 'matboard.trainingNotes.v1';

export const COACH_NAME_MAX = 80;
export const INTRO_MAX = 8_000;
export const WARMUP_NOTE_MAX = 1_500;
export const COOLDOWN_NOTE_MAX = 1_500;
export const CLOSING_MAX = 2_000;
export const TECHNIQUE_TITLE_MAX = 120;
export const TECHNIQUE_NOTES_MAX = 2_000;
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
  waterBreak: boolean;
  /**
   * Explicit Technique Tree id chosen on this drill.
   * Absent means a title match may still open a tree.
   */
  treeId?: string;
};

export type TrainingNotesPlan = {
  version: 1;
  coachName: string;
  intro: string;
  warmupNote: string;
  techniques: TechniqueBlock[];
  cooldownNote: string;
  closing: string;
};

/**
 * Same storage key as the single-plan card.
 * `version: 2` holds one plan per local calendar date (`YYYY-MM-DD`).
 * A stored `version: 1` plan is moved onto today the first time it is read.
 */
export type TrainingNotesArchive = {
  version: 2;
  days: Record<string, TrainingNotesPlan>;
};

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

function clampText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
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
    waterBreak: false,
  };
}

export function emptyPlan(): TrainingNotesPlan {
  return {
    version: 1,
    coachName: '',
    intro: '',
    warmupNote: '',
    techniques: [createTechnique(), createTechnique(), createTechnique()],
    cooldownNote: '',
    closing: '',
  };
}

export function planHasContent(plan: TrainingNotesPlan): boolean {
  if (
    plan.coachName.trim() ||
    plan.intro.trim() ||
    plan.warmupNote.trim() ||
    plan.cooldownNote.trim() ||
    plan.closing.trim()
  ) {
    return true;
  }
  return plan.techniques.some(
    (tech) => tech.title.trim() || tech.notes.trim() || tech.waterBreak || Boolean(tech.treeId),
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
  if (raw && (raw.title !== title || raw.notes !== notes)) repaired = true;
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

  const coachName = clampText(raw?.coachName, COACH_NAME_MAX);
  const intro = clampText(raw?.intro, INTRO_MAX);
  const warmupNote = clampText(raw?.warmupNote, WARMUP_NOTE_MAX);
  const cooldownNote = clampText(raw?.cooldownNote, COOLDOWN_NOTE_MAX);
  const closing = clampText(raw?.closing, CLOSING_MAX);
  if (
    raw &&
    (raw.coachName !== coachName ||
      raw.intro !== intro ||
      raw.warmupNote !== warmupNote ||
      raw.cooldownNote !== cooldownNote ||
      raw.closing !== closing)
  ) {
    repaired = true;
  }

  return {
    repaired,
    plan: {
      version: 1,
      coachName,
      intro,
      warmupNote,
      techniques,
      cooldownNote,
      closing,
    },
  };
}

/** Fresh technique ids so a copied day does not share a later video slot with the source. */
export function copyPlan(source: TrainingNotesPlan): TrainingNotesPlan {
  const { plan } = sanitizePlan(source);
  return {
    ...plan,
    techniques: plan.techniques.map((tech) => ({
      ...tech,
      id: createId('tech'),
      slotId: createId('slot'),
    })),
  };
}

function pruneDays(days: Record<string, TrainingNotesPlan>, todayKey: string): Record<string, TrainingNotesPlan> {
  const next: Record<string, TrainingNotesPlan> = {};
  for (const [key, plan] of Object.entries(days)) {
    if (!isWithinRetention(key, todayKey)) continue;
    if (!planHasContent(plan)) continue;
    next[key] = plan;
  }
  return next;
}

function archiveFromStored(
  parsed: unknown,
  todayKey: string,
): { archive: TrainingNotesArchive; rewrite: boolean } | null {
  const raw = asRecord(parsed);
  if (!raw) return null;

  if (raw.version === 2 && raw.days && typeof raw.days === 'object' && !Array.isArray(raw.days)) {
    const days: Record<string, TrainingNotesPlan> = {};
    let rewrite = false;
    for (const [key, value] of Object.entries(raw.days as Record<string, unknown>)) {
      if (!DATE_KEY.test(key)) {
        rewrite = true;
        continue;
      }
      const { plan, repaired } = sanitizePlan(value);
      if (repaired) rewrite = true;
      if (!planHasContent(plan)) {
        rewrite = true;
        continue;
      }
      days[key] = plan;
    }
    const pruned = pruneDays(days, todayKey);
    if (Object.keys(pruned).length !== Object.keys(days).length) rewrite = true;
    return { archive: { version: 2, days: pruned }, rewrite };
  }

  if (raw.version === 1 || Array.isArray(raw.techniques) || typeof raw.coachName === 'string') {
    const { plan } = sanitizePlan(raw);
    const days = planHasContent(plan) ? { [todayKey]: plan } : {};
    return { archive: { version: 2, days }, rewrite: true };
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
  let archive: TrainingNotesArchive = { version: 2, days: {} };
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
      archive = { version: 2, days: { [today]: clean } };
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
  return archive.days[dateKey] ?? emptyPlan();
}

export function saveDay(
  dateKey: string,
  plan: TrainingNotesPlan,
  today = localDateKey(),
): { archive: TrainingNotesArchive; plan: TrainingNotesPlan } {
  const loaded = loadTrainingArchive(today);
  const { plan: clean } = sanitizePlan(plan);
  const days = { ...loaded.days };
  if (planHasContent(clean) && isWithinRetention(dateKey, today)) days[dateKey] = clean;
  else delete days[dateKey];
  const archive: TrainingNotesArchive = { version: 2, days: pruneDays(days, today) };
  return { archive: writeArchive(archive) ?? archive, plan: clean };
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
