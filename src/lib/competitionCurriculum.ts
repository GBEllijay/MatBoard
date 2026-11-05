/**
 * Competition Class Curriculum text, saved on this phone as the coach types.
 * A separate record from the Daily Lesson Plan (`trainingNotesStore`).
 * Video bytes stay in the Daily Training Videos library on this phone.
 * A Drive copy is text only, in the gym's connected folder. Advantage does not host videos.
 */

import { migrateExpectedDuration, parseExpectedMinutes } from './expectedDuration.ts';
import { asRecord, clampText } from './plainValue.ts';
import { cleanClip, cleanReviewSlot, type ReplayClipRef, type ReviewSlot } from './replayAnalysis.ts';
import {
  CLASS_DESIGNATION_MAX,
  CLASS_TIME_MAX,
  CLOSING_MAX,
  COACH_NAME_MAX,
  EXPECTED_MAX,
  PLAN_RETENTION_DAYS,
  TECHNIQUE_NOTES_MAX,
  TECHNIQUE_TITLE_MAX,
  UNLABELED_CLASS_LABEL,
  isWithinRetention,
  localDateKey,
  planDayStamp,
} from './trainingNotesStore.ts';

export const CURRICULUM_STORAGE_KEY = 'matboard.coach.competitionCurriculum.v1';
export const CURRICULUM_PATH = '/competition-curriculum';
export const CURRICULUM_LABEL = 'Competition Class Curriculum';
export const CURRICULUM_DEVICE_NOTE =
  "Today's and yesterday's curriculums and recent days stay on this device.";
export const CURRICULUM_SAVE_LEAD =
  'This curriculum saves to your phone as you type. Click here to save a copy on your connected drive.';
export const CURRICULUM_SAVE_LINK = 'Click here';
export const CURRICULUM_LOCK_LABEL = "Lock In Today's Curriculum";
export const CURRICULUM_UNLOCK_LABEL = "Edit today's curriculum";
export const CURRICULUM_ADD_LABEL = '+ Add another';
export const CURRICULUM_ADD_EXAMPLES = 'Cardio, Bag Work, Sparring';
export const DESIGNATION_PLACEHOLDER = 'Gi, No Gi, Cardio, Wrestling';
export const DEFAULT_EXPECTED_MS = 5 * 60_000;
export const DEFAULT_LIVE_ROUNDS = 5;
export const MAX_BLOCKS = 20;
export const MIN_ROUNDS = 1;
export const MAX_ROUNDS = 99;

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const SUGGESTED_KINDS = ['warmup', 'body', 'takedown', 'specific', 'live', 'cooldown'] as const;

export type SuggestedKind = (typeof SUGGESTED_KINDS)[number];
export type CurriculumKind = SuggestedKind | 'custom';
/** Timer only, looping video, or record a clip for replay analysis. */
export type CurriculumTiming = 'timer' | 'video' | 'replay';
export const CURRICULUM_TIMINGS: readonly CurriculumTiming[] = ['timer', 'video', 'replay'];
export const CURRICULUM_TIMING_LABELS: Record<CurriculumTiming, string> = {
  timer: 'Timer only',
  video: 'Looping video',
  replay: 'Record for replay',
};
export const RECORD_FOR_REVIEW_LABEL = 'Record for Review';

export type CurriculumBlock = {
  id: string;
  kind: CurriculumKind;
  /** Custom section title. Suggested cards keep their own headings. */
  title: string;
  notes: string;
  /**
   * Minutes, such as "8" or "8.5". Blank means 5. Older "8:00" becomes "8"
   * and "1:30" becomes "1.5" on load.
   */
  expected: string;
  waterBreak: boolean;
  timing: CurriculumTiming;
  /** On-device clip id. The bytes are not in this record. */
  clipId: string | null;
  mediaName: string;
  treeId?: string;
  rounds: number;
  /** Sparring and added blocks: keep the timer and also record a clip for review. */
  recordReview?: boolean;
  /** Replay clip on this device (plus where a copy was saved). Only the ref is stored here. */
  replayClip?: ReplayClipRef;
};

export type CurriculumPlan = {
  version: 1;
  id: string;
  coachName: string;
  classDesignation: string;
  classTime: string;
  blocks: CurriculumBlock[];
  closing: string;
  /** Record for Review on the Closing section. Absent when off with no clip. */
  closingReview?: ReviewSlot;
  locked: boolean;
};

