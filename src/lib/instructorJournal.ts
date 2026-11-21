/**
 * Instructor journal (after-class reflections, class video hub, and shareable
 * student takeaways) plus a teaching goals checklist.
 *
 * Stored under INSTRUCTOR_JOURNAL_STORAGE_KEY and INSTRUCTOR_GOALS_STORAGE_KEY,
 * keyed by instructor seat. Never writes to the D12 cards, Path to Mastery
 * links, daily check-in, or student journal stores.
 *
 * TODO: Connect buildStudentShareBundle() to the owner-gated video/card
 * distribution flow (PR 529 area) after explicit owner approval. Student and
 * kid videos stay off Advantage Cloud.
 */
import { INSTRUCTOR_D12_FACES, instructorD12SeatKey, type InstructorD12FaceId } from './instructorD12.ts';
import {
  D12_CARD_VIDEOS_MAX,
  cleanD12Video,
  type InstructorD12Card,
} from './instructorD12Cards.ts';
import { d12EndpointFace, d12FaceEndpoint, resolveD12Endpoint } from './instructorD12Mastery.ts';
import { mentionsPhrase } from './indexCards.ts';

export const INSTRUCTOR_JOURNAL_STORAGE_KEY = 'matboard.instructor.journal.v1';
export const INSTRUCTOR_GOALS_STORAGE_KEY = 'matboard.instructor.goals.v1';

export const EMPTY_INSTRUCTOR_JOURNAL = 'No journal entries mention this yet.';
export const INSTRUCTOR_JOURNAL_COMING_SOON =
  'Sending to students is coming soon. Student and kid videos never go to Advantage Cloud.';

const ENTRY_MAX = 400;
const GOAL_MAX = 200;
const TEXT_MAX = 2000;
const LABEL_MAX = 100;
const WHO_MAX = 300;
const TECHNIQUE_MAX = 12;
const TAG_MAX = 24;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANGE_EVENT = 'matboard-instructor-journal';

export type InstructorJournalVideo = {
  title: string;
  href: string;
  /** Opt-in flag: whether this link is included in a student-share bundle. Off by default. */
  shareWithStudents?: boolean;
};

export type InstructorJournalTechnique = {
  name: string;
  /** Opt-in flag: whether this technique is included in a student-share bundle. Off by default. */
  shareWithStudents?: boolean;
};

export type InstructorJournalEntry = {
  id: string;
  date: string;
  classLabel?: string;
  /** Schedule occurrence id (weekly slot or special:id) when the entry is tied to the class board. */
  slotId?: string;
  whoInClass?: string;
  /** Student Edition ids for people listed in whoInClass, when known. */
  whoInClassIds?: string[];
  /** Private after-class reflection. Excluded from student bundle unless shareReflection is true. */
  reflection: string;
  shareReflection?: boolean;
  /** Optional class notes/cues written for students. Excluded unless shareClassNotes is true. */
  classNotes?: string;
  shareClassNotes?: boolean;
  techniques?: InstructorJournalTechnique[];
  /** Instructor-only D12 card ids or `face:<faceId>` tags. Never exported to students. */
  tags?: string[];
  videos?: InstructorJournalVideo[];
  createdAt: number;
};

export type InstructorGoal = {
  id: string;
  text: string;
  done: boolean;
  /** Optional D12 card id or `face:<faceId>`. Instructor-only, never exported to students. */
  tag?: string;
  createdAt: number;
};

export type StudentShareBundle = {
  v: 1;
  entryId: string;
  date: string;
  className: string;
  recipientsNote: string;
  notes: string;
  techniques: string[];
  videos: { title: string; href: string }[];
  excludedPrivateCount: number;
};

export type InstructorJournalDraft = {
  date?: string;
  classLabel?: string;
  slotId?: string;
  whoInClass?: string;
  whoInClassIds?: string[];
  reflection: string;
  shareReflection?: boolean;
  classNotes?: string;
  shareClassNotes?: boolean;
  techniques?: InstructorJournalTechnique[];
  tags?: string[];
  videos?: InstructorJournalVideo[];
};

export type InstructorJournalMention = {
  id: string;
  date: string;
  classLabel: string;
  line: string;
  /** True when explicitly tagged on the entry, false when matched by phrase. */
  tagged: boolean;
};

