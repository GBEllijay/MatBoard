/**
 * Student and Competitor roster order and the A–Z jump index.
 * Stored roster order stays first-name (`sortStudents`). The list on screen
 * uses this order, defaulting to last name, and the index follows it.
 */

export type RosterSortMode = 'last' | 'first';

export const ROSTER_SORT_KEY = 'matboard.rosterSort.v1';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export type RosterIndexEntry = {
  letter: string;
  count: number;
  /** Id of the first student under this letter, in the active sort. */
  firstId: string | null;
};

export function rosterNameParts(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

function foldLetter(word: string): string {
  const ch = word.normalize('NFD').replace(/\p{M}/gu, '').charAt(0).toUpperCase();
  return LETTERS.includes(ch) ? ch : '#';
}

/** A–Z from the name the active sort uses. Blank and non-letters are #. */
export function rosterIndexLetter(name: string, mode: RosterSortMode): string {
  const parts = rosterNameParts(name);
  const word = mode === 'last' ? parts.last : parts.first;
  if (!word) return '#';
  return foldLetter(word);
}

export function compareRosterNames(a: string, b: string, mode: RosterSortMode): number {
  const pa = rosterNameParts(a);
  const pb = rosterNameParts(b);
  const blankA = !pa.last && !pa.first;
  const blankB = !pb.last && !pb.first;
  if (blankA !== blankB) return blankA ? 1 : -1;
  const primaryA = mode === 'last' ? pa.last : pa.first;
  const primaryB = mode === 'last' ? pb.last : pb.first;
  const secondaryA = mode === 'last' ? pa.first : pa.last;
  const secondaryB = mode === 'last' ? pb.first : pb.last;
  return (
    primaryA.localeCompare(primaryB, undefined, { sensitivity: 'base' }) ||
    secondaryA.localeCompare(secondaryB, undefined, { sensitivity: 'base' }) ||
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  );
}

export function sortRoster<T extends { name: string }>(rows: readonly T[], mode: RosterSortMode): T[] {
  return [...rows].sort((a, b) => compareRosterNames(a.name, b.name, mode));
}

/** A–Z plus #. Letters with nobody are count 0 and firstId null. */
export function rosterIndex<T extends { id: string; name: string }>(
  rows: readonly T[],
  mode: RosterSortMode,
): RosterIndexEntry[] {
  const sorted = sortRoster(rows, mode);
  const hits = new Map<string, { count: number; firstId: string }>();
  for (const row of sorted) {
    const letter = rosterIndexLetter(row.name, mode);
    const hit = hits.get(letter);
    if (!hit) hits.set(letter, { count: 1, firstId: row.id });
    else hit.count += 1;
  }
  return [...LETTERS, '#'].map((letter) => {
    const hit = hits.get(letter);
    return { letter, count: hit?.count ?? 0, firstId: hit?.firstId ?? null };
  });
}

export function readRosterSort(storage: Pick<Storage, 'getItem'> | null): RosterSortMode {
  try {
    return storage?.getItem(ROSTER_SORT_KEY) === 'first' ? 'first' : 'last';
  } catch {
    return 'last';
  }
}

export function writeRosterSort(mode: RosterSortMode, storage: Pick<Storage, 'setItem'> | null): void {
  try {
    storage?.setItem(ROSTER_SORT_KEY, mode);
  } catch {
    /* private mode */
  }
}

/**
 * A finger move on a roster card. Vertical movement scrolls the list and the
 * page. A short move stays a tap. A clearly horizontal move is left for the
 * coach page swipe. Callers must not preventDefault on scroll or tap.
 */
export function rosterSwipeIntent(dx: number, dy: number): 'scroll' | 'horizontal' | 'tap' {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < 10 && absY < 10) return 'tap';
  if (absY >= absX) return 'scroll';
  return 'horizontal';
}

export type LetterBand = { letter: string; top: number; bottom: number };

/**
 * Letter under a finger on an evenly divided strip.
 * Uses the strip box, not each button's midpoint, so a release on V stays on V.
 */
export function letterInStrip(letters: readonly string[], top: number, bottom: number, clientY: number): string | null {
  if (!letters.length || !(bottom > top) || !Number.isFinite(clientY)) return null;
  const span = bottom - top;
  const y = Math.min(Math.max(clientY, top), bottom - 1e-6);
  const index = Math.min(letters.length - 1, Math.max(0, Math.floor(((y - top) / span) * letters.length)));
  return letters[index] ?? null;
}

/** Which index letter a drag is over. Bands are the letter buttons, top to bottom. */
export function letterAtClientY(bands: readonly LetterBand[], clientY: number): string | null {
  if (!bands.length) return null;
  return letterInStrip(
    bands.map((band) => band.letter),
    bands[0].top,
    bands[bands.length - 1].bottom,
    clientY,
  );
}

/** Instant jump offset. No smooth-scroll lag. */
export function rosterJumpTop(targetTop: number, scrollerTop: number, scrollTop: number, clearance = 8): number {
  if (![targetTop, scrollerTop, scrollTop, clearance].every(Number.isFinite)) return Math.max(0, scrollTop);
  return Math.max(0, targetTop - scrollerTop + scrollTop - clearance);
}
