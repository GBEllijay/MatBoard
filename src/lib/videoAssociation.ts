/**
 * A saved Video Library link or filmed move can point at one existing
 * fundamental or one technique the student is working on.
 * Creating a missing title reuses those lists. It does not mark anything learned.
 * The progress file stores the id and the title, never the video bytes.
 */

import type { JournalClip, StudentProgressReport } from './progress/types.ts';
import { placeOnFundamentals } from './studentEdition.ts';
import type { StudentFilm } from './studentFilm.ts';
import { adoptWorkingNode, findWorkingByTitle, findWorkingNode, readWorkingGraph, workingTitleKey } from './workingTechniques.ts';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type TechniqueAnchor = {
  kind: 'fundamental' | 'working';
  id: string;
  name: string;
};

export type LinkIntent =
  | { kind: 'none' }
  | { kind: 'fundamental'; id: string; name: string }
  | { kind: 'working'; id: string; name: string }
  | { kind: 'create-fundamental' }
  | { kind: 'create-working' };

export type LinkPlan = {
  report: StudentProgressReport;
  anchor?: TechniqueAnchor;
  /** A new checklist line or working technique was added. */
  created: boolean;
  /** The title already existed, so the same id is reused. */
  deduped: boolean;
  error?: string;
};

export function readTechniqueAnchor(value: unknown): TechniqueAnchor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const row = value as Partial<TechniqueAnchor>;
  const kind = row.kind === 'fundamental' || row.kind === 'working' ? row.kind : '';
  const id = typeof row.id === 'string' && ID_RE.test(row.id) ? row.id : '';
  const name = typeof row.name === 'string' ? row.name.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  if (!kind || !id || !name) return undefined;
  return { kind, id, name };
}

export function readJournalEntryId(value: unknown): string | undefined {
  return typeof value === 'string' && ID_RE.test(value) ? value : undefined;
}

export function clipsForJournal(clips: readonly JournalClip[], entryId: string): JournalClip[] {
  if (!entryId) return [];
  return clips.filter((clip) => clip.journalEntryId === entryId);
}

export function filmsForJournal(films: readonly StudentFilm[], entryId: string): StudentFilm[] {
  if (!entryId) return [];
  return films.filter((film) => film.journalEntryId === entryId);
}

function untouched(report: StudentProgressReport, error?: string): LinkPlan {
  return { report, created: false, deduped: false, ...(error ? { error } : {}) };
}

/** Review a choice before anything is written. `report` changes only when a missing title is created. */
export function applyLinkIntent(report: StudentProgressReport, title: string, intent: LinkIntent, now = Date.now()): LinkPlan {
  if (intent.kind === 'none') return untouched(report);
  if (intent.kind === 'fundamental') {
    if (!intent.id || !intent.name.trim()) return untouched(report, 'Choose a fundamental.');
    return { report, anchor: { kind: 'fundamental', id: intent.id, name: intent.name.trim() }, created: false, deduped: false };
  }
  if (intent.kind === 'working') {
    const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
    const node = findWorkingNode(graph, intent.id);
    if (!node) return untouched(report, 'That technique is not on your working list.');
    return { report, anchor: { kind: 'working', id: node.id, name: node.title }, created: false, deduped: false };
  }
  const name = title.trim().replace(/\s+/g, ' ');
  if (!workingTitleKey(name)) return untouched(report, 'Add the technique or title first.');
  if (intent.kind === 'create-fundamental') {
    const before = report.checklist.length;
    const placed = placeOnFundamentals(report, name, now);
    if (!placed.id) return untouched(report, 'That title could not be added to fundamentals.');
    const created = placed.report.checklist.length > before;
    return {
      report: placed.report,
      anchor: { kind: 'fundamental', id: placed.id, name },
      created,
      deduped: !created,
    };
  }
  const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
  const adopted = adoptWorkingNode(graph, { title: name, now });
  return {
    report: adopted.graph === graph ? report : { ...report, updatedAt: now, working: adopted.graph },
    anchor: { kind: 'working', id: adopted.node.id, name: adopted.node.title },
    created: adopted.created,
    deduped: !adopted.created,
  };
}

export function sameTitleOnWorkingList(report: StudentProgressReport, title: string): boolean {
  const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
  return Boolean(findWorkingByTitle(graph, title));
}