type JournalFile = { v: 1; entriesBySeat: Record<string, InstructorJournalEntry[]> };
type GoalsFile = { v: 1; goalsBySeat: Record<string, InstructorGoal[]> };

export function todayLocalIso(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function cleanLine(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value: string, max = TEXT_MAX): string {
  return value.replace(/\r\n/g, '\n').trim().slice(0, max);
}

function cleanDate(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return DATE_RE.test(trimmed) ? trimmed : todayLocalIso();
}

function cleanTechniques(raw: unknown): InstructorJournalTechnique[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InstructorJournalTechnique[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Partial<InstructorJournalTechnique>;
    const name = cleanLine(typeof item.name === 'string' ? item.name : '', 80);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(item.shareWithStudents === true ? { name, shareWithStudents: true } : { name });
    if (out.length >= TECHNIQUE_MAX) break;
  }
  return out;
}

function cleanTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of raw) {
    if (typeof row !== 'string') continue;
    const tag = row.trim().slice(0, 90);
    if (!tag || seen.has(tag)) continue;
    if (tag.startsWith('face:') && !d12EndpointFace(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= TAG_MAX) break;
  }
  return out;
}

function cleanVideos(raw: unknown): InstructorJournalVideo[] {
  if (!Array.isArray(raw)) return [];
  const out: InstructorJournalVideo[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Partial<InstructorJournalVideo>;
    const clean = cleanD12Video(
      typeof item.title === 'string' ? item.title : '',
      typeof item.href === 'string' ? item.href : '',
      item.shareWithStudents === true,
    );
    if (clean && !out.some((existing) => existing.href === clean.href)) out.push(clean);
    if (out.length >= D12_CARD_VIDEOS_MAX) break;
  }
  return out;
}

function cleanEntry(raw: unknown): InstructorJournalEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<InstructorJournalEntry>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const reflection = cleanMultiline(typeof row.reflection === 'string' ? row.reflection : '');
  const classNotes = cleanMultiline(typeof row.classNotes === 'string' ? row.classNotes : '');
  const techniques = cleanTechniques(row.techniques);
  const videos = cleanVideos(row.videos);
  if (!id || id.length > 80) return null;
  if (!reflection && !classNotes && !techniques.length && !videos.length) return null;
  const date = cleanDate(typeof row.date === 'string' ? row.date : undefined);
  const classLabel = cleanLine(typeof row.classLabel === 'string' ? row.classLabel : '', LABEL_MAX);
  const whoInClass = cleanLine(typeof row.whoInClass === 'string' ? row.whoInClass : '', WHO_MAX);
  const slotId = typeof row.slotId === 'string' ? row.slotId.trim().slice(0, 80) : '';
  const whoInClassIds = Array.isArray(row.whoInClassIds)
    ? [...new Set(row.whoInClassIds.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(id)))].slice(0, 80)
    : [];
  const tags = cleanTags(row.tags);
  const createdAt = typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : 0;
  const entry: InstructorJournalEntry = { id, date, reflection, createdAt };
  if (classLabel) entry.classLabel = classLabel;
  if (slotId) entry.slotId = slotId;
  if (whoInClass) entry.whoInClass = whoInClass;
  if (whoInClassIds.length) entry.whoInClassIds = whoInClassIds;
  if (row.shareReflection === true && reflection) entry.shareReflection = true;
  if (classNotes) entry.classNotes = classNotes;
  if (row.shareClassNotes === true && classNotes) entry.shareClassNotes = true;
  if (techniques.length) entry.techniques = techniques;
  if (tags.length) entry.tags = tags;
  if (videos.length) entry.videos = videos;
  return entry;
}

function cleanEntryList(raw: unknown): InstructorJournalEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InstructorJournalEntry[] = [];
  for (const row of raw) {
    const entry = cleanEntry(row);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
    if (out.length >= ENTRY_MAX) break;
  }
  return out;
}

function cleanGoal(raw: unknown): InstructorGoal | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Partial<InstructorGoal>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const text = cleanLine(typeof row.text === 'string' ? row.text : '', 160);
  if (!id || id.length > 80 || !text) return null;
  const tag = typeof row.tag === 'string' ? cleanTags([row.tag])[0] : undefined;
  const createdAt = typeof row.createdAt === 'number' && Number.isFinite(row.createdAt) ? row.createdAt : 0;
  const goal: InstructorGoal = { id, text, done: row.done === true, createdAt };
  if (tag) goal.tag = tag;
  return goal;
}

