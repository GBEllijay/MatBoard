/**
 * A saved Video Library link or filmed move can point at one existing
 * fundamental or one technique the student is working on.
 * Creating a missing title reuses those lists. It does not mark anything learned.
 * The progress file stores the id and the title, never the video bytes.
 */

import type { JournalClip, JournalEntry, StudentProgressReport, TechniqueRef } from './progress/types.ts';
import { placeOnFundamentals } from './studentEdition.ts';
import { commitStudentFilm, type FilmCommitDeps, type StudentFilm } from './studentFilm.ts';
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

/**
 * Remember the first journal card a link was saved with.
 * A later practice session does not replace that card.
 */
export function setClipJournal(report: StudentProgressReport, clipId: string, entryId: string, now = Date.now()): StudentProgressReport {
  const id = readJournalEntryId(entryId) ?? '';
  if (!id || !report.clips?.some((clip) => clip.id === clipId)) return report;
  let changed = false;
  const clips = report.clips.map((clip) => {
    if (clip.id !== clipId || clip.journalEntryId) return clip;
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

/** Remember the first journal card a filmed move was saved with. Later sessions do not replace it. */
export function setFilmJournal(films: readonly StudentFilm[], filmId: string, entryId: string, now = Date.now()): StudentFilm[] {
  const id = readJournalEntryId(entryId) ?? '';
  if (!id) return [...films];
  return films.map((film) => (film.id === filmId && !film.journalEntryId ? { ...film, journalEntryId: id, updatedAt: now } : film));
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
export const DAY_FILM_SAVED = 'Saved on this phone in the video library and on this card. This is not a cloud backup.';

/**
 * Save a day-card recording into the video library and remember this card as the original class.
 * A failed save does not write the library list or the technique link.
 */
export async function saveDayCardFilm(input: {
  report: StudentProgressReport;
  films: readonly StudentFilm[];
  file: { name: string; type: string; size: number; blob: Blob };
  title: string;
  date: string;
  entryId: string;
  intent: LinkIntent;
  now?: number;
  deps: FilmCommitDeps;
}): Promise<
  | { ok: true; report: StudentProgressReport; films: StudentFilm[]; film: StudentFilm; note: string; linkError: string }
  | { ok: false; error: string; report: StudentProgressReport; films: readonly StudentFilm[] }
> {
  const now = input.now ?? Date.now();
  const result = await commitStudentFilm(
    {
      file: input.file,
      technique: input.title,
      date: input.date,
      where: 'phone',
      provider: '',
      films: input.films,
      now,
    },
    input.deps,
  );
  if (!result.ok) return { ok: false, error: result.error, report: input.report, films: input.films };
  const plan = associationAfterSave(input.report, { saved: true, title: result.film.technique, intent: input.intent, now });
  let film = setFilmJournal([result.film], result.film.id, input.entryId, now)[0] ?? result.film;
  if (plan.anchor) film = setFilmAnchor([film], film.id, plan.anchor, now)[0] ?? film;
  const films = [...input.films.filter((item) => item.id !== film.id), film];
  const note = plan.error ? plan.error : result.largeNote ? `${DAY_FILM_SAVED} ${result.largeNote}` : DAY_FILM_SAVED;
  return { ok: true, report: plan.report, films, film, note, linkError: plan.error ?? '' };
}

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

export type ResolvedTechnique = {
  fundamentalIds: string[];
  workingIds: string[];
  /** Current title when the record is still there. Otherwise the name stored on the video. */
  title: string;
  missing: boolean;
};

export type PracticeHit = {
  id: string;
  date: string;
  createdAt: number;
  /** Wording on that card. A later rename of the technique does not change it. */
  name: string;
};

export type CardTechnique = { id: string; name: string; workingId?: string };

export type ShownVideo = {
  kind: 'link' | 'film';
  id: string;
  label: string;
  url: string;
  place: string;
  originId: string;
  originDate: string;
  originMissing: boolean;
  originHere: boolean;
  viaTechnique: boolean;
};

/** Fundamentals and working nodes that are the same technique as this anchor. */
export function resolveTechnique(report: StudentProgressReport, anchor: TechniqueAnchor): ResolvedTechnique {
  const graph = readWorkingGraph(report.working) ?? { nodes: [], edges: [] };
  const fundamentalIds = new Set<string>();
  const workingIds = new Set<string>();
  if (anchor.kind === 'fundamental') {
    fundamentalIds.add(anchor.id);
    for (const node of graph.nodes) if (node.fundamentalId === anchor.id) workingIds.add(node.id);
    const live = graph.nodes.find((node) => node.fundamentalId === anchor.id);
    return { fundamentalIds: [...fundamentalIds], workingIds: [...workingIds], title: live?.title || anchor.name, missing: false };
  }
  workingIds.add(anchor.id);
  const node = findWorkingNode(graph, anchor.id);
  if (!node) return { fundamentalIds: [], workingIds: [...workingIds], title: anchor.name, missing: true };
  if (node.fundamentalId) {
    fundamentalIds.add(node.fundamentalId);
    for (const other of graph.nodes) if (other.fundamentalId === node.fundamentalId) workingIds.add(other.id);
  }
  return { fundamentalIds: [...fundamentalIds], workingIds: [...workingIds], title: node.title, missing: false };
}

function mentions(refs: readonly TechniqueRef[], resolved: ResolvedTechnique): TechniqueRef | undefined {
  return refs.find((ref) => {
    if (ref.workingId && resolved.workingIds.includes(ref.workingId)) return true;
    return Boolean(ref.id && !ref.id.startsWith('free.') && resolved.fundamentalIds.includes(ref.id));
  });
}

/**
 * Newer practice dates first.
 * The same date uses the card that was created later, then the id.
 * `updatedAt` is not used, so editing a card does not change the shortcut.
 */
export function comparePractice(a: Pick<PracticeHit, 'date' | 'createdAt' | 'id'>, b: Pick<PracticeHit, 'date' | 'createdAt' | 'id'>): number {
  const aDate = DATE_RE.test(a.date) ? a.date : '';
  const bDate = DATE_RE.test(b.date) ? b.date : '';
  if (aDate !== bDate) return aDate < bDate ? 1 : -1;
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function practiceEntries(report: StudentProgressReport, anchor: TechniqueAnchor): PracticeHit[] {
  const resolved = resolveTechnique(report, anchor);
  const hits: PracticeHit[] = [];
  for (const entry of report.journal) {
    const ref = mentions(entry.techniqueRefs, resolved);
    if (!ref) continue;
    hits.push({ id: entry.id, date: entry.date, createdAt: entry.createdAt, name: ref.name.trim() || resolved.title });
  }
  return hits.sort(comparePractice);
}

export function latestPractice(report: StudentProgressReport, anchor: TechniqueAnchor): PracticeHit | null {
  return practiceEntries(report, anchor)[0] ?? null;
}

export function earlierPractices(report: StudentProgressReport, anchor: TechniqueAnchor, currentId = ''): PracticeHit[] {
  const latest = latestPractice(report, anchor);
  return practiceEntries(report, anchor).filter((hit) => hit.id !== currentId && hit.id !== latest?.id);
}

export function cardTechniques(entry: JournalEntry | undefined): CardTechnique[] {
  if (!entry) return [];
  const seen = new Set<string>();
  const rows: CardTechnique[] = [];
  for (const ref of entry.techniqueRefs) {
    const name = ref.name.trim();
    if (!name) continue;
    const key = ref.workingId || ref.id || name;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ id: ref.id, name, ...(ref.workingId ? { workingId: ref.workingId } : {}) });
  }
  return rows;
}

function anchorMatchesCard(report: StudentProgressReport, anchor: TechniqueAnchor | undefined, entry: JournalEntry | undefined): boolean {
  if (!anchor || !entry) return false;
  const resolved = resolveTechnique(report, anchor);
  return Boolean(mentions(entry.techniqueRefs, resolved));
}

function originOf(report: StudentProgressReport, entryId: string, currentId: string): { originDate: string; originMissing: boolean; originHere: boolean } {
  if (!entryId) return { originDate: '', originMissing: false, originHere: false };
  const origin = report.journal.find((entry) => entry.id === entryId);
  return {
    originDate: origin?.date ?? '',
    originMissing: !origin,
    originHere: entryId === currentId,
  };
}

/** Videos saved on this card, plus videos for a technique this card actually names. */
export function videosForCard(
  report: StudentProgressReport,
  clips: readonly JournalClip[],
  films: readonly StudentFilm[],
  entryId: string,
): ShownVideo[] {
  const entry = report.journal.find((item) => item.id === entryId);
  const shown: ShownVideo[] = [];
  for (const clip of clips) {
    const viaTechnique = anchorMatchesCard(report, clip.techniqueAnchor, entry);
    const originHere = clip.journalEntryId === entryId;
    if (!viaTechnique && !originHere) continue;
    const origin = originOf(report, clip.journalEntryId ?? '', entryId);
    shown.push({
      kind: 'link',
      id: clip.id,
      label: clip.description.trim() || clip.url,
      url: clip.url,
      place: 'Link. Opens in a new tab. Not saved as a video file on this phone.',
      originId: clip.journalEntryId ?? '',
      ...origin,
      viaTechnique,
    });
  }
  for (const film of films) {
    const viaTechnique = anchorMatchesCard(report, film.techniqueAnchor, entry);
    const originHere = film.journalEntryId === entryId;
    if (!viaTechnique && !originHere) continue;
    const origin = originOf(report, film.journalEntryId ?? '', entryId);
    const place = film.where === 'phone' ? 'On this phone. The file stays in the video library.' : film.where === 'academy' ? 'In the academy folder. The file stays in the video library.' : 'On your drive. The file stays in the video library.';
    shown.push({
      kind: 'film',
      id: film.id,
      label: film.technique.trim() || 'Filmed move',
      url: '',
      place,
      originId: film.journalEntryId ?? '',
      ...origin,
      viaTechnique,
    });
  }
  return shown;
}

export function readJournalFilmContext(params: URLSearchParams): { entryId: string; date: string; technique: string; back: string } {
  return {
    entryId: readJournalEntryId(params.get('journal') ?? '') ?? '',
    date: DATE_RE.test(params.get('date') ?? '') ? (params.get('date') as string) : '',
    technique: (params.get('technique') ?? '').trim().replace(/\s+/g, ' ').slice(0, 80),
    back: safeStudentReturn(params.get('back') ?? ''),
  };
}
