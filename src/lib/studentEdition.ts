/**
 * Local Student Edition journal. The file on this device is a student progress
 * report from src/lib/progress. Nothing here is sent to a server.
 */

import { beltModeOf, ibjjfAge, withBeltTemplate } from './beltBook.ts';
import { fundamentalLevelOf, FUNDAMENTAL_LIVE_LEVEL, isFundamentalLevel, type FundamentalLevel } from './fundamentals.ts';
import { ageIllegalTechniques, defaultTechniquePolicy } from './studentBenchmarks.ts';
import { joinJournalNotes, splitJournalNotes } from './journalNotes.ts';
import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { emptyCompetition, matchingGameTags } from './progress/competition.ts';
import { emptyRank } from './studentRank.ts';
import {
  beginAppStudentSave,
  endAppStudentSave,
  isSimulatedStudentPayload,
  noteAppStudentSave,
  notifyStudentJournal,
  studentDemoRequested,
} from './studentDemo.ts';
import { clearStudentEditionRelock, isStudentEditionRelocked, isStudentEditionUnlocked } from './studentUnlock.ts';
import { exportProgressPacket, parseProgressPacket, searchJournal, searchJournalClips, techniqueDrilledLabel } from './progress/format.ts';
import { shareTournaments } from './sharedTournaments.ts';
import {
  PROGRESS_CLIP_URL_MAX,
  PROGRESS_CLIPS_MAX,
  GAME_TAGS,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  type GameTag,
  type JournalClip,
  type JournalEntry,
  type StudentChecklistEntry,
  type StudentProgressReport,
  type TechniquePolicy,
  type TechniqueRef,
  type TrainingStyle,
} from './progress/types.ts';

export const STUDENT_EDITION_STORAGE_KEY = 'matboard.studentEdition.v1';

/** Blank technique rows on a new journal page. A saved card keeps the rows it stored. */
export const JOURNAL_TECHNIQUE_ROWS = 3;

/** Filled techniques a new card will keep. The progress file accepts up to 20. */
export const JOURNAL_TECHNIQUE_MAX = 12;

export { techniqueDrilledLabel };

/** Must match the server product metadata for Student Edition (`API_PRODUCT_STUDENT`). */
export const STUDENT_PRODUCT_ID = 'advantage-student';

/** This browser finished a Student Edition Checkout. Not an owner code. */
export const STUDENT_PURCHASE_STORAGE_KEY = 'advantage.studentUnlocked';