function cleanGoalList(raw: unknown): InstructorGoal[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: InstructorGoal[] = [];
  for (const row of raw) {
    const goal = cleanGoal(row);
    if (!goal || seen.has(goal.id)) continue;
    seen.add(goal.id);
    out.push(goal);
    if (out.length >= GOAL_MAX) break;
  }
  return out;
}

function readJournalFile(storage: Pick<Storage, 'getItem'>): JournalFile {
  try {
    const raw = storage.getItem(INSTRUCTOR_JOURNAL_STORAGE_KEY);
    if (!raw) return { v: 1, entriesBySeat: {} };
    const parsed = JSON.parse(raw) as { v?: number; entriesBySeat?: Record<string, unknown> };
    if (!parsed || parsed.v !== 1 || !parsed.entriesBySeat || typeof parsed.entriesBySeat !== 'object') {
      return { v: 1, entriesBySeat: {} };
    }
    return {
      v: 1,
      entriesBySeat: Object.fromEntries(
        Object.entries(parsed.entriesBySeat).map(([key, value]) => [key, cleanEntryList(value)]),
      ),
    };
  } catch {
    return { v: 1, entriesBySeat: {} };
  }
}

function readGoalsFile(storage: Pick<Storage, 'getItem'>): GoalsFile {
  try {
    const raw = storage.getItem(INSTRUCTOR_GOALS_STORAGE_KEY);
    if (!raw) return { v: 1, goalsBySeat: {} };
    const parsed = JSON.parse(raw) as { v?: number; goalsBySeat?: Record<string, unknown> };
    if (!parsed || parsed.v !== 1 || !parsed.goalsBySeat || typeof parsed.goalsBySeat !== 'object') {
      return { v: 1, goalsBySeat: {} };
    }
    return {
      v: 1,
      goalsBySeat: Object.fromEntries(
        Object.entries(parsed.goalsBySeat).map(([key, value]) => [key, cleanGoalList(value)]),
      ),
    };
  } catch {
    return { v: 1, goalsBySeat: {} };
  }
}

function notifyChange(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

export function subscribeInstructorJournal(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function loadInstructorJournal(
  storage: Pick<Storage, 'getItem'> = localStorage,
  seatKey = 'owner',
): InstructorJournalEntry[] {
  return readJournalFile(storage).entriesBySeat[instructorD12SeatKey(seatKey)] ?? [];
}

export function saveInstructorJournal(
  entries: readonly InstructorJournalEntry[],
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  seatKey = 'owner',
): InstructorJournalEntry[] {
  const file = readJournalFile(storage);
  const clean = cleanEntryList(entries);
  file.entriesBySeat[instructorD12SeatKey(seatKey)] = clean;
  storage.setItem(INSTRUCTOR_JOURNAL_STORAGE_KEY, JSON.stringify(file));
  notifyChange();
  return clean;
}

export function loadInstructorGoals(
  storage: Pick<Storage, 'getItem'> = localStorage,
  seatKey = 'owner',
): InstructorGoal[] {
  return readGoalsFile(storage).goalsBySeat[instructorD12SeatKey(seatKey)] ?? [];
}

export function saveInstructorGoals(
  goals: readonly InstructorGoal[],
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  seatKey = 'owner',
): InstructorGoal[] {
  const file = readGoalsFile(storage);
  const clean = cleanGoalList(goals);
  file.goalsBySeat[instructorD12SeatKey(seatKey)] = clean;
  storage.setItem(INSTRUCTOR_GOALS_STORAGE_KEY, JSON.stringify(file));
  notifyChange();
  return clean;
}

export function newInstructorJournalId(prefix: 'ij' | 'ig', at = Date.now()): string {
  return `${prefix}.${at.toString(36)}.${Math.random().toString(36).slice(2, 7)}`;
}

export function parseTechniqueInput(raw: string, shareWithStudents = false): InstructorJournalTechnique[] {
  return cleanTechniques(
    raw
      .split(/[,\n]/)
      .map((part) => ({ name: part, shareWithStudents })),
  );
}

export function addInstructorJournalEntry(
  entries: readonly InstructorJournalEntry[],
  draft: InstructorJournalDraft,
  at = Date.now(),
): { entries: InstructorJournalEntry[]; entry: InstructorJournalEntry } | { error: 'empty' } {
  const entry = cleanEntry({
    id: newInstructorJournalId('ij', at),
    date: draft.date,
    classLabel: draft.classLabel,
    slotId: draft.slotId,
    whoInClass: draft.whoInClass,
    whoInClassIds: draft.whoInClassIds,
    reflection: draft.reflection,
    shareReflection: draft.shareReflection === true,
    classNotes: draft.classNotes,
    shareClassNotes: draft.shareClassNotes === true,
    techniques: draft.techniques,
    tags: draft.tags,
    videos: draft.videos,
    createdAt: at,
  });
  if (!entry) return { error: 'empty' };
  return { entries: [entry, ...entries], entry };
}

export function deleteInstructorJournalEntry(entries: readonly InstructorJournalEntry[], id: string): InstructorJournalEntry[] {
  return entries.filter((entry) => entry.id !== id);
}

export function toggleJournalFieldShare(
  entries: readonly InstructorJournalEntry[],
  entryId: string,
  field: 'reflection' | 'classNotes',
  share: boolean,
): InstructorJournalEntry[] {
  return entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    const next = { ...entry };
    if (field === 'reflection') {
      if (share && next.reflection) next.shareReflection = true;
      else delete next.shareReflection;
    } else {
      if (share && next.classNotes) next.shareClassNotes = true;
      else delete next.shareClassNotes;
    }
    return next;
  });
}