export type CurriculumDay = {
  plans: CurriculumPlan[];
};

export type CurriculumArchive = {
  version: 1;
  days: Record<string, CurriculumDay>;
};

export type CurriculumFolderDate = {
  dateKey: string;
  plans: CurriculumPlan[];
};

export type CurriculumFolder = {
  key: string;
  label: string;
  dates: CurriculumFolderDate[];
};

let idSeq = 0;

function createId(prefix: string): string {
  idSeq += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${idSeq.toString(36)}-${rand}`;
}

export function blockHeading(block: Pick<CurriculumBlock, 'kind' | 'title'>): string {
  switch (block.kind) {
    case 'warmup':
      return 'Competition Class Warm-Up';
    case 'body':
      return 'Body Movement Exercises';
    case 'takedown':
      return 'Take Downs';
    case 'specific':
      return 'Specific Training';
    case 'live':
      return 'Live Rounds';
    case 'cooldown':
      return 'Cool Down';
    default:
      return block.title.trim() || 'New section';
  }
}

export function blockNotesLabel(kind: CurriculumKind): string {
  if (kind === 'specific') return 'Positions this training starts from';
  if (kind === 'live') return 'Details or what to focus on';
  return 'Notes';
}

export function blockOffersClock(kind: CurriculumKind): boolean {
  return kind === 'warmup' || kind === 'body' || kind === 'takedown' || kind === 'specific' || kind === 'custom';
}

/** Lesson sections that can carry "Record for Review": curriculum kinds plus the Intro and Closing (outro) sections. */
export type ReviewToggleKind = CurriculumKind | 'intro' | 'closing';

/**
 * "Record for Review" switch (owner decision): sparring (Live Rounds), added
 * blocks such as Bag Work or Cardio, Specific Training, Intro, and Closing
 * (the outro block in every template). Not on Cool down, warm-up, body
 * movement, or technique/takedown blocks.
 */
export function blockOffersReviewToggle(kind: ReviewToggleKind): boolean {
  return kind === 'live' || kind === 'custom' || kind === 'specific' || kind === 'intro' || kind === 'closing';
}

/** The block shows the replay recorder: its mode is "Record for replay", or Record for Review is on. */
export function blockWantsReplay(block: Pick<CurriculumBlock, 'kind' | 'timing' | 'recordReview'>): boolean {
  if (blockOffersClock(block.kind) && block.timing === 'replay') return true;
  return blockOffersReviewToggle(block.kind) && block.recordReview === true;
}

export function blockOffersTree(kind: CurriculumKind): boolean {
  return kind === 'body' || kind === 'takedown' || kind === 'specific' || kind === 'custom';
}

export function blockOffersNotes(kind: CurriculumKind): boolean {
  return kind !== 'warmup';
}

export function blockOffersExpected(kind: CurriculumKind): boolean {
  return kind !== 'live';
}

/**
 * Stored minute count. "8:00" becomes "8". "1:30" becomes "1.5".
 * Blank stays blank. Text that is not a duration is kept.
 * Above 60 clamps to 60. Under 30 seconds clamps to 0.5.
 */
export function normalizeExpectedDuration(value: string): string {
  const migrated = migrateExpectedDuration(value);
  return migrated.length > EXPECTED_MAX ? migrated.slice(0, EXPECTED_MAX) : migrated;
}

/**
 * Milliseconds for the round timer or the looping video.
 * Blank or unreadable text uses 5 minutes. A clock string snaps to 30 seconds.
 * The round timer still clamps this to its own 1:00–60:00 wheel.
 */
export function expectedToWorkMs(value: string, fallbackMs = DEFAULT_EXPECTED_MS): number {
  const trimmed = value.trim();
  if (!trimmed) return fallbackMs;
  const minutes = parseExpectedMinutes(trimmed);
  if (minutes == null) return fallbackMs;
  return Math.round(minutes * 60_000);
}

function clampRounds(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIVE_ROUNDS;
  return Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(n)));
}

function isKind(value: unknown): value is CurriculumKind {
  return value === 'custom' || (SUGGESTED_KINDS as readonly string[]).includes(String(value));
}

export function createCustomBlock(): CurriculumBlock {
  return {
    id: createId('block'),
    kind: 'custom',
    title: '',
    notes: '',
    expected: '',
    waterBreak: false,
    timing: 'timer',
    clipId: null,
    mediaName: '',
    rounds: DEFAULT_LIVE_ROUNDS,
  };
}

function createSuggestedBlock(kind: SuggestedKind): CurriculumBlock {
  return { ...createCustomBlock(), id: createId('block'), kind, title: '' };
}

export function suggestedBlocks(): CurriculumBlock[] {
  return SUGGESTED_KINDS.map((kind) => createSuggestedBlock(kind));
}

export function emptyCurriculum(): CurriculumPlan {
  return {
    version: 1,
    id: createId('curriculum'),
    coachName: '',
    classDesignation: '',
    classTime: '',
    blocks: suggestedBlocks(),
    closing: '',
    locked: false,
  };
}

function blockSignature(block: CurriculumBlock): string {
  return [
    block.kind,
    block.title.trim(),
    block.notes.trim(),
    block.expected.trim(),
    block.waterBreak ? '1' : '0',
    block.timing,
    block.clipId ?? '',
    block.treeId ?? '',
    block.kind === 'live' ? String(block.rounds) : '',
    block.recordReview ? 'review' : '',
    block.replayClip?.localId ?? '',
  ].join('\u0001');
}

export function curriculumHasContent(plan: CurriculumPlan): boolean {
  if (plan.coachName.trim() || plan.classDesignation.trim() || plan.classTime.trim() || plan.closing.trim() || plan.locked) {
    return true;
  }
  const fresh = SUGGESTED_KINDS;
  if (plan.blocks.length !== fresh.length) return true;
  return plan.blocks.some((block, index) => {
    if (block.kind !== fresh[index]) return true;
    const blank = createSuggestedBlock(block.kind as SuggestedKind);
    blank.kind = block.kind;
    return blockSignature(block) !== blockSignature({ ...blank, id: block.id, rounds: DEFAULT_LIVE_ROUNDS });
  });
}

function sanitizeBlock(value: unknown): { block: CurriculumBlock; repaired: boolean } {
  const raw = asRecord(value);
  let repaired = !raw;
  const idValue = raw && typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = idValue ? idValue.slice(0, 80) : createId('block');
  if (!idValue) repaired = true;
  const kind = raw && isKind(raw.kind) ? raw.kind : 'custom';
  if (!raw || raw.kind !== kind) repaired = true;
  const title = clampText(raw?.title, TECHNIQUE_TITLE_MAX);
  const notes = clampText(raw?.notes, TECHNIQUE_NOTES_MAX);
  const expected = normalizeExpectedDuration(clampText(raw?.expected, EXPECTED_MAX)).slice(0, EXPECTED_MAX);
  if (raw && (raw.title !== title || raw.notes !== notes || raw.expected !== expected)) repaired = true;
  if (raw && raw.waterBreak !== true && raw.waterBreak !== false) repaired = true;
  const timing: CurriculumTiming = raw?.timing === 'video' ? 'video' : raw?.timing === 'replay' ? 'replay' : 'timer';
  if (raw && raw.timing !== timing) repaired = true;
  let clipId: string | null = null;
  if (typeof raw?.clipId === 'string' && raw.clipId.trim()) clipId = raw.clipId.trim().slice(0, 80);
  else if (raw && raw.clipId != null && raw.clipId !== '') repaired = true;
  const mediaName = clampText(raw?.mediaName, 180);
  let treeId: string | undefined;
  if (raw && Object.prototype.hasOwnProperty.call(raw, 'treeId')) {
    if (typeof raw.treeId === 'string') {
      const trimmed = raw.treeId.trim().slice(0, 80);
      if (trimmed) treeId = trimmed;
      if (raw.treeId !== trimmed) repaired = true;
    } else if (raw.treeId != null) {
      repaired = true;
    }
  }
  const rounds = clampRounds(raw?.rounds);
  if (raw && raw.rounds !== rounds) repaired = true;
  const recordReview = blockOffersReviewToggle(kind) && raw?.recordReview === true;
  if (raw && raw.recordReview != null && raw.recordReview !== recordReview) repaired = true;
  let replayClip: ReplayClipRef | undefined;
  if (raw && raw.replayClip != null) {
    const cleaned = cleanClip(raw.replayClip);
    replayClip = cleaned.clip ?? undefined;
    if (!replayClip || cleaned.repaired) repaired = true;
  }
  return {
    repaired,
    block: {
      id,
      kind,
      title,
      notes,
      expected,
      waterBreak: raw?.waterBreak === true,
      timing,
      clipId,
      mediaName,
      rounds,
      ...(treeId ? { treeId } : {}),
      ...(recordReview ? { recordReview } : {}),
      ...(replayClip ? { replayClip } : {}),
    },
  };
}

function uniquifyBlocks(blocks: CurriculumBlock[]): boolean {
  const ids = new Set<string>();
  let changed = false;
  for (const block of blocks) {
    if (ids.has(block.id)) {
      block.id = createId('block');
      changed = true;
    }
    ids.add(block.id);
  }
  return changed;
}

export function sanitizeCurriculum(input: unknown): { plan: CurriculumPlan; repaired: boolean } {
  const raw = asRecord(input);
  let repaired = !raw || raw.version !== 1;
  const source = Array.isArray(raw?.blocks) ? raw.blocks : null;
  if (!source) repaired = true;
  const blocks = (source ?? []).slice(0, MAX_BLOCKS).map((item) => {
    const next = sanitizeBlock(item);
    if (next.repaired) repaired = true;
    return next.block;
  });
  if (source && source.length > MAX_BLOCKS) repaired = true;
  if (uniquifyBlocks(blocks)) repaired = true;
  const idRaw = raw && typeof raw.id === 'string' ? raw.id.trim() : '';
  const id = idRaw ? idRaw.slice(0, 80) : createId('curriculum');
  if (!idRaw || (raw && raw.id !== id)) repaired = true;
  const coachName = clampText(raw?.coachName, COACH_NAME_MAX);
  const classDesignation = clampText(raw?.classDesignation, CLASS_DESIGNATION_MAX);
  const classTime = clampText(raw?.classTime, CLASS_TIME_MAX);
  const closing = clampText(raw?.closing, CLOSING_MAX);
  const locked = raw?.locked === true;
  const closingSlot = cleanReviewSlot(raw?.closingReview);
  if (closingSlot.repaired) repaired = true;
  if (
    raw &&
    (raw.coachName !== coachName ||
      raw.classDesignation !== classDesignation ||
      raw.classTime !== classTime ||
      raw.closing !== closing ||
      (raw.locked !== true && raw.locked !== false))
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
      classTime,
      blocks,
      closing,
      ...(closingSlot.slot ? { closingReview: closingSlot.slot } : {}),
      locked,
    },
  };
}

export function copyCurriculum(source: CurriculumPlan): CurriculumPlan {
  const { plan: sanitized } = sanitizeCurriculum(source);
  const { closingReview: sourceClosing, ...plan } = sanitized;
  const closingReview = sourceClosing?.recordReview ? { recordReview: true } : undefined;
  return {
    ...plan,
    id: createId('curriculum'),
    locked: false,
    // Owner decision: a copy starts with no replay clips (mode and Record for Review stay).
    blocks: plan.blocks.map((block) => {
      const { replayClip: _clip, ...rest } = block;
      void _clip;
      return { ...rest, id: createId('block') };
    }),
    ...(closingReview ? { closingReview } : {}),
  };
}

export function moveBlock(plan: CurriculumPlan, id: string, direction: -1 | 1): CurriculumPlan {
  const index = plan.blocks.findIndex((block) => block.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= plan.blocks.length) return plan;
  const blocks = [...plan.blocks];
  const [item] = blocks.splice(index, 1);
  if (!item) return plan;
  blocks.splice(target, 0, item);
  return { ...plan, blocks };
}

export function removeBlock(plan: CurriculumPlan, id: string): CurriculumPlan {
  return { ...plan, blocks: plan.blocks.filter((block) => block.id !== id) };
}

export function insertBlockAfter(plan: CurriculumPlan, afterId: string): CurriculumPlan {
  if (plan.blocks.length >= MAX_BLOCKS) return plan;
  const index = plan.blocks.findIndex((block) => block.id === afterId);
  if (index < 0) return plan;
  const blocks = [...plan.blocks];
  blocks.splice(index + 1, 0, createCustomBlock());
  return { ...plan, blocks };
}

export function appendBlock(plan: CurriculumPlan): CurriculumPlan {
  if (plan.blocks.length >= MAX_BLOCKS) return plan;
  return { ...plan, blocks: [...plan.blocks, createCustomBlock()] };
}

function classFolderKey(designation: string): string {
  return designation.trim().toLowerCase();
}

export function curriculumBrowseFolders(archive: CurriculumArchive, todayKey: string): CurriculumFolder[] {
  const groups = new Map<string, { label: string; dates: Map<string, CurriculumPlan[]> }>();
  const dateKeys = Object.keys(archive.days)
    .filter((key) => isWithinRetention(key, todayKey))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

  for (const dateKey of dateKeys) {
    for (const plan of archive.days[dateKey]?.plans ?? []) {
      if (!curriculumHasContent(plan)) continue;
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

  const folders: CurriculumFolder[] = [];
  for (const [key, group] of groups) {
    const dates: CurriculumFolderDate[] = [];
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

export function curriculumRowLabel(plan: CurriculumPlan): string {
  const coach = plan.coachName.trim() || 'Coach';
  const designation = plan.classDesignation.trim();
  const time = plan.classTime.trim() || 'Time';
  return designation ? `${coach} / ${designation} / ${time}` : `${coach} · ${time}`;
}

export function curriculumListLabel(plan: CurriculumPlan): string {
  const coach = plan.coachName.trim();
  const designation = plan.classDesignation.trim();
  const time = plan.classTime.trim();
  if (!coach && !designation && !time) return 'New curriculum';
  return [coach || 'Coach', designation || 'Class', time || 'Time'].join(' / ');
}

export function plansOnCurriculumDay(archive: CurriculumArchive, dateKey: string): CurriculumPlan[] {
  return archive.days[dateKey]?.plans ?? [];
}

export type CurriculumPlanHit = {
  dateKey: string;
  planId: string;
  label: string;
};

/** Match coach, class, time, block text, or the date. Empty query matches nothing. */
export function searchCurriculumPlans(
  archive: CurriculumArchive,
  todayKey: string,
  query: string,
): CurriculumPlanHit[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits: CurriculumPlanHit[] = [];
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
        plan.closing,
        ...plan.blocks.flatMap((block) => [block.title, block.notes, block.mediaName]),
      ]
        .join('\n')
        .toLowerCase();
      if (!haystack.includes(needle)) continue;
      const designation = plan.classDesignation.trim();
      const who = plan.coachName.trim() || 'Coach';
      const time = plan.classTime.trim() || 'Time';
      const row = designation ? `${who} / ${designation} / ${time}` : `${who} · ${time}`;
      hits.push({
        dateKey,
        planId: plan.id,
        label: `${planDayStamp(dateKey)} · ${row}`,
      });
    }
  }
  return hits;
}

/** Clip ids saved on any curriculum day. Daily Training must not treat these as spare lesson clips. */
export function curriculumReferencedClipIds(archive: CurriculumArchive): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const day of Object.values(archive.days)) {
    for (const plan of day.plans) {
      for (const block of plan.blocks) {
        if (!block.clipId || seen.has(block.clipId)) continue;
        seen.add(block.clipId);
        ids.push(block.clipId);
      }
    }
  }
  return ids;
}

/** Point one curriculum card at a Daily Training clip, or clear it. */
export function writeCurriculumBlockClip(
  blockId: string,
  clipId: string | null,
  mediaName: string,
  today = localDateKey(),
): CurriculumPlan | null {
  const archive = loadCurriculumArchive(today);
  for (const [dateKey, day] of Object.entries(archive.days)) {
    const plan = day.plans.find((item) => item.blocks.some((block) => block.id === blockId));
    if (!plan) continue;
    const next: CurriculumPlan = {
      ...plan,
      blocks: plan.blocks.map((block) =>
        block.id === blockId ? { ...block, clipId, mediaName: clipId ? mediaName : '' } : block,
      ),
    };
    return saveCurriculum(dateKey, next, today).plan;
  }
  return null;
}

export function findCurriculumById(archive: CurriculumArchive, planId: string): CurriculumPlan | null {
  for (const day of Object.values(archive.days)) {
    const found = day.plans.find((plan) => plan.id === planId);
    if (found) return found;
  }
  return null;
}

function uniquifyPlanIds(plans: CurriculumPlan[]): boolean {
  const ids = new Set<string>();
  let changed = false;
  for (const plan of plans) {
    if (!plan.id || ids.has(plan.id)) {
      plan.id = createId('curriculum');
      changed = true;
    }
    ids.add(plan.id);
  }
  return changed;
}

function readDayPlans(value: unknown): { plans: CurriculumPlan[]; repaired: boolean } | null {
  const raw = asRecord(value);
  if (!raw || !Array.isArray(raw.plans)) return null;
  let repaired = false;
  const plans: CurriculumPlan[] = [];
  for (const item of raw.plans) {
    const next = sanitizeCurriculum(item);
    if (next.repaired) repaired = true;
    if (!curriculumHasContent(next.plan)) {
      repaired = true;
      continue;
    }
    plans.push(next.plan);
  }
  if (uniquifyPlanIds(plans)) repaired = true;
  return { plans, repaired };
}

function pruneDays(days: Record<string, CurriculumDay>, todayKey: string): Record<string, CurriculumDay> {
  const next: Record<string, CurriculumDay> = {};
  for (const [key, day] of Object.entries(days)) {
    if (!isWithinRetention(key, todayKey, PLAN_RETENTION_DAYS)) continue;
    const plans = day.plans.filter(curriculumHasContent);
    if (!plans.length) continue;
    next[key] = plans.length === day.plans.length ? day : { plans };
  }
  return next;
}

function writeArchive(archive: CurriculumArchive): CurriculumArchive | null {
  try {
    localStorage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(archive));
    return archive;
  } catch {
    return null;
  }
}

export function loadCurriculumArchive(today = localDateKey()): CurriculumArchive {
  let archive: CurriculumArchive = { version: 1, days: {} };
  let rewrite = false;
  try {
    const raw = localStorage.getItem(CURRICULUM_STORAGE_KEY);
    if (typeof raw === 'string' && raw.trim()) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = null;
      }
      const record = asRecord(parsed);
      if (record && record.days && typeof record.days === 'object' && !Array.isArray(record.days)) {
        if (record.version !== 1) rewrite = true;
        const days: Record<string, CurriculumDay> = {};
        for (const [key, value] of Object.entries(record.days as Record<string, unknown>)) {
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
        const pruned = pruneDays(days, today);
        if (Object.keys(pruned).length !== Object.keys(days).length) rewrite = true;
        archive = { version: 1, days: pruned };
      } else {
        rewrite = true;
      }
    }
  } catch {
    archive = { version: 1, days: {} };
  }
  if (rewrite) writeArchive(archive);
  return archive;
}

export function saveCurriculum(
  dateKey: string,
  plan: CurriculumPlan,
  today = localDateKey(),
): { archive: CurriculumArchive; plan: CurriculumPlan } {
  const loaded = loadCurriculumArchive(today);
  const { plan: clean } = sanitizeCurriculum(plan);
  const days = { ...loaded.days };
  const existing = days[dateKey]?.plans ?? [];
  if (curriculumHasContent(clean) && isWithinRetention(dateKey, today)) {
    const index = existing.findIndex((item) => item.id === clean.id);
    const plans = index >= 0 ? existing.map((item, i) => (i === index ? clean : item)) : [...existing, clean];
    days[dateKey] = { plans };
  } else {
    const plans = existing.filter((item) => item.id !== clean.id);
    if (plans.length) days[dateKey] = { plans };
    else delete days[dateKey];
  }
  const archive: CurriculumArchive = { version: 1, days: pruneDays(days, today) };
  return { archive: writeArchive(archive) ?? archive, plan: clean };
}

export function removeCurriculumPlan(
  dateKey: string,
  planId: string,
  today = localDateKey(),
): CurriculumArchive {
  const loaded = loadCurriculumArchive(today);
  const days = { ...loaded.days };
  const plans = (days[dateKey]?.plans ?? []).filter((item) => item.id !== planId);
  if (plans.length) days[dateKey] = { plans };
  else delete days[dateKey];
  const archive: CurriculumArchive = { version: 1, days: pruneDays(days, today) };
  return writeArchive(archive) ?? archive;
}
