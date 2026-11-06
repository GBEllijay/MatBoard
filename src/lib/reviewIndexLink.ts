/**
 * Record for Review names attach to the live fundamentals index
 * (catalog + custom checklist lines on the student file).
 * The technique-tree preview keeps its own sample store and is not used here.
 * Adding a review to the journal video library reuses the filmed-move store.
 */

import { FUNDAMENTALS_CATALOG } from './progress/catalog.ts';
import { PROGRESS_NAME_MAX, type StudentProgressReport } from './progress/types.ts';
import {
  reviewInJournalLibrary,
  type ReplayBlock,
  type ReplayIndexLink,
} from './replayAnalysis.ts';
import { addCustomFundamental, fundamentalsBoard } from './studentEdition.ts';
import {
  commitStudentFilm,
  loadFilms,
  setFilmNote,
  upsertFilm,
  writeFilms,
  type FilmCommitDeps,
  type StudentFilm,
} from './studentFilm.ts';
import { techniqueKey } from './techniqueIndex.ts';

export const REVIEW_LIBRARY_NEEDS_LINK = 'Pick a fundamental before adding this review to the journal video library.';
export const REVIEW_LIBRARY_NEEDS_CLIP = 'Record or pick a clip first.';
export const REVIEW_LIBRARY_ALREADY = 'This clip is already in the journal video library.';
export const REVIEW_LIBRARY_ADDED = 'Added to the journal video library.';

export type AttachReviewNameResult = {
  report: StudentProgressReport;
  link: ReplayIndexLink | null;
  /** True when a new checklist line was written. */
  added: boolean;
  error?: string;
};

type MemoryStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

export function normalizeReviewName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, PROGRESS_NAME_MAX);
}

export function linkFromFundamental(item: { catalogItemId: string; entryId: string; label: string }): ReplayIndexLink | null {
  const id = (item.catalogItemId || item.entryId).trim();
  const name = item.label.trim();
  if (!id || !name) return null;
  return { id, name };
}

/** Visible fundamentals first (so a rename wins), then the starter catalog. */
export function findFundamentalLink(report: StudentProgressReport, name: string): ReplayIndexLink | null {
  const key = techniqueKey(name);
  if (!key) return null;
  for (const category of fundamentalsBoard(report)) {
    for (const item of category.items) {
      if (techniqueKey(item.label) !== key && techniqueKey(item.name) !== key) continue;
      const link = linkFromFundamental(item);
      if (link) return link;
    }
  }
  for (const category of FUNDAMENTALS_CATALOG.categories) {
    for (const item of category.items) {
      if (techniqueKey(item.name) === key) return { id: item.id, name: item.name };
    }
  }
  return null;
}

/**
 * Link a review to a name already on the index, or add that name as a custom fundamental.
 * An existing match is returned without a second checklist line.
 */
export function attachReviewName(
  report: StudentProgressReport,
  categoryId: string,
  name: string,
  now = Date.now(),
): AttachReviewNameResult {
  const trimmed = normalizeReviewName(name);
  if (!trimmed) return { report, link: null, added: false, error: 'Type a name to add to the index.' };
  const existing = findFundamentalLink(report, trimmed);
  if (existing) return { report, link: existing, added: false };
  if (!FUNDAMENTALS_CATALOG.categories.some((category) => category.id === categoryId)) {
    return { report, link: null, added: false, error: 'Choose a fundamentals category.' };
  }
  const next = addCustomFundamental(report, categoryId, trimmed, now);
  if (next === report) return { report, link: null, added: false, error: 'That name could not be added to the index.' };
  const link = findFundamentalLink(next, trimmed);
  if (!link) return { report, link: null, added: false, error: 'That name could not be added to the index.' };
  return { report: next, link, added: true };
}

export function markReviewInLibrary(replay: ReplayBlock, filmId: string, clipLocalId: string): ReplayBlock {
  if (!filmId || !replay.clip || replay.clip.localId !== clipLocalId) return replay;
  return { ...replay, journalLibrary: { filmId, clipLocalId } };
}

export async function commitReviewToJournalLibrary(input: {
  replay: ReplayBlock;
  blob: Blob;
  date: string;
  films: readonly StudentFilm[];
  now?: number;
  deps: FilmCommitDeps;
}): Promise<{ ok: true; film: StudentFilm; films: StudentFilm[]; message: string } | { ok: false; error: string }> {
  if (reviewInJournalLibrary(input.replay)) return { ok: false, error: REVIEW_LIBRARY_ALREADY };
  const technique = input.replay.indexLink?.name.trim() ?? '';
  if (!input.replay.indexLink || !technique) return { ok: false, error: REVIEW_LIBRARY_NEEDS_LINK };
  if (!input.replay.clip) return { ok: false, error: REVIEW_LIBRARY_NEEDS_CLIP };
  const label = input.replay.title.trim().replace(/\s+/g, ' ');
  const note = label && techniqueKey(label) !== techniqueKey(technique) ? label.slice(0, 500) : '';
  const now = input.now ?? Date.now();
  const result = await commitStudentFilm(
    {
      file: {
        name: input.replay.clip.name || 'review.mp4',
        type: input.replay.clip.mime || input.blob.type || 'video/mp4',
        size: input.blob.size || input.replay.clip.size,
        blob: input.blob,
      },
      technique,
      date: input.date,
      where: 'phone',
      provider: '',
      films: input.films,
      now,
    },
    input.deps,
  );
  if (!result.ok) return result;
  const film = note ? (setFilmNote([result.film], result.film.id, note, now)[0] ?? result.film) : result.film;
  const message = result.largeNote ? `${REVIEW_LIBRARY_ADDED} ${result.largeNote}` : REVIEW_LIBRARY_ADDED;
  return { ok: true, film, films: upsertFilm(input.films, film), message };
}

/** Explicit save. Does not run unless the coach asks to add the clip. */
export async function addStandaloneReviewToJournalLibrary(
  replay: ReplayBlock,
  blob: Blob,
  date: string,
  storage: MemoryStore,
  deps: FilmCommitDeps,
  now = Date.now(),
): Promise<{ ok: true; filmId: string; clipLocalId: string; message: string } | { ok: false; error: string }> {
  const result = await commitReviewToJournalLibrary({
    replay,
    blob,
    date,
    films: loadFilms(storage),
    now,
    deps,
  });
  if (!result.ok) return result;
  writeFilms(storage, result.films);
  return {
    ok: true,
    filmId: result.film.id,
    clipLocalId: replay.clip?.localId ?? '',
    message: result.message,
  };
}
