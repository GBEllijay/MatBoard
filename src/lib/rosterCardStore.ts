/**
 * Coach Clipboard roster card, saved on the coach's device.
 * A side store keyed by roster student id. `matboard.roster.v1` is not changed,
 * so older roster saves load exactly as before. No migration.
 *
 * Private coach notes live under their own key. No sync payload, packet, or
 * export file reads that key. See `rosterCardSync.ts` and `lockedExport.ts`.
 */

import type { AssessmentEntry } from './studentAssessment.ts';
import type { BeltBook, ProgressBelt, RubricCheckpoint, StudentRank, TrainingStyle } from './progress/types.ts';

export const ROSTER_CARD_KEY = 'matboard.rosterCard.v1';
export const ROSTER_CARD_PRIVATE_KEY = 'matboard.rosterCard.private.v1';
export const ROSTER_CARD_EVENT = 'matboard-roster-card';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_MAX = 6;
const ASSESS_MAX = 60;
const NOTE_MAX = 4000;

/** A card image. Every image needs head coach approval. Student uploads also need a parent when the gate is on. */
export type CardPhoto = {
  id: string;
  src: string;
  from: 'coach' | 'student';
  addedAt: number;
  parent: 'not-needed' | 'pending' | 'approved';
  coach: 'pending' | 'approved' | 'rejected';
};

/** Coach copy of the belt dates, kept when the coach saves a belt or stripe from the roster editor. */
export type CoachRankLog = {
  belt: string;
  awardedOn: string;
  /** One date per stripe on this belt, in order. Empty string is a stripe saved with no date. */
  stripeDates: string[];
};

/** What the student's Student Edition file said, from an import or the sync layer. Never overwrites coach fields. */
export type StudentSnapshot = {
  importedAt: number;
  studentId: string;
  belt: ProgressBelt;
  rank: StudentRank;
  beltBook?: BeltBook;
  trainingStyle?: TrainingStyle;
  startedOn?: string;
  /** Current-belt checkpoints with the student's own marks. */
  checkpoints: RubricCheckpoint[];
};

export type SentCardUpdate = {
  updateId: string;
  type: 'note' | 'assessment';
  /** Training day for a note, assessment id for an assessment. */
  ref: string;
  issuedAt: number;
  via: 'cloud' | 'file';
};

export type RosterCardRecord = {
  trainingStartedOn: string;
  trainingStyle: TrainingStyle | '';
  coachRank?: CoachRankLog;
  photos: CardPhoto[];
  shownPhotoId: string;
  coachAssessments: AssessmentEntry[];
  /** Checkpoint id → the coach confirmed it. */
  benchmarkChecks: Record<string, boolean>;
  /** Sync with student app. Benchmarks only. Notes and assessments never ride on this. */
  benchmarkSync: boolean;
  /** Training notes & suggestions. Sent only by the explicit Send button. */
  trainingNotes: string;
  sent: SentCardUpdate[];
  snapshot?: StudentSnapshot;
  /** Add to Competitor Roster. Turning it off keeps the competitor card and its history. */
  competitorOn: boolean;
  /** The separate Competitor Roster card made from this student card. */
  competitorCardId: string;
  updatedAt: number;
};

export type RosterCardSettings = {
  /** Student-uploaded card photos wait for a parent first. */
  parentPhotoGate: boolean;
};

type CardFile = { cards: Record<string, RosterCardRecord>; settings: RosterCardSettings };

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function emptyCardRecord(): RosterCardRecord {
  return {
    trainingStartedOn: '',
    trainingStyle: '',
    photos: [],
    shownPhotoId: '',
    coachAssessments: [],
    benchmarkChecks: {},
    benchmarkSync: false,
    trainingNotes: '',
    sent: [],
    competitorOn: false,
    competitorCardId: '',
    updatedAt: 0,
  };
}

function defaultStorage(): MemoryStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function emit(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') {
    window.dispatchEvent(new Event(ROSTER_CARD_EVENT));
  }
}

