/**
 * Fictional indexed-term card for the design preview.
 * Nothing here reads or writes a journal, a rating, a video, or a D8 score.
 */

export const TERM_CARD_PATH = '/preview/term-card';

export const NEUTRAL_RATING = 3;
export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const JOURNAL_PREVIEW_COUNT = 3;
export const SWIPE_CLOSE_PX = 72;

/** Shown while the 1–5 control is still on its untouched neutral value. */
export const NEUTRAL_NOTE = 'Defaults to 3 — neutral. Rate only if you want to.';

export const OPTIONAL_NOTE = 'Rate only if you want to.';

export const EMPTY_VIDEOS = 'No videos linked yet.';

export const EMPTY_JOURNAL = 'No journal entries yet.';

export type Rating = 1 | 2 | 3 | 4 | 5;

export type JournalEntry = {
  id: string;
  date: string;
  line: string;
};

export type SampleVideo = {
  id: string;
  title: string;
  length: string;
};

export type SampleTerm = {
  id: string;
  name: string;
  /** D8 face label, matching the assessment diamond. */
  face: string;
  entries: JournalEntry[];
  videos: SampleVideo[];
};

export type JournalPart =
  | { kind: 'text'; text: string }
  | { kind: 'term'; id: string; text: string };

export type JournalBlock = {
  id: string;
  date: string;
  parts: JournalPart[];
};

export const TERMS: SampleTerm[] = [
  {
    id: 'armbar',
    name: 'Armbar',
    face: 'Submissions',
    entries: [
      { id: 'armbar-1', date: 'Oct 28, 2026', line: 'From closed guard the armbar was there. The finish came a beat late.' },
      { id: 'armbar-2', date: 'Oct 14, 2026', line: 'Drilled the armbar from mount. The elbow line drifted.' },
      { id: 'armbar-3', date: 'Sep 30, 2026', line: 'Caught it after the grip fight. They stacked before the tap.' },
      { id: 'armbar-4', date: 'Sep 16, 2026', line: 'Entry from knee shield. I lost the bite on the arm.' },
      { id: 'armbar-5', date: 'Aug 27, 2026', line: 'Partner let me finish slow. The hips were finally close.' },
      { id: 'armbar-6', date: 'Aug 5, 2026', line: 'Tried it from the back and bailed out.' },
      { id: 'armbar-7', date: 'Jul 18, 2026', line: 'First clean tap with the armbar this month.' },
    ],
    videos: [{ id: 'armbar-video', title: 'Armbar from closed guard', length: '1:42' }],
  },
  {
    id: 'side-control',
    name: 'Side control',
    face: 'Guard / Control',
    entries: [
      { id: 'side-1', date: 'Oct 28, 2026', line: 'Spent the round in side control after the pass. Frames were late.' },
      { id: 'side-2', date: 'Oct 2, 2026', line: 'Held side control, then lost it when the knee cut through.' },
    ],
    videos: [],
  },
  {
    id: 'guard',
    name: 'Guard',
    face: 'Guard / Control',
    entries: [
      { id: 'guard-1', date: 'Oct 28, 2026', line: 'Closed guard held until the grip broke.' },
      { id: 'guard-2', date: 'Sep 16, 2026', line: 'Open guard entries were slow. The knee shield came back.' },
    ],
    videos: [],
  },
  {
    id: 'side-control-escape',
    name: 'Side control escape',
    face: 'Escapes / Defense',
    entries: [
      { id: 'escape-1', date: 'Oct 21, 2026', line: "Stayed calm under side control, didn't panic." },
      { id: 'escape-2', date: 'Sep 9, 2026', line: 'Framed the hip and made a little space. No escape yet.' },
    ],
    videos: [],
  },
];

export const JOURNAL: JournalBlock[] = [
  {
    id: 'oct-28',
    date: 'Oct 28',
    parts: [
      { kind: 'text', text: 'From closed ' },
      { kind: 'term', id: 'guard', text: 'guard' },
      { kind: 'text', text: ' I hunted an ' },
      { kind: 'term', id: 'armbar', text: 'armbar' },
      { kind: 'text', text: ', lost the grip, and spent the rest of the round in ' },
      { kind: 'term', id: 'side-control', text: 'side control' },
      { kind: 'text', text: '.' },
    ],
  },
  {
    id: 'oct-21',
    date: 'Oct 21',
    parts: [
      { kind: 'term', id: 'side-control-escape', text: 'Side control escape' },
      { kind: 'text', text: " is still early. Stayed calm under side control, didn't panic." },
    ],
  },
];

export function termById(id: string | null | undefined): SampleTerm | null {
  if (!id) return null;
  return TERMS.find((term) => term.id === id) ?? null;
}

export function termIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('term');
  return termById(id)?.id ?? null;
}

/** Untouched ratings stay at 3. A chosen 1–5 is kept. Anything else falls back to 3. */
export function shownRating(value: number | null | undefined): Rating {
  if (value == null || !Number.isInteger(value) || value < RATING_MIN || value > RATING_MAX) return NEUTRAL_RATING;
  return value as Rating;
}

export function ratingNote(value: number | null | undefined): string {
  return shownRating(value) === NEUTRAL_RATING ? NEUTRAL_NOTE : OPTIONAL_NOTE;
}

export function previewEntries(term: SampleTerm, expanded: boolean): JournalEntry[] {
  if (expanded || term.entries.length <= JOURNAL_PREVIEW_COUNT) return term.entries;
  return term.entries.slice(0, JOURNAL_PREVIEW_COUNT);
}

export function seeAllLabel(count: number): string {
  return `See all ${count} entries`;
}

export function shouldCloseSwipe(dy: number, dx: number): boolean {
  return dy >= SWIPE_CLOSE_PX && dy > Math.abs(dx);
}
