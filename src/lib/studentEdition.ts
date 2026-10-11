/**
 * Local Student Edition journal. The file on this device is a student progress
 * report from src/lib/progress. Nothing here is sent to a server.
 */

import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { exportProgressPacket, parseProgressPacket, searchJournal } from './progress/format.ts';
import type { GameTag, JournalEntry, StudentChecklistEntry, StudentProgressReport, TechniqueRef } from './progress/types.ts';

export const STUDENT_EDITION_STORAGE_KEY = 'matboard.studentEdition.v1';

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
  catalogItemId: string;
  categoryId: string;
  name: string;
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
  owner: { pro: boolean; coach: boolean; white: boolean },
): boolean {
  if (search.get('student') === '1') return true;
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

export function fundamentalsBoard(report: StudentProgressReport): FundamentalsCategoryView[] {
  return FUNDAMENTALS_CATALOG.categories.map((category) => {
    const catalogIds = new Set(category.items.map((item) => item.id));
    const items: FundamentalRow[] = category.items.map((item) => {
      const saved = report.checklist.find((entry) => entry.categoryId === category.id && entry.catalogItemId === item.id);
      return {
        catalogItemId: item.id,
        categoryId: category.id,
        name: item.name,
        learnedOn: saved?.learnedOn ?? '',
        note: saved?.note ?? '',
        custom: false,
      };
    });
    for (const entry of report.checklist) {
      if (entry.categoryId !== category.id) continue;
      if (entry.catalogItemId && catalogIds.has(entry.catalogItemId)) continue;
      items.push({
        catalogItemId: '',
        categoryId: category.id,
        name: entry.name,
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

function upsertChecklist(
  report: StudentProgressReport,
  row: { catalogItemId: string; categoryId: string; name: string },
  patch: Partial<Pick<StudentChecklistEntry, 'learnedOn' | 'note'>>,
  now: number,
): StudentProgressReport {
  const name = row.name.trim();
  if (!name) return report;
  const index = report.checklist.findIndex((entry) => checklistMatch(entry, row.catalogItemId, name) && entry.categoryId === row.categoryId);
  const checklist = [...report.checklist];
  if (index === -1) {
    checklist.push({
      id: newId('check', now),
      catalogItemId: row.catalogItemId,
      categoryId: row.categoryId,
      name,
      learnedOn: patch.learnedOn ?? '',
      note: patch.note ?? '',
      updatedAt: now,
    });
  } else {
    const current = checklist[index];
    checklist[index] = {
      ...current,
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
  return upsertChecklist(report, row, { learnedOn }, now);
}

export function setFundamentalNote(
  report: StudentProgressReport,
  row: { catalogItemId: string; categoryId: string; name: string },
  note: string,
  learnedOn: string,
  now = Date.now(),
): StudentProgressReport {
  return upsertChecklist(report, row, { note: note.trim(), learnedOn: DATE_RE.test(learnedOn) ? learnedOn : '' }, now);
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
  const exists = report.checklist.some(
    (entry) => entry.categoryId === categoryId && entry.catalogItemId === '' && entry.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  if (exists) return report;
  return upsertChecklist(report, { catalogItemId: '', categoryId, name: trimmed }, { learnedOn: '', note: '' }, now);
}