function cleanRecord(value: unknown): RosterCardRecord {
  const base = emptyCardRecord();
  if (!value || typeof value !== 'object') return base;
  const row = value as Partial<RosterCardRecord>;
  const style = row.trainingStyle;
  return {
    ...base,
    trainingStartedOn: typeof row.trainingStartedOn === 'string' && DATE_RE.test(row.trainingStartedOn) ? row.trainingStartedOn : '',
    trainingStyle: style === 'gi' || style === 'nogi' || style === 'both' ? style : '',
    ...(row.coachRank && typeof row.coachRank.belt === 'string'
      ? {
          coachRank: {
            belt: row.coachRank.belt,
            awardedOn: typeof row.coachRank.awardedOn === 'string' ? row.coachRank.awardedOn : '',
            stripeDates: Array.isArray(row.coachRank.stripeDates)
              ? row.coachRank.stripeDates.map((d) => (typeof d === 'string' ? d : '')).slice(0, 12)
              : [],
          },
        }
      : {}),
    photos: Array.isArray(row.photos) ? row.photos.filter((p) => p && typeof p.src === 'string' && typeof p.id === 'string').slice(-PHOTO_MAX) : [],
    shownPhotoId: typeof row.shownPhotoId === 'string' ? row.shownPhotoId : '',
    coachAssessments: Array.isArray(row.coachAssessments) ? row.coachAssessments.slice(-ASSESS_MAX) : [],
    benchmarkChecks: row.benchmarkChecks && typeof row.benchmarkChecks === 'object' ? { ...row.benchmarkChecks } : {},
    benchmarkSync: row.benchmarkSync === true,
    trainingNotes: typeof row.trainingNotes === 'string' ? row.trainingNotes.slice(0, NOTE_MAX) : '',
    sent: Array.isArray(row.sent) ? row.sent.slice(-100) : [],
    ...(row.snapshot && typeof row.snapshot === 'object' ? { snapshot: row.snapshot } : {}),
    competitorOn: row.competitorOn === true,
    competitorCardId: typeof row.competitorCardId === 'string' ? row.competitorCardId : '',
    updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : 0,
  };
}

function readFile(storage: Pick<MemoryStore, 'getItem'> | null): CardFile {
  const empty: CardFile = { cards: {}, settings: { parentPhotoGate: true } };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(ROSTER_CARD_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<CardFile>;
    const cards: Record<string, RosterCardRecord> = {};
    for (const [id, row] of Object.entries(parsed.cards ?? {})) cards[id] = cleanRecord(row);
    return { cards, settings: { parentPhotoGate: parsed.settings?.parentPhotoGate !== false } };
  } catch {
    return empty;
  }
}

function writeFile(storage: MemoryStore, file: CardFile): void {
  storage.setItem(ROSTER_CARD_KEY, JSON.stringify(file));
  emit();
}

export function readRosterCard(rosterId: string, storage: Pick<MemoryStore, 'getItem'> | null = defaultStorage()): RosterCardRecord {
  return readFile(storage).cards[rosterId] ?? emptyCardRecord();
}

export function readRosterCardSettings(storage: Pick<MemoryStore, 'getItem'> | null = defaultStorage()): RosterCardSettings {
  return readFile(storage).settings;
}

export function writeRosterCardSettings(settings: RosterCardSettings, storage: MemoryStore | null = defaultStorage()): void {
  if (!storage) return;
  const file = readFile(storage);
  writeFile(storage, { ...file, settings: { parentPhotoGate: settings.parentPhotoGate !== false } });
}

export function updateRosterCard(
  rosterId: string,
  change: (record: RosterCardRecord) => RosterCardRecord,
  storage: MemoryStore | null = defaultStorage(),
  now = Date.now(),
): RosterCardRecord {
  if (!storage) return change(emptyCardRecord());
  const file = readFile(storage);
  const next = cleanRecord({ ...change(file.cards[rosterId] ?? emptyCardRecord()), updatedAt: now });
  writeFile(storage, { ...file, cards: { ...file.cards, [rosterId]: next } });
  return next;
}

export function removeRosterCard(rosterId: string, storage: MemoryStore | null = defaultStorage()): void {
  if (!storage) return;
  const file = readFile(storage);
  if (!file.cards[rosterId]) return;
  const cards = { ...file.cards };
  delete cards[rosterId];
  writeFile(storage, { ...file, cards });
  const notes = readPrivateNotesFile(storage);
  if (rosterId in notes) {
    delete notes[rosterId];
    storage.setItem(ROSTER_CARD_PRIVATE_KEY, JSON.stringify(notes));
  }
}

export function subscribeRosterCards(fn: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => {
    if (event.key === ROSTER_CARD_KEY || event.key === ROSTER_CARD_PRIVATE_KEY) fn();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(ROSTER_CARD_EVENT, fn);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(ROSTER_CARD_EVENT, fn);
  };
}

