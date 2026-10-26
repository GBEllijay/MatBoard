/**
 * Fundamentals proficiency. Levels replace the old learned / not-learned mark.
 * A missing level on an older file is 3 when that line has a learned date, otherwise 0.
 */

import type { JournalClip, RubricLevel, StudentChecklistEntry } from './progress/types.ts';
import type { StudentFilm } from './studentFilm.ts';

export const FUNDAMENTAL_LEVELS = [
  { level: 0, label: 'Not started' },
  { level: 1, label: 'Introduced' },
  { level: 2, label: 'Drilling' },
  { level: 3, label: 'Live with resistance' },
  { level: 4, label: 'Hitting in rolls' },
  { level: 5, label: 'Can teach it' },
] as const;

export type FundamentalLevel = (typeof FUNDAMENTAL_LEVELS)[number]['level'];

/** Live with resistance and above. This is the old "learned" mark. */
export const FUNDAMENTAL_LIVE_LEVEL: FundamentalLevel = 3;

/** Filter for moves at level 3 and above. Plain words, not "live or better". */
export const FUNDAMENTAL_RESISTANCE_FILTER = 'Against resistance';

/** Count of moves at level 3 and above, in gym-member words. */
export function fundamentalResistanceCount(ready: number, moves: number): string {
  return `${ready} of ${moves} ready when a partner resists`;
}

export type FundamentalSort = 'list' | 'weakest' | 'recent';
export type FundamentalFilter = 'all' | 'not-started' | 'in-progress' | 'live';

export type ProficiencySummary = {
  moves: number;
  started: number;
  live: number;
  average: number;
};

export type FundamentalMoveLink = {
  href: string;
  label: string;
};