export function toggleJournalTechniqueShare(
  entries: readonly InstructorJournalEntry[],
  entryId: string,
  name: string,
  share: boolean,
): InstructorJournalEntry[] {
  return entries.map((entry) => {
    if (entry.id !== entryId || !entry.techniques) return entry;
    return {
      ...entry,
      techniques: entry.techniques.map((tech) => {
        if (tech.name !== name) return tech;
        return share ? { name: tech.name, shareWithStudents: true } : { name: tech.name };
      }),
    };
  });
}

export function addInstructorJournalVideo(
  entries: readonly InstructorJournalEntry[],
  entryId: string,
  title: string,
  href: string,
  shareWithStudents = false,
): { entries: InstructorJournalEntry[] } | { error: 'link' | 'full' } {
  const video = cleanD12Video(title, href, shareWithStudents);
  if (!video) return { error: 'link' };
  const entry = entries.find((item) => item.id === entryId);
  const current = entry?.videos ?? [];
  if (current.length >= D12_CARD_VIDEOS_MAX) return { error: 'full' };
  if (current.some((item) => item.href === video.href)) return { entries: [...entries] };
  return {
    entries: entries.map((item) => (item.id === entryId ? { ...item, videos: [...current, video] } : item)),
  };
}

export function removeInstructorJournalVideo(
  entries: readonly InstructorJournalEntry[],
  entryId: string,
  href: string,
): InstructorJournalEntry[] {
  return entries.map((entry) => {
    if (entry.id !== entryId || !entry.videos) return entry;
    const videos = entry.videos.filter((video) => video.href !== href);
    const next = { ...entry };
    if (videos.length) next.videos = videos;
    else delete next.videos;
    return next;
  });
}

export function toggleJournalVideoShare(
  entries: readonly InstructorJournalEntry[],
  entryId: string,
  href: string,
  share: boolean,
): InstructorJournalEntry[] {
  return entries.map((entry) => {
    if (entry.id !== entryId || !entry.videos) return entry;
    return {
      ...entry,
      videos: entry.videos.map((video) => {
        if (video.href !== href) return video;
        return share ? { title: video.title, href: video.href, shareWithStudents: true } : { title: video.title, href: video.href };
      }),
    };
  });
}

export function addInstructorGoal(
  goals: readonly InstructorGoal[],
  text: string,
  tag?: string,
  at = Date.now(),
): { goals: InstructorGoal[]; goal: InstructorGoal } | { error: 'empty' } {
  const goal = cleanGoal({ id: newInstructorJournalId('ig', at), text, done: false, tag, createdAt: at });
  if (!goal) return { error: 'empty' };
  return { goals: [goal, ...goals], goal };
}