function readPrivateNotesFile(storage: Pick<MemoryStore, 'getItem'> | null): Record<string, string> {
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(ROSTER_CARD_PRIVATE_KEY) ?? '{}') as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, text] of Object.entries(parsed)) if (typeof text === 'string') out[id] = text;
    return out;
  } catch {
    return {};
  }
}

/** Private coach notes. Coach device only. Never sent, synced, or exported. */
export function readPrivateCoachNotes(rosterId: string, storage: Pick<MemoryStore, 'getItem'> | null = defaultStorage()): string {
  return readPrivateNotesFile(storage)[rosterId] ?? '';
}

export function writePrivateCoachNotes(rosterId: string, text: string, storage: MemoryStore | null = defaultStorage()): void {
  if (!storage) return;
  const notes = readPrivateNotesFile(storage);
  const clean = text.slice(0, NOTE_MAX);
  if (clean) notes[rosterId] = clean;
  else delete notes[rosterId];
  storage.setItem(ROSTER_CARD_PRIVATE_KEY, JSON.stringify(notes));
  emit();
}

/**
 * Keep the coach copy of the belt dates after a roster editor save.
 * A new belt starts a new log on the promotion date. More stripes add dates.
 * Fewer stripes drop the last dates. Nothing else on the card changes.
 */
export function nextCoachRankLog(
  before: { belt: string; stripes?: number; lastPromotion: string },
  saved: { belt: string; stripes?: number; lastPromotion: string },
  log: CoachRankLog | undefined,
  today: string,
): CoachRankLog | undefined {
  const beforeStripes = Math.max(0, before.stripes ?? 0);
  const savedStripes = Math.max(0, saved.stripes ?? 0);
  const dated = DATE_RE.test(saved.lastPromotion) ? saved.lastPromotion : today;
  const promotionChanged = saved.lastPromotion !== before.lastPromotion && DATE_RE.test(saved.lastPromotion);
  if (saved.belt !== before.belt) {
    return { belt: saved.belt, awardedOn: dated, stripeDates: Array.from({ length: savedStripes }, () => '') };
  }
  const current: CoachRankLog = log && log.belt === saved.belt
    ? { ...log, stripeDates: [...log.stripeDates] }
    : {
        belt: saved.belt,
        awardedOn: beforeStripes === 0 && DATE_RE.test(before.lastPromotion) ? before.lastPromotion : '',
        stripeDates: Array.from({ length: beforeStripes }, () => ''),
      };
  if (savedStripes > beforeStripes) {
    while (current.stripeDates.length < beforeStripes) current.stripeDates.push('');
    current.stripeDates = current.stripeDates.slice(0, beforeStripes);
    for (let i = beforeStripes; i < savedStripes; i += 1) current.stripeDates.push(promotionChanged ? saved.lastPromotion : today);
    return current;
  }
  if (savedStripes < beforeStripes) {
    current.stripeDates = current.stripeDates.slice(0, savedStripes);
    return current;
  }
  if (!promotionChanged) return log;
  // Same belt and stripes, new promotion date: it dates the belt, or the latest stripe.
  if (savedStripes === 0) current.awardedOn = saved.lastPromotion;
  else current.stripeDates[savedStripes - 1] = saved.lastPromotion;
  return current;
}

export function recordRosterRankChange(
  rosterId: string,
  before: { belt: string; stripes?: number; lastPromotion: string },
  saved: { belt: string; stripes?: number; lastPromotion: string },
  storage: MemoryStore | null = defaultStorage(),
  today = new Date().toISOString().slice(0, 10),
): void {
  if (!storage) return;
  if (before.belt === saved.belt && (before.stripes ?? 0) === (saved.stripes ?? 0) && before.lastPromotion === saved.lastPromotion) return;
  const current = readRosterCard(rosterId, storage);
  const log = nextCoachRankLog(before, saved, current.coachRank, today);
  if (!log) return;
  updateRosterCard(rosterId, (record) => ({ ...record, coachRank: log }), storage);
}

/**
 * Sync with student app. One action, used by the card toggle and by the Add student offer.
 * Shares benchmarks only. Notes and assessments still need their own Send.
 */
export function setStudentAppSync(rosterId: string, on: boolean, storage: MemoryStore | null = defaultStorage()): RosterCardRecord {
  return updateRosterCard(rosterId, (record) => ({ ...record, benchmarkSync: on }), storage);
}