type SortableRow = {
  level: FundamentalLevel;
  label: string;
  name: string;
  updatedAt: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const CATEGORY_AREA: Record<string, string> = {
  sweeps: 'guard',
  escapes: 'escapes',
  passes: 'passing',
  submissions: 'submissions',
  takedowns: 'takedowns',
};

const AREA_LABEL: Record<string, string> = {
  guard: 'Guard',
  passing: 'Passing',
  takedowns: 'Takedowns',
  escapes: 'Escapes',
  submissions: 'Submissions',
};

export function isFundamentalLevel(value: unknown): value is FundamentalLevel {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

export function fundamentalLevelLabel(level: FundamentalLevel): string {
  return FUNDAMENTAL_LEVELS[level].label;
}

/** Explicit 0–5 wins. Otherwise a learned date is level 3 and a blank date is 0. */
export function fundamentalLevelOf(entry: { level?: unknown; learnedOn?: unknown }): FundamentalLevel {
  if (isFundamentalLevel(entry.level)) return entry.level;
  return typeof entry.learnedOn === 'string' && DATE_RE.test(entry.learnedOn) ? FUNDAMENTAL_LIVE_LEVEL : 0;
}

export function proficiencySummary(items: readonly { level: FundamentalLevel }[]): ProficiencySummary {
  const moves = items.length;
  if (!moves) return { moves: 0, started: 0, live: 0, average: 0 };
  const total = items.reduce((sum, item) => sum + item.level, 0);
  return {
    moves,
    started: items.filter((item) => item.level >= 1).length,
    live: items.filter((item) => item.level >= FUNDAMENTAL_LIVE_LEVEL).length,
    average: Math.round((total / moves) * 10) / 10,
  };
}

export function sortFundamentalRows<T extends SortableRow>(items: readonly T[], sort: FundamentalSort): T[] {
  const next = [...items];
  if (sort === 'weakest') {
    next.sort((a, b) => a.level - b.level || a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
  } else if (sort === 'recent') {
    next.sort((a, b) => b.updatedAt - a.updatedAt || a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
  }
  return next;
}

export function filterFundamentalRows<T extends { level: FundamentalLevel }>(items: readonly T[], filter: FundamentalFilter): T[] {
  if (filter === 'not-started') return items.filter((item) => item.level === 0);
  if (filter === 'in-progress') return items.filter((item) => item.level === 1 || item.level === 2);
  if (filter === 'live') return items.filter((item) => item.level >= FUNDAMENTAL_LIVE_LEVEL);
  return [...items];
}

/** YYYY-MM-DD in local time, or empty when the line has never been saved. */
export function formatFundamentalUpdated(updatedAt: number): string {
  if (!updatedAt) return '';
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function assessmentAreaForMove(categoryId: string, name: string): string {
  if (categoryId === 'positions' && /\bguard\b/i.test(name)) return 'guard';
  return CATEGORY_AREA[categoryId] ?? '';
}

export function assessmentAreaLabel(areaId: string): string {
  return AREA_LABEL[areaId] ?? '';
}

type CheckpointHit = {
  checkpointId: string;
  checkpointName: string;
  belt: string;
};

const ADULT_LINK_BELTS = ['white', 'blue', 'purple', 'brown', 'black'] as const;
const KIDS_LINK_BELTS = ['grey', 'yellow', 'orange', 'green'] as const;

/**
 * A move opens the checkpoint on the belt being worn, or on the next belt.
 * Belts further ahead are not a fallback, so white does not open purple.
 */
export function checkpointLinkBelts(currentBelt: string): readonly string[] {
  const adult = ADULT_LINK_BELTS.indexOf(currentBelt as (typeof ADULT_LINK_BELTS)[number]);
  if (adult >= 0) {
    const next = ADULT_LINK_BELTS[adult + 1];
    return next ? [currentBelt, next] : [currentBelt];
  }
  const kids = KIDS_LINK_BELTS.indexOf(currentBelt as (typeof KIDS_LINK_BELTS)[number]);
  if (kids >= 0) {
    const next = KIDS_LINK_BELTS[kids + 1];
    return next ? [currentBelt, next] : [currentBelt];
  }
  return [currentBelt];
}

/** Current belt first, then the next belt only. */
export function checkpointForMove(
  levels: readonly RubricLevel[],
  catalogItemId: string,
  currentBelt: string,
): CheckpointHit | null {
  if (!catalogItemId) return null;
  const byBelt = new Map(levels.map((level) => [level.belt, level]));
  const ordered = checkpointLinkBelts(currentBelt)
    .map((belt) => byBelt.get(belt as RubricLevel['belt']))
    .filter((level): level is RubricLevel => Boolean(level));
  for (const level of ordered) {
    for (const checkpoint of level.checkpoints) {
      const hit = checkpoint.criteria.some((criterion) =>
        criterion.techniqueRefs.some((ref) => ref.id === catalogItemId),
      );
      if (!hit) continue;
      return namedCheckpoint(checkpoint.id, checkpoint.name, level.belt, catalogItemId);
    }
  }
  if (catalogItemId === 'escape.back') {
    for (const level of ordered) {
      const checkpoint = level.checkpoints.find((row) => row.id === `checkpoint.${level.belt}.escapes`);
      if (!checkpoint) continue;
      return namedCheckpoint(checkpoint.id, checkpoint.name, level.belt, catalogItemId);
    }
  }
  return null;
}

/** Back escape belongs on the Escapes checkpoint. The link names that move. */
function namedCheckpoint(checkpointId: string, checkpointName: string, belt: string, catalogItemId: string): CheckpointHit {
  return {
    checkpointId,
    checkpointName: catalogItemId === 'escape.back' ? 'Back escape' : checkpointName,
    belt,
  };
}

function textHitsName(haystack: string, name: string): boolean {
  const needle = name.trim().toLowerCase();
  if (needle.length < 4) return false;
  return haystack.toLowerCase().includes(needle);
}

export function clipsForMove(clips: readonly JournalClip[], label: string, name: string): JournalClip[] {
  return clips.filter((clip) => {
    const haystack = `${clip.description}\n${clip.note ?? ''}`;
    return textHitsName(haystack, label) || textHitsName(haystack, name);
  });
}

export function filmsForMove(films: readonly StudentFilm[], label: string, name: string): StudentFilm[] {
  return films.filter((film) => {
    const haystack = `${film.technique}\n${film.note}\n${film.fileName}`;
    return textHitsName(haystack, label) || textHitsName(haystack, name);
  });
}

export function moveLinks(input: {
  item: { catalogItemId: string; categoryId: string; label: string; name: string };
  levels: readonly RubricLevel[];
  belt: string;
  clips: readonly JournalClip[];
  films: readonly StudentFilm[];
  to: (path: string) => string;
}): FundamentalMoveLink[] {
  const links: FundamentalMoveLink[] = [];
  const area = assessmentAreaForMove(input.item.categoryId, input.item.name);
  const areaLabel = assessmentAreaLabel(area);
  if (area && areaLabel) {
    links.push({
      href: input.to(`/student/self-assessment?from=fundamentals#assess-${area}`),
      label: `Open ${areaLabel} self-assessment`,
    });
  }
  const checkpoint = checkpointForMove(input.levels, input.item.catalogItemId, input.belt);
  if (checkpoint) {
    links.push({
      href: input.to(`/student/rubric#${checkpoint.checkpointId}`),
      label: `Open ${checkpoint.checkpointName} checkpoint`,
    });
  }
  for (const clip of clipsForMove(input.clips, input.item.label, input.item.name)) {
    links.push({
      href: input.to(`/student/videos#clip-${clip.id}`),
      label: `Open ${clip.description} in Video Library`,
    });
  }
  for (const film of filmsForMove(input.films, input.item.label, input.item.name)) {
    const title = film.technique.trim() || 'Filmed move';
    links.push({
      href: input.to(`/student/videos#film-${film.id}`),
      label: `Open ${title} in Video Library`,
    });
  }
  return links;
}

export function checklistLevelLine(entry: Pick<StudentChecklistEntry, 'displayName' | 'name' | 'level' | 'learnedOn' | 'note'>): string {
  const level = fundamentalLevelOf(entry);
  const name = entry.displayName.trim() || entry.name;
  const dated = entry.learnedOn ? `, dated ${entry.learnedOn}` : '';
  const note = entry.note.trim() ? ` — ${entry.note.trim()}` : '';
  return `${name}: ${level} ${fundamentalLevelLabel(level)}${dated}${note}`;
}