export function toggleInstructorGoal(goals: readonly InstructorGoal[], id: string): InstructorGoal[] {
  return goals.map((goal) => (goal.id === id ? { ...goal, done: !goal.done } : goal));
}

export function deleteInstructorGoal(goals: readonly InstructorGoal[], id: string): InstructorGoal[] {
  return goals.filter((goal) => goal.id !== id);
}

function entrySearchText(entry: InstructorJournalEntry): string {
  return [entry.classLabel ?? '', entry.reflection, entry.classNotes ?? ''].filter(Boolean).join(' ');
}

function entrySummaryLine(entry: InstructorJournalEntry): string {
  const body = entry.reflection || entry.classNotes || entry.techniques?.map((t) => t.name).join(', ') || `${entry.videos?.length ?? 0} video(s)`;
  const prefix = entry.classLabel ? `${entry.classLabel}: ` : '';
  return `${prefix}${body}`.slice(0, 220);
}

/**
 * Journal entries and goals mentioning or explicitly tagged to one D12 card.
 * Uses the same whole-word phrase matcher (`mentionsPhrase`) as the student D8 journal.
 */
export function instructorJournalMentionsForCard(
  entries: readonly InstructorJournalEntry[],
  goals: readonly InstructorGoal[],
  card: Pick<InstructorD12Card, 'id' | 'name'>,
): { entries: InstructorJournalMention[]; goals: InstructorGoal[] } {
  const matchedEntries: InstructorJournalMention[] = [];
  for (const entry of entries) {
    const tagged = Boolean(entry.tags?.includes(card.id));
    const mentioned = mentionsPhrase(entrySearchText(entry), card.name);
    if (!tagged && !mentioned) continue;
    matchedEntries.push({
      id: entry.id,
      date: entry.date,
      classLabel: entry.classLabel ?? '',
      line: entrySummaryLine(entry),
      tagged,
    });
  }
  matchedEntries.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const matchedGoals = goals.filter((goal) => goal.tag === card.id || mentionsPhrase(goal.text, card.name));
  return { entries: matchedEntries, goals: matchedGoals };
}

/**
 * Journal entries and goals mentioning or tagged to a D12 face or any card on that face.
 */
export function instructorJournalMentionsForFace(
  entries: readonly InstructorJournalEntry[],
  goals: readonly InstructorGoal[],
  faceId: InstructorD12FaceId,
  cards: readonly InstructorD12Card[],
): { entries: InstructorJournalMention[]; goals: InstructorGoal[] } {
  const faceLabel = INSTRUCTOR_D12_FACES.find((face) => face.id === faceId)?.label ?? faceId;
  const faceTag = d12FaceEndpoint(faceId);
  const faceCards = cards.filter((card) => card.faceId === faceId);
  const cardIds = new Set(faceCards.map((card) => card.id));
  const phrases = [faceLabel, ...faceCards.map((card) => card.name)];

  const matchedEntries: InstructorJournalMention[] = [];
  for (const entry of entries) {
    const tagged = Boolean(entry.tags?.some((tag) => tag === faceTag || cardIds.has(tag)));
    const hay = entrySearchText(entry);
    const mentioned = phrases.some((phrase) => mentionsPhrase(hay, phrase));
    if (!tagged && !mentioned) continue;
    matchedEntries.push({
      id: entry.id,
      date: entry.date,
      classLabel: entry.classLabel ?? '',
      line: entrySummaryLine(entry),
      tagged,
    });
  }
  matchedEntries.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  const matchedGoals = goals.filter(
    (goal) =>
      goal.tag === faceTag ||
      Boolean(goal.tag && cardIds.has(goal.tag)) ||
      phrases.some((phrase) => mentionsPhrase(goal.text, phrase)),
  );
  return { entries: matchedEntries, goals: matchedGoals };
}

/**
 * Cleanly separate student-useful items marked `shareWithStudents` from private
 * instructor notes, D12 tags, and goals. Read-only; never writes student storage.
 */