export function isStudentPurchased(): boolean {
  try {
    return localStorage.getItem(STUDENT_PURCHASE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setStudentPurchased(purchased: boolean): void {
  try {
    if (purchased) localStorage.setItem(STUDENT_PURCHASE_STORAGE_KEY, '1');
    else localStorage.removeItem(STUDENT_PURCHASE_STORAGE_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  if (purchased) clearStudentEditionRelock();
}

/** A completed Student Edition Checkout unlocks this device. A White or Pro purchase does not. */
export function rememberStudentPurchase(status: { entitled?: boolean; product?: string }): boolean {
  if (status.entitled === true && status.product === STUDENT_PRODUCT_ID) {
    setStudentPurchased(true);
    return true;
  }
  return false;
}

/** Stripe success return for `/buy/student`. The page can render before the alpha door is open. */
export function studentPurchaseReturn(search: URLSearchParams): boolean {
  const sessionId = search.get('session_id')?.trim() ?? '';
  return search.get('checkout') === 'success' && sessionId.length > 0;
}

export const JOURNAL_CLASS_PLACEHOLDER = 'Fundamentals, week 7, class B';

/** Older cards stored Gi or No-Gi. A new card keeps whatever the student types. */
export function migrateClassText(value: string): string {
  const text = value.trim();
  const lower = text.toLowerCase();
  if (lower === 'gi') return 'Gi';
  if (lower === 'no-gi' || lower === 'nogi' || lower === 'no gi') return 'No-Gi';
  return text.slice(0, PROGRESS_NAME_MAX);
}

export type JournalDraft = {
  date: string;
  className: string;
  gameTag: GameTag | '';
  techniques: TechniqueRef[];
  partners: string;
  drills: string;
  rolls: string;
  /** What you drilled and what to remember. Older cards stored this with stop-doing notes. */
  notes: string;
  /**
   * Mistakes to stop making. Omitted on older cards.
   * A missing value is empty. Text that lived in `notes` is still read from there.
   */
  stopDoing?: string;
};

export type JournalCardView = JournalDraft & {
  id: string;
  amendments: JournalEntry['amendments'];
  createdAt: number;
};

export type FundamentalRow = {
  /** Checklist row id once the line has been saved. Empty until then. */
  entryId: string;
  catalogItemId: string;
  categoryId: string;
  /** Canonical name. Catalog name, or the name first typed for a custom line. */
  name: string;
  /** Name drawn on the page. A rename override, or `name` when there is none. */
  label: string;
  learnedOn: string;
  /** 0–5 proficiency. Older rows derive this from the learned date. */
  level: FundamentalLevel;
  note: string;
  /** Milliseconds, or 0 when this line has never been saved. */
  updatedAt: number;
  custom: boolean;
};

export type FundamentalsCategoryView = {
  id: string;
  name: string;
  learned: number;
  items: FundamentalRow[];
};

type MemoryStore = Pick<Storage, 'getItem' | 'setItem'>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function studentEditionOpen(
  search: URLSearchParams,
  owner: { pro: boolean; coach: boolean; white: boolean; student?: boolean },
): boolean {
  // Preview query still opens, including after the hub lock button.
  if (search.get('student') === '1') return true;
  // The hub lock closes the door even when Pro is already stored here.
  if (isStudentEditionRelocked()) return false;
  // `student` is the subscribed snapshot from useStudentEditionUnlocked.
  // The storage read covers callers that have not passed that snapshot yet.
  if (owner.student || isStudentEditionUnlocked()) return true;
  if (isStudentPurchased()) return true;
  // Pro alone opens Student Edition. Coach and White are not required.
  return owner.pro;
}

export function blankStudentReport(now = Date.now()): StudentProgressReport {
  return {
    schemaVersion: 2,
    kind: 'student-progress-report',
    id: 'student-local',
    studentId: 'student-local',
    updatedAt: now,
    profile: {
      id: 'student-local',
      displayName: '',
      gymName: '',
      belt: 'white',
      startedOn: '',
      licenseSource: '',
    },
    rubric: { id: 'rubric-local', levels: [] },
    checklist: [],
    journal: [],
    calendar: [],
    goals: [],
    competition: emptyCompetition(),
    rank: emptyRank(),
  };
}

export function loadStudentReport(storage: Pick<Storage, 'getItem'> & { removeItem?: (key: string) => void }): StudentProgressReport {
  const raw = storage.getItem(STUDENT_EDITION_STORAGE_KEY);
  if (!raw) return blankStudentReport();
  if (!studentDemoRequested() && isSimulatedStudentPayload(raw)) {
    storage.removeItem?.(STUDENT_EDITION_STORAGE_KEY);
    return blankStudentReport();
  }
  const parsed = parseProgressPacket(raw);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return blankStudentReport();
  return withBeltTemplate(shareTournaments(parsed.value));
}

export function saveStudentReport(storage: MemoryStore, report: StudentProgressReport): StudentProgressReport {
  let shared = withBeltTemplate(shareTournaments(report));
  let text = exportProgressPacket(shared);
  if (!studentDemoRequested() && isSimulatedStudentPayload(text)) {
    shared = blankStudentReport(shared.updatedAt);
    text = exportProgressPacket(shared);
  }
  const parsed = parseProgressPacket(text);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') {
    const errors = parsed.ok ? ['Student Edition file was not a progress report.'] : parsed.errors;
    throw new Error(errors.join(' '));
  }
  beginAppStudentSave();
  try {
    storage.setItem(STUDENT_EDITION_STORAGE_KEY, text);
    noteAppStudentSave(text);
  } finally {
    endAppStudentSave();
  }
  notifyStudentJournal();
  return shareTournaments(parsed.value);
}

function isCalendarDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Name, gym, and start date on the progress file. Belt and license stay as they are. */
export function setStudentProfile(
  report: StudentProgressReport,
  patch: { displayName?: string; gymName?: string; startedOn?: string },
  now = Date.now(),
): StudentProgressReport {
  const displayName = patch.displayName === undefined ? report.profile.displayName : patch.displayName.trim().slice(0, PROGRESS_NAME_MAX);
  const gymName = patch.gymName === undefined ? report.profile.gymName : patch.gymName.trim().slice(0, PROGRESS_NAME_MAX);
  const startedOn = patch.startedOn === undefined ? report.profile.startedOn : patch.startedOn.trim();
  if (startedOn && !isCalendarDate(startedOn)) throw new Error('Start date must be YYYY-MM-DD.');
  if (displayName === report.profile.displayName && gymName === report.profile.gymName && startedOn === report.profile.startedOn) {
    return report;
  }
  return { ...report, updatedAt: now, profile: { ...report.profile, displayName, gymName, startedOn } };
}

const POLICY_KEYS = ['straightAnkleLock', 'wristLocks', 'legLocks', 'heelHooks', 'competition'] as const;

function samePolicy(left: TechniquePolicy | undefined, right: TechniquePolicy | undefined): boolean {
  return POLICY_KEYS.every((key) => left?.[key] === right?.[key]);
}

/**
 * Gi, no-gi, or both.
 * A missing value is Both for an adult and Gi for a kid.
 * Choosing that default leaves the field off, unless it was already saved on purpose.
 */
export function setTrainingStyle(report: StudentProgressReport, style: TrainingStyle, now = Date.now()): StudentProgressReport {
  if (style !== 'gi' && style !== 'nogi' && style !== 'both') throw new Error('Training style must be gi, no-gi, or both.');
  const implicit: TrainingStyle = beltModeOf(report) === 'kids' ? 'gi' : 'both';
  const profile = { ...report.profile };
  if (style === implicit) {
    if (report.profile.trainingStyle === style) return report;
    delete profile.trainingStyle;
  } else {
    profile.trainingStyle = style;
  }
  if (report.profile.trainingStyle === profile.trainingStyle) return report;
  return { ...report, updatedAt: now, profile };
}

/**
 * Save one technique override.
 * A value that matches the age and belt default is left off the file.
 */
export function setTechniquePolicy(
  report: StudentProgressReport,
  key: keyof TechniquePolicy,
  value: boolean,
  now = Date.now(),
): StudentProgressReport {
  const year = report.beltBook?.birthYear;
  const age = typeof year === 'number' ? ibjjfAge(year) : null;
  const defaults = defaultTechniquePolicy(report.profile.belt, age, beltModeOf(report));
  const next: TechniquePolicy = { ...(report.profile.techniquePolicy ?? {}) };
  if (value === defaults[key]) delete next[key];
  else next[key] = value;
  const profile = { ...report.profile };
  if (Object.keys(next).length) profile.techniquePolicy = next;
  else delete profile.techniquePolicy;
  if (samePolicy(report.profile.techniquePolicy, profile.techniquePolicy)) return report;
  return { ...report, updatedAt: now, profile };
}

export function encodeJournalBody(draft: Pick<JournalDraft, 'className' | 'techniques' | 'partners' | 'drills' | 'rolls' | 'notes' | 'stopDoing'>): string {
  const techniques = draft.techniques.map((item) => item.name.trim()).filter(Boolean);
  return [
    `Class: ${migrateClassText(draft.className)}`,
    ...techniques.map((name, index) => `${techniqueDrilledLabel(index)}: ${name}`),
    `Techniques: ${techniques.join('; ')}`,
    `Training partners: ${draft.partners.trim()}`,
    `Drills: ${draft.drills.trim()}`,
    `Rolls: ${draft.rolls.trim()}`,
    'Notes:',
    joinJournalNotes(draft.notes, draft.stopDoing ?? ''),
  ].join('\n');
}

export function decodeJournalBody(body: string): Pick<JournalDraft, 'className' | 'partners' | 'drills' | 'rolls' | 'notes' | 'stopDoing'> {
  const lines = body.split('\n');
  const take = (prefix: string) => {
    const line = lines.find((row) => row.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : '';
  };
  const notesAt = lines.findIndex((row) => row === 'Notes:' || row.startsWith('Notes:'));
  const rawNotes = notesAt >= 0 ? lines.slice(notesAt + 1).join('\n') : body;
  const split = splitJournalNotes(rawNotes);
  return {
    className: migrateClassText(take('Class:')),
    partners: take('Training partners:'),
    drills: take('Drills:'),
    rolls: take('Rolls:'),
    notes: split.notes,
    stopDoing: split.stopDoing,
  };
}

export function viewJournalEntry(entry: JournalEntry): JournalCardView {
  const decoded = decodeJournalBody(entry.body);
  return {
    id: entry.id,
    date: entry.date,
    className: decoded.className,
    gameTag: entry.gameTag,
    techniques: entry.techniqueRefs.map((item) => ({ id: item.id, name: item.name })),
    partners: decoded.partners,
    drills: decoded.drills,
    rolls: decoded.rolls,
    notes: decoded.notes,
    stopDoing: decoded.stopDoing,
    amendments: entry.amendments,
    createdAt: entry.createdAt,
  };
}

function newId(prefix: string, now: number): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}.${now.toString(36)}.${rand}`;
}

function techniqueId(name: string, now: number, index: number): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `free.${slug || 'technique'}.${index}.${now.toString(36)}`;
}

export function createJournalEntry(draft: JournalDraft, now = Date.now()): JournalEntry {
  if (!DATE_RE.test(draft.date)) throw new Error('Date must be YYYY-MM-DD.');
  const techniques = draft.techniques
    .map((item, index) => ({
      id: item.id.trim() || techniqueId(item.name, now, index),
      name: item.name.trim(),
    }))
    .filter((item) => item.name)
    .slice(0, JOURNAL_TECHNIQUE_MAX);
  return {
    id: newId('card', now),
    date: draft.date,
    gameTag: (GAME_TAGS as readonly string[]).includes(draft.gameTag) ? draft.gameTag : '',
    body: encodeJournalBody({ ...draft, techniques }),
    techniqueRefs: techniques,
    amendments: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function addJournalEntry(report: StudentProgressReport, draft: JournalDraft, now = Date.now()): StudentProgressReport {
  const entry = createJournalEntry(draft, now);
  return {
    ...report,
    updatedAt: now,
    journal: [...report.journal, entry],
  };
}

/** Replace one card’s text. The id, later notes, and the day it was first saved stay. */
export function updateJournalEntry(
  report: StudentProgressReport,
  entryId: string,
  draft: JournalDraft,
  now = Date.now(),
): StudentProgressReport {
  const index = report.journal.findIndex((entry) => entry.id === entryId);
  if (index < 0) return report;
  const current = report.journal[index];
  const stopDoing = draft.stopDoing === undefined ? viewJournalEntry(current).stopDoing : draft.stopDoing;
  const next = createJournalEntry({ ...draft, stopDoing, gameTag: draft.gameTag || current.gameTag }, now);
  const journal = report.journal.slice();
  journal[index] = {
    ...next,
    id: current.id,
    amendments: current.amendments,
    createdAt: current.createdAt,
    updatedAt: now,
  };
  return { ...report, updatedAt: now, journal };
}

/** Remove one card. Later notes on that card go with it. Other cards stay. */
export function deleteJournalEntry(report: StudentProgressReport, entryId: string, now = Date.now()): StudentProgressReport {
  if (!report.journal.some((entry) => entry.id === entryId)) return report;
  return { ...report, updatedAt: now, journal: report.journal.filter((entry) => entry.id !== entryId) };
}

/** Append a dated note. The original card text, techniques, and date stay as saved. */
export function addJournalAmendment(
  report: StudentProgressReport,
  entryId: string,
  body: string,
  date: string,
  now = Date.now(),
): StudentProgressReport {
  const text = body.trim();
  if (!text) return report;
  if (!DATE_RE.test(date)) throw new Error('Amendment date must be YYYY-MM-DD.');
  let found = false;
  const journal = report.journal.map((entry) => {
    if (entry.id !== entryId) return entry;
    found = true;
    return {
      ...entry,
      amendments: [
        ...entry.amendments,
        { id: newId('amend', now), date, body: text, createdAt: now },
      ],
    };
  });
  if (!found) return report;
  return { ...report, updatedAt: now, journal };
}

export function searchStudentJournal(report: StudentProgressReport, query: string): JournalEntry[] {
  const newest = [...report.journal].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const needle = query.trim().toLowerCase();
  if (!needle) return newest;
  const tags = new Set(matchingGameTags(report.competition, query));
  return newest.filter((entry) => (entry.gameTag !== '' && tags.has(entry.gameTag)) || searchJournal([entry], query).length > 0);
}

export function searchStudentClips(report: StudentProgressReport, query: string): JournalClip[] {
  return searchJournalClips(report.clips ?? [], query);
}

function clipDraftError(url: string, description: string): string {
  const link = url.trim();
  const note = description.trim();
  if (!link) return 'Add an http or https link.';
  if (link.length > PROGRESS_CLIP_URL_MAX) return `That link is longer than ${PROGRESS_CLIP_URL_MAX} characters.`;
  let parsed: URL;
  try {
    parsed = new URL(link);
  } catch {
    return 'Use an http or https link.';
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return 'Use an http or https link.';
  if (!note) return 'Add the technique or drill.';
  if (note.length > PROGRESS_NOTE_MAX) return `That note is longer than ${PROGRESS_NOTE_MAX} characters.`;
  return '';
}

export function addJournalClip(
  report: StudentProgressReport,
  url: string,
  description: string,
  now = Date.now(),
): StudentProgressReport {
  const error = clipDraftError(url, description);
  if (error) throw new Error(error);
  if ((report.clips?.length ?? 0) >= PROGRESS_CLIPS_MAX) throw new Error('The clip clipboard is full.');
  const clip: JournalClip = {
    id: newId('clip', now),
    url: url.trim(),
    description: description.trim(),
    note: '',
    createdAt: now,
    updatedAt: now,
  };
  return { ...report, updatedAt: now, clips: [...(report.clips ?? []), clip] };
}

export function updateJournalClip(
  report: StudentProgressReport,
  id: string,
  url: string,
  description: string,
  now = Date.now(),
): StudentProgressReport {
  if (!report.clips?.some((clip) => clip.id === id)) return report;
  const error = clipDraftError(url, description);
  if (error) throw new Error(error);
  return {
    ...report,
    updatedAt: now,
    clips: report.clips.map((clip) =>
      clip.id === id
        ? { ...clip, url: url.trim(), description: description.trim(), note: clip.note ?? '', updatedAt: now }
        : clip,
    ),
  };
}

export function setClipNote(
  report: StudentProgressReport,
  id: string,
  note: string,
  now = Date.now(),
): StudentProgressReport {
  const text = note.slice(0, PROGRESS_NOTE_MAX);
  const current = report.clips?.find((clip) => clip.id === id);
  if (!current || (current.note ?? '') === text) return report;
  return {
    ...report,
    updatedAt: now,
    clips: report.clips?.map((clip) => (clip.id === id ? { ...clip, note: text, updatedAt: now } : clip)),
  };
}

export function deleteJournalClip(report: StudentProgressReport, id: string, now = Date.now()): StudentProgressReport {
  if (!report.clips?.some((clip) => clip.id === id)) return report;
  return { ...report, updatedAt: now, clips: report.clips.filter((clip) => clip.id !== id) };
}

function checklistMatch(entry: StudentChecklistEntry, catalogItemId: string, name: string): boolean {
  if (catalogItemId) return entry.catalogItemId === catalogItemId;
  return entry.catalogItemId === '' && entry.name.trim().toLowerCase() === name.trim().toLowerCase();
}

function visibleLabel(canonical: string, displayName: string): string {
  const override = displayName.trim();
  return override || canonical;
}

export function fundamentalsBoard(report: StudentProgressReport): FundamentalsCategoryView[] {
  return FUNDAMENTALS_CATALOG.categories.map((category) => {
    const catalogIds = new Set(category.items.map((item) => item.id));
    const items: FundamentalRow[] = [];
    const illegal = new Set(ageIllegalTechniques(report).map((row) => row.catalogId).filter(Boolean));
    for (const item of category.items) {
      const saved = report.checklist.find((entry) => entry.categoryId === category.id && entry.catalogItemId === item.id);
      if (saved?.hidden || illegal.has(item.id)) continue;
      items.push({
        entryId: saved?.id ?? '',
        catalogItemId: item.id,
        categoryId: category.id,
        name: item.name,
        label: visibleLabel(item.name, saved?.displayName ?? ''),
        learnedOn: saved?.learnedOn ?? '',
        level: fundamentalLevelOf(saved ?? { learnedOn: '' }),
        note: saved?.note ?? '',
        updatedAt: saved?.updatedAt ?? 0,
        custom: false,
      });
    }
    for (const entry of report.checklist) {
      if (entry.categoryId !== category.id || entry.hidden) continue;
      if (entry.catalogItemId && catalogIds.has(entry.catalogItemId)) continue;
      items.push({
        entryId: entry.id,
        catalogItemId: '',
        categoryId: category.id,
        name: entry.name,
        label: visibleLabel(entry.name, entry.displayName),
        learnedOn: entry.learnedOn,
        level: fundamentalLevelOf(entry),
        note: entry.note,
        updatedAt: entry.updatedAt,
        custom: true,
      });
    }
    return {
      id: category.id,
      name: category.name,
      learned: items.filter((item) => item.level >= FUNDAMENTAL_LIVE_LEVEL).length,
      items,
    };
  });
}

type ChecklistTarget = { entryId?: string; catalogItemId: string; categoryId: string; name: string };

function findChecklistIndex(checklist: StudentChecklistEntry[], target: ChecklistTarget): number {
  if (target.catalogItemId) {
    return checklist.findIndex((entry) => entry.catalogItemId === target.catalogItemId && entry.categoryId === target.categoryId);
  }
  if (target.entryId) {
    const byId = checklist.findIndex((entry) => entry.id === target.entryId);
    if (byId !== -1) return byId;
  }
  const name = target.name.trim();
  return checklist.findIndex((entry) => checklistMatch(entry, '', name) && entry.categoryId === target.categoryId);
}

function patchChecklist(
  report: StudentProgressReport,
  target: ChecklistTarget,
  patch: Partial<Pick<StudentChecklistEntry, 'learnedOn' | 'note' | 'displayName' | 'hidden' | 'level'>>,
  now: number,
): StudentProgressReport {
  const name = target.name.trim();
  const checklist = [...report.checklist];
  const index = findChecklistIndex(checklist, target);
  if (index === -1) {
    if (!name) return report;
    checklist.push({
      id: newId('check', now),
      catalogItemId: target.catalogItemId,
      categoryId: target.categoryId,
      name,
      displayName: patch.displayName ?? '',
      hidden: patch.hidden ?? false,
      learnedOn: patch.learnedOn ?? '',
      level: patch.level === undefined ? fundamentalLevelOf({ learnedOn: patch.learnedOn ?? '' }) : patch.level,
      note: patch.note ?? '',
      updatedAt: now,
    });
  } else {
    const current = checklist[index];
    checklist[index] = {
      ...current,
      displayName: patch.displayName === undefined ? current.displayName : patch.displayName,
      hidden: patch.hidden === undefined ? current.hidden : patch.hidden,
      learnedOn: patch.learnedOn === undefined ? current.learnedOn : patch.learnedOn,
      level: patch.level === undefined ? fundamentalLevelOf(current) : patch.level,
      note: patch.note === undefined ? current.note : patch.note,
      updatedAt: now,
    };
  }
  return { ...report, updatedAt: now, checklist };
}

export function setFundamentalLearned(
  report: StudentProgressReport,
  row: { entryId?: string; catalogItemId: string; categoryId: string; name: string },
  learned: boolean,
  date: string,
  now = Date.now(),
): StudentProgressReport {
  const learnedOn = learned ? (DATE_RE.test(date) ? date : todayIso(new Date(now))) : '';
  const current = report.checklist[findChecklistIndex(report.checklist, row)];
  const level: FundamentalLevel = learned
    ? (current && fundamentalLevelOf(current) >= FUNDAMENTAL_LIVE_LEVEL ? fundamentalLevelOf(current) : FUNDAMENTAL_LIVE_LEVEL)
    : 0;
  return patchChecklist(report, row, { learnedOn, level }, now);
}

/** Set proficiency. Level 3 and above keeps or stamps a learned date. A lower level keeps the date. */
export function setFundamentalLevel(
  report: StudentProgressReport,
  row: { entryId?: string; catalogItemId: string; categoryId: string; name: string },
  level: FundamentalLevel,
  now = Date.now(),
  fields?: { note?: string; learnedOn?: string },
): StudentProgressReport {
  if (!isFundamentalLevel(level)) return report;
  const current = report.checklist[findChecklistIndex(report.checklist, row)];
  const requested = fields?.learnedOn === undefined ? current?.learnedOn ?? '' : fields.learnedOn;
  const learnedOn = level >= FUNDAMENTAL_LIVE_LEVEL && !DATE_RE.test(requested) ? todayIso(new Date(now)) : DATE_RE.test(requested) ? requested : '';
  const patch: Partial<Pick<StudentChecklistEntry, 'learnedOn' | 'note' | 'level'>> = { level, learnedOn };
  if (fields?.note !== undefined) patch.note = fields.note.trim();
  return patchChecklist(report, row, patch, now);
}

export function setFundamentalNote(
  report: StudentProgressReport,
  row: { catalogItemId: string; categoryId: string; name: string },
  note: string,
  learnedOn: string,
  now = Date.now(),
): StudentProgressReport {
  return patchChecklist(report, row, { note: note.trim(), learnedOn: DATE_RE.test(learnedOn) ? learnedOn : '' }, now);
}

export function addCustomFundamental(
  report: StudentProgressReport,
  categoryId: string,
  name: string,
  now = Date.now(),
): StudentProgressReport {
  const trimmed = name.trim();
  if (!trimmed) return report;
  if (!FUNDAMENTALS_CATALOG.categories.some((category) => category.id === categoryId)) return report;
  const existing = report.checklist.find(
    (entry) => entry.categoryId === categoryId && entry.catalogItemId === '' && entry.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (existing?.hidden) {
    return patchChecklist(report, { entryId: existing.id, catalogItemId: '', categoryId, name: existing.name }, { hidden: false }, now);
  }
  if (existing) return report;
  return patchChecklist(report, { catalogItemId: '', categoryId, name: trimmed }, { learnedOn: '', note: '' }, now);
}

/** Display-name override. The catalog id and the canonical name stay so coach matching and old journal cards still line up. */
export function renameFundamental(
  report: StudentProgressReport,
  row: ChecklistTarget,
  displayName: string,
  now = Date.now(),
): StudentProgressReport {
  const next = displayName.trim().slice(0, PROGRESS_NAME_MAX);
  if (!next) return report;
  const canonical = row.name.trim();
  const override = next.toLowerCase() === canonical.toLowerCase() ? '' : next;
  return patchChecklist(report, row, { displayName: override }, now);
}

/** Hide the line. Learned date, note, catalog id, and journal references stay in the file. */
export function hideFundamental(report: StudentProgressReport, row: ChecklistTarget, now = Date.now()): StudentProgressReport {
  return patchChecklist(report, row, { hidden: true }, now);
}

/** Clear starter renames and unhide starter techniques. Custom lines stay as the student left them. */
export function restoreStarterFundamentals(report: StudentProgressReport, now = Date.now()): StudentProgressReport {
  const catalogIds = new Set(FUNDAMENTALS_CATALOG.categories.flatMap((category) => category.items.map((item) => item.id)));
  let changed = false;
  const checklist = report.checklist.map((entry) => {
    if (!entry.catalogItemId || !catalogIds.has(entry.catalogItemId)) return entry;
    if (!entry.hidden && !entry.displayName.trim()) return entry;
    changed = true;
    return { ...entry, hidden: false, displayName: '', updatedAt: now };
  });
  if (!changed) return report;
  return { ...report, updatedAt: now, checklist };
}
