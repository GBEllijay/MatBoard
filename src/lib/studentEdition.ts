/**
 * Local Student Edition journal. The file on this device is a student progress
 * report from src/lib/progress. Nothing here is sent to a server.
 */

import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { isStudentEditionUnlocked } from './studentUnlock.ts';
import { exportProgressPacket, parseProgressPacket, searchJournal } from './progress/format.ts';
import { PROGRESS_NAME_MAX, type GameTag, type JournalEntry, type StudentChecklistEntry, type StudentProgressReport, type TechniqueRef } from './progress/types.ts';

export const STUDENT_EDITION_STORAGE_KEY = 'matboard.studentEdition.v1';

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

export type ClassKind = '' | 'gi' | 'nogi';

export type JournalDraft = {
  date: string;
  classKind: ClassKind;
  gameTag: GameTag;
  techniques: TechniqueRef[];
  partners: string;
  drills: string;
  rolls: string;
  notes: string;
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
  note: string;
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
  if (search.get('student') === '1') return true;
  // `student` is the subscribed snapshot from useStudentEditionUnlocked.
  // The storage read covers callers that have not passed that snapshot yet.
  if (owner.student || isStudentEditionUnlocked()) return true;
  if (isStudentPurchased()) return true;
  return owner.pro && owner.coach && owner.white;
}

export function blankStudentReport(now = Date.now()): StudentProgressReport {
  return {
    schemaVersion: 1,
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
  };
}

export function loadStudentReport(storage: Pick<Storage, 'getItem'>): StudentProgressReport {
  const raw = storage.getItem(STUDENT_EDITION_STORAGE_KEY);
  if (!raw) return blankStudentReport();
  const parsed = parseProgressPacket(raw);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') return blankStudentReport();
  return parsed.value;
}

export function saveStudentReport(storage: MemoryStore, report: StudentProgressReport): StudentProgressReport {
  const text = exportProgressPacket(report);
  const parsed = parseProgressPacket(text);
  if (!parsed.ok || parsed.value.kind !== 'student-progress-report') {
    const errors = parsed.ok ? ['Student Edition file was not a progress report.'] : parsed.errors;
    throw new Error(errors.join(' '));
  }
  storage.setItem(STUDENT_EDITION_STORAGE_KEY, text);
  return parsed.value;
}

export function classLabel(kind: ClassKind): string {
  if (kind === 'gi') return 'Gi';
  if (kind === 'nogi') return 'No-Gi';
  return '';
}

export function encodeJournalBody(draft: Pick<JournalDraft, 'classKind' | 'techniques' | 'partners' | 'drills' | 'rolls' | 'notes'>): string {
  const techniques = draft.techniques.map((item) => item.name.trim()).filter(Boolean).join('; ');
  return [
    `Class: ${classLabel(draft.classKind)}`,
    `Techniques: ${techniques}`,
    `Training partners: ${draft.partners.trim()}`,
    `Drills: ${draft.drills.trim()}`,
    `Rolls: ${draft.rolls.trim()}`,
    'Notes:',
    draft.notes.trim(),
  ].join('\n');
}

export function decodeJournalBody(body: string): Pick<JournalDraft, 'classKind' | 'partners' | 'drills' | 'rolls' | 'notes'> {
  const lines = body.split('\n');
  const take = (prefix: string) => {
    const line = lines.find((row) => row.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : '';
  };
  const classText = take('Class:').toLowerCase();
  const classKind: ClassKind = classText === 'gi' ? 'gi' : classText === 'no-gi' ? 'nogi' : '';
  const notesAt = lines.findIndex((row) => row === 'Notes:' || row.startsWith('Notes:'));
  const notes = notesAt >= 0 ? lines.slice(notesAt + 1).join('\n').trim() : body.trim();
  return {
    classKind,
    partners: take('Training partners:'),
    drills: take('Drills:'),
    rolls: take('Rolls:'),
    notes,
  };
}

export function viewJournalEntry(entry: JournalEntry): JournalCardView {
  const decoded = decodeJournalBody(entry.body);
  return {
    id: entry.id,
    date: entry.date,
    classKind: decoded.classKind,
    gameTag: entry.gameTag,
    techniques: entry.techniqueRefs.map((item) => ({ id: item.id, name: item.name })),
    partners: decoded.partners,
    drills: decoded.drills,
    rolls: decoded.rolls,
    notes: decoded.notes,
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
    .slice(0, 2);
  return {
    id: newId('card', now),
    date: draft.date,
    gameTag: draft.gameTag,
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
  return searchJournal(newest, query);
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
    for (const item of category.items) {
      const saved = report.checklist.find((entry) => entry.categoryId === category.id && entry.catalogItemId === item.id);
      if (saved?.hidden) continue;
      items.push({
        entryId: saved?.id ?? '',
        catalogItemId: item.id,
        categoryId: category.id,
        name: item.name,
        label: visibleLabel(item.name, saved?.displayName ?? ''),
        learnedOn: saved?.learnedOn ?? '',
        note: saved?.note ?? '',
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
        note: entry.note,
        custom: true,
      });
    }
    return {
      id: category.id,
      name: category.name,
      learned: items.filter((item) => item.learnedOn).length,
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
  patch: Partial<Pick<StudentChecklistEntry, 'learnedOn' | 'note' | 'displayName' | 'hidden'>>,
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
      note: patch.note === undefined ? current.note : patch.note,
      updatedAt: now,
    };
  }
  return { ...report, updatedAt: now, checklist };
}

export function setFundamentalLearned(
  report: StudentProgressReport,
  row: { catalogItemId: string; categoryId: string; name: string },
  learned: boolean,
  date: string,
  now = Date.now(),
): StudentProgressReport {
  const learnedOn = learned ? (DATE_RE.test(date) ? date : todayIso(new Date(now))) : '';
  return patchChecklist(report, row, { learnedOn }, now);
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