export function buildStudentShareBundle(
  entry: InstructorJournalEntry,
  linkedCards: readonly InstructorD12Card[] = [],
): StudentShareBundle {
  const noteParts: string[] = [];
  let excluded = 0;

  if (entry.reflection) {
    if (entry.shareReflection) noteParts.push(entry.reflection);
    else excluded += 1;
  }
  if (entry.classNotes) {
    if (entry.shareClassNotes) noteParts.push(entry.classNotes);
    else excluded += 1;
  }

  const taggedIds = new Set(entry.tags ?? []);
  for (const card of linkedCards) {
    if (!taggedIds.has(card.id)) continue;
    if (card.notes) {
      if (card.shareNotes) noteParts.push(`${card.name}: ${card.notes}`);
      else excluded += 1;
    }
  }

  const techniques: string[] = [];
  for (const tech of entry.techniques ?? []) {
    if (tech.shareWithStudents) techniques.push(tech.name);
    else excluded += 1;
  }

  const videos: { title: string; href: string }[] = [];
  const seenHref = new Set<string>();
  for (const video of entry.videos ?? []) {
    if (video.shareWithStudents) {
      if (!seenHref.has(video.href)) {
        seenHref.add(video.href);
        videos.push({ title: video.title, href: video.href });
      }
    } else {
      excluded += 1;
    }
  }
  for (const card of linkedCards) {
    if (!taggedIds.has(card.id)) continue;
    for (const video of card.videos ?? []) {
      if (video.shareWithStudents) {
        if (!seenHref.has(video.href)) {
          seenHref.add(video.href);
          videos.push({ title: video.title, href: video.href });
        }
      } else {
        excluded += 1;
      }
    }
  }

  if (entry.tags?.length) excluded += entry.tags.length;

  return {
    v: 1,
    entryId: entry.id,
    date: entry.date,
    className: entry.classLabel ?? '',
    recipientsNote: entry.whoInClass ?? '',
    notes: noteParts.join('\n\n'),
    techniques,
    videos,
    excludedPrivateCount: excluded,
  };
}

export function instructorTagLabel(tag: string | undefined, cards: readonly InstructorD12Card[]): string {
  if (!tag) return '';
  return resolveD12Endpoint(cards, tag)?.name ?? '';
}

/** Fictional sample entries for /preview/instructor-sheet. Nothing is written to storage. */
export const INSTRUCTOR_JOURNAL_SAMPLE: readonly InstructorJournalEntry[] = [
  {
    id: 'sample.journal.1',
    date: '2026-11-20',
    classLabel: '6:00 PM Fundamentals',
    whoInClass: 'Alex M., Jordan R., Sam K.',
    reflection: 'Keep the opening Intro / end-of-class message under two minutes so we get five extra minutes of positional sparring.',
    shareReflection: false,
    classNotes: 'Remember to break posture before opening the closed guard, and reset grips on the collar drag.',
    shareClassNotes: true,
    techniques: [
      { name: 'Scissor sweep', shareWithStudents: true },
      { name: 'Collar drag', shareWithStudents: true },
    ],
    tags: ['starter.public-speaking.intro-end-of-class-message', 'face:time-management'],
    videos: [
      {
        title: 'Scissor sweep angles',
        href: 'https://example.com/scissor-sweep-angles',
        shareWithStudents: true,
      },
    ],
    createdAt: 1,
  },
  {
    id: 'sample.journal.2',
    date: '2026-11-18',
    classLabel: '7:15 PM All Levels',
    whoInClass: 'Casey T., Morgan L.',
    reflection: 'Did a quick Mat inspection before warm-ups and reviewed the Lesson plan / video review notes at the desk.',
    shareReflection: false,
    tags: ['starter.preparation.mat-inspection', 'starter.preparation.lesson-plan-video-review'],
    createdAt: 2,
  },
];

export const INSTRUCTOR_GOALS_SAMPLE: readonly InstructorGoal[] = [
  {
    id: 'sample.goal.1',
    text: 'Check mat corners before every evening class (Mat inspection)',
    done: true,
    tag: 'starter.preparation.mat-inspection',
    createdAt: 1,
  },
  {
    id: 'sample.goal.2',
    text: 'Keep Intro / end-of-class message to 90 seconds',
    done: false,
    tag: 'starter.public-speaking.intro-end-of-class-message',
    createdAt: 2,
  },
];