export function setClipJournal(report: StudentProgressReport, clipId: string, entryId: string, now = Date.now()): StudentProgressReport {
  const id = readJournalEntryId(entryId) ?? '';
  if (!id || !report.clips?.some((clip) => clip.id === clipId)) return report;
  let changed = false;
  const clips = report.clips.map((clip) => {
    if (clip.id !== clipId || clip.journalEntryId === id) return clip;
    changed = true;
    return { ...clip, journalEntryId: id, updatedAt: now };
  });
  return changed ? { ...report, updatedAt: now, clips } : report;
}

export function clearClipJournal(report: StudentProgressReport, clipId: string, now = Date.now()): StudentProgressReport {
  if (!report.clips?.some((clip) => clip.id === clipId && clip.journalEntryId)) return report;
  return {
    ...report,
    updatedAt: now,
    clips: report.clips.map((clip) => (clip.id === clipId ? { ...clip, journalEntryId: undefined, updatedAt: now } : clip)),
  };
}

export function setClipAnchor(report: StudentProgressReport, clipId: string, anchor: TechniqueAnchor | undefined, now = Date.now()): StudentProgressReport {
  if (!report.clips?.some((clip) => clip.id === clipId)) return report;
  const next = anchor ? readTechniqueAnchor(anchor) : undefined;
  if (anchor && !next) return report;
  return {
    ...report,
    updatedAt: now,
    clips: report.clips.map((clip) => (clip.id === clipId ? { ...clip, techniqueAnchor: next, updatedAt: now } : clip)),
  };
}

export function setFilmJournal(films: readonly StudentFilm[], filmId: string, entryId: string, now = Date.now()): StudentFilm[] {
  const id = readJournalEntryId(entryId) ?? '';
  if (!id) return [...films];
  return films.map((film) => (film.id === filmId && film.journalEntryId !== id ? { ...film, journalEntryId: id, updatedAt: now } : film));
}

export function clearFilmJournal(films: readonly StudentFilm[], filmId: string, now = Date.now()): StudentFilm[] {
  return films.map((film) => (film.id === filmId && film.journalEntryId ? { ...film, journalEntryId: undefined, updatedAt: now } : film));
}

export function setFilmAnchor(films: readonly StudentFilm[], filmId: string, anchor: TechniqueAnchor | undefined, now = Date.now()): StudentFilm[] {
  const next = anchor ? readTechniqueAnchor(anchor) : undefined;
  if (anchor && !next) return [...films];
  return films.map((film) => (film.id === filmId ? { ...film, techniqueAnchor: next, updatedAt: now } : film));
}

/**
 * Write the journal association and the technique link only after the library save succeeded.
 * A failed or cancelled save leaves the progress file alone.
 */
export function associationAfterSave(
  report: StudentProgressReport,
  input: { saved: boolean; title: string; intent: LinkIntent; now?: number },
): LinkPlan {
  if (!input.saved) return untouched(report);
  return applyLinkIntent(report, input.title, input.intent, input.now);
}

export function safeStudentReturn(value: string): string {
  const text = value.trim();
  if (!text.startsWith('/student/') || text.startsWith('/student//')) return '';
  if (text.includes('://') || text.includes('\\') || text.includes(' ')) return '';
  return text.slice(0, 240);
}

export function journalFilmHref(input: { entryId: string; date: string; technique: string; back: string }): string {
  const params = new URLSearchParams();
  if (readJournalEntryId(input.entryId)) params.set('journal', input.entryId);
  if (DATE_RE.test(input.date)) params.set('date', input.date);
  const technique = input.technique.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (technique) params.set('technique', technique);
  const back = safeStudentReturn(input.back);
  if (back) params.set('back', back);
  const query = params.toString();
  return query ? `/student/videos?${query}` : '/student/videos';
}

export function readJournalFilmContext(params: URLSearchParams): { entryId: string; date: string; technique: string; back: string } {
  return {
    entryId: readJournalEntryId(params.get('journal') ?? '') ?? '',
    date: DATE_RE.test(params.get('date') ?? '') ? (params.get('date') as string) : '',
    technique: (params.get('technique') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
    back: safeStudentReturn(params.get('back') ?? ''),
  };
}
