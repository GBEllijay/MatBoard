/**
 * Cards on the instructor D12. Each pentagonal face can hold teaching cards
 * the instructor adds, plus a few starter cards on Public Speaking and
 * Preparation. Face scores roll up from these cards. The daily 1–5 check-in
 * in instructorD12.ts is separate and is never rewritten here.
 *
 * Saved under INSTRUCTOR_D12_CARDS_STORAGE_KEY, keyed by instructor seat.
 */
import { isAssessmentScore, type AssessmentScore } from './studentAssessment.ts';
import { INSTRUCTOR_D12_FACES, instructorD12SeatKey, type InstructorD12FaceId, type InstructorD12Scores } from './instructorD12.ts';

export const INSTRUCTOR_D12_CARDS_STORAGE_KEY = 'matboard.instructor.d12.cards.v1';

export const NEUTRAL_RATING: AssessmentScore = 3;

/** Shown while the 1–5 control is still on its untouched neutral value. */
export const NEUTRAL_NOTE = 'Defaults to 3 — neutral. Rate only if you want to.';

export const OPTIONAL_NOTE = 'Rate only if you want to.';

export const DUPLICATE_NAME = 'Already on this face.';

export const D12_SHAPE_METRICS = [
  { id: 'card-ratings', label: 'Card ratings' },
  { id: 'check-ins', label: 'Check-ins' },
] as const;

export type D12ShapeMetric = (typeof D12_SHAPE_METRICS)[number]['id'];

/** Live D8 shapes from cards by default; check-in is a separate source. */
export const D12_DEFAULT_SHAPE_METRIC: D12ShapeMetric = 'card-ratings';

export const D12_DELETE_CARD = 'Delete';
export const D12_CONFIRM_DELETE_CARD = 'Confirm delete';
export const D12_KEEP_CARD = 'Keep card';
export const D12_DELETE_PROMPT = 'Remove this card?';

/**
 * Relief for one face under the selected shape metric.
 * Card ratings use the rounded face average (empty face is 3).
 * Check-ins use the saved daily score, or null when that face is unrated.
 */
export function d12FaceRelief(
  faceId: InstructorD12FaceId,
  metric: D12ShapeMetric,
  cards: readonly InstructorD12Card[],
  scores: InstructorD12Scores | null | undefined,
): AssessmentScore | null {
  if (metric === 'check-ins') {
    const raw = scores?.[faceId];
    return isAssessmentScore(raw) ? raw : null;
  }
  return d12CardFaceScore(cards, faceId);
}

const NAME_MAX = 80;
const CARD_MAX = 400;

export type InstructorD12Card = {
  id: string;
  faceId: InstructorD12FaceId;
  name: string;
  /** Missing means the instructor has not rated it. Rollup and the card show 3. */
  rating?: AssessmentScore;
  addedAt: number;
  /** The instructor's own notes on this card. */
  notes?: string;
  /** Opt-in flag: whether notes on this card are included in a student-share bundle. Private by default. */
  shareNotes?: boolean;
  /** Reference links the instructor added. */
  videos?: InstructorD12CardVideo[];
};

export type InstructorD12CardVideo = { title: string; href: string; shareWithStudents?: boolean };

export const D12_CARD_NOTES_MAX = 2000;
export const D12_CARD_VIDEOS_MAX = 12;

export type InstructorD12CardsFile = {
  v: 1;
  cardsBySeat: Record<string, InstructorD12Card[]>;
};

export const INSTRUCTOR_D12_STARTER_CARDS: readonly InstructorD12Card[] = [
  {
    id: 'starter.public-speaking.intro-end-of-class-message',
    faceId: 'public-speaking',
    name: 'Intro / end-of-class message',
    addedAt: 1,
  },
  {
    id: 'starter.public-speaking.speaking-in-front-of-class-and-keeping-attention',
    faceId: 'public-speaking',
    name: 'Speaking in front of class and keeping attention',
    addedAt: 2,
  },
  {
    id: 'starter.public-speaking.communicating-with-parents-off-the-mat',
    faceId: 'public-speaking',
    name: 'Communicating with parents off the mat',
    addedAt: 3,
  },
  {
    id: 'starter.preparation.clean-uniform-laundry',
    faceId: 'preparation',
    name: 'Clean uniform / laundry',
    addedAt: 4,
  },
  {
    id: 'starter.preparation.mat-inspection',
    faceId: 'preparation',
    name: 'Mat inspection',
    addedAt: 5,
  },
  {
    id: 'starter.preparation.lesson-plan-video-review',
    faceId: 'preparation',
    name: 'Lesson plan / video review',
    addedAt: 6,
  },
] as const;

export function instructorD12StarterCards(): InstructorD12Card[] {
  return INSTRUCTOR_D12_STARTER_CARDS.map((card) => ({ ...card }));
}

export function isInstructorD12FaceId(value: string): value is InstructorD12FaceId {
  return INSTRUCTOR_D12_FACES.some((face) => face.id === value);
}

export function shownD12CardRating(value: number | null | undefined): AssessmentScore {
  return isAssessmentScore(value) ? value : NEUTRAL_RATING;
}

export function d12CardRatingNote(value: number | null | undefined): string {
  return shownD12CardRating(value) === NEUTRAL_RATING ? NEUTRAL_NOTE : OPTIONAL_NOTE;
}

/**
 * Rounded average of every card. An unrated card counts as a neutral 3.
 * An empty face is the neutral 3.
 */
export function d12CardFaceAverage(ratings: readonly (number | null | undefined)[]): AssessmentScore {
  if (!ratings.length) return NEUTRAL_RATING;
  const values = ratings.map((value) => shownD12CardRating(value));
  const rounded = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return isAssessmentScore(rounded) ? rounded : NEUTRAL_RATING;
}

/**
 * Unrounded mean, to one decimal. An unrated card counts as a neutral 3.
 * An empty face is the neutral 3. Geometry still uses d12CardFaceAverage.
 */
export function d12CardFaceAverageExact(ratings: readonly (number | null | undefined)[]): number {
  if (!ratings.length) return NEUTRAL_RATING;
  const values = ratings.map((value) => shownD12CardRating(value));
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.round(mean * 10) / 10;
}

export function d12CardsOnFace(cards: readonly InstructorD12Card[], faceId: InstructorD12FaceId): InstructorD12Card[] {
  return cards.filter((card) => card.faceId === faceId);
}

export function d12CardFaceScore(cards: readonly InstructorD12Card[], faceId: InstructorD12FaceId): AssessmentScore {
  return d12CardFaceAverage(d12CardsOnFace(cards, faceId).map((card) => card.rating));
}

export function d12CardFaceScoreExact(cards: readonly InstructorD12Card[], faceId: InstructorD12FaceId): number {
  return d12CardFaceAverageExact(d12CardsOnFace(cards, faceId).map((card) => card.rating));
}

export function d12CardFaceScoreLine(cards: readonly InstructorD12Card[], faceId: InstructorD12FaceId): string {
  return `Face score ${d12CardFaceScoreExact(cards, faceId).toFixed(1)} / 5`;
}

export function cleanD12CardName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export function d12CardNameKey(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return folded.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-');
}

export type D12CardNameReview = { label: string } | { error: 'blank' | 'duplicate' };

/** A blank name is ignored. A name already on this face is a duplicate. */
export function reviewD12CardName(cards: readonly InstructorD12Card[], faceId: InstructorD12FaceId, name: string, ignoreId?: string): D12CardNameReview {
  const label = cleanD12CardName(name);
  if (!label) return { error: 'blank' };
  const key = d12CardNameKey(label);
  const taken = cards.some((card) => card.faceId === faceId && card.id !== ignoreId && d12CardNameKey(card.name) === key);
  if (taken) return { error: 'duplicate' };
  return { label };
}

export function newD12CardId(faceId: InstructorD12FaceId, name: string, at = Date.now()): string {
  const stamp = at.toString(36);
  const salt = Math.random().toString(36).slice(2, 8);
  return `d12.${faceId}.${d12CardNameKey(name) || 'card'}.${stamp}.${salt}`.slice(0, 80);
}

/**
 * Oldest card first, then name. Used so a new card takes the next outward
 * tile and cards already placed keep their seats when the grid size stays put.
 */
export function d12CardsInPlaceOrder(cards: readonly InstructorD12Card[]): InstructorD12Card[] {
  return [...cards].sort((left, right) => left.addedAt - right.addedAt || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}

function emptyFile(): InstructorD12CardsFile {
  return { v: 1, cardsBySeat: {} };
}

function cleanCard(value: unknown): InstructorD12Card | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<InstructorD12Card>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const faceId = typeof row.faceId === 'string' && isInstructorD12FaceId(row.faceId) ? row.faceId : null;
  const name = cleanD12CardName(typeof row.name === 'string' ? row.name : '');
  if (!id || id.length > 80 || !faceId || !name) return null;
  const addedAt = typeof row.addedAt === 'number' && Number.isFinite(row.addedAt) ? row.addedAt : 0;
  const card: InstructorD12Card = { id, faceId, name, addedAt };
  if (isAssessmentScore(row.rating)) card.rating = row.rating;
  const notes = cleanD12Notes(typeof row.notes === 'string' ? row.notes : '');
  if (notes) card.notes = notes;
  if (row.shareNotes === true) card.shareNotes = true;
  const videos = cleanD12Videos(row.videos);
  if (videos.length) card.videos = videos;
  return card;
}

export function cleanD12Notes(value: string): string {
  return value.replace(/\r\n/g, '\n').trim().slice(0, D12_CARD_NOTES_MAX);
}

/** Only http(s) links are kept. A missing title falls back to the link. */
export function cleanD12Video(title: string, href: string, shareWithStudents = false): InstructorD12CardVideo | null {
  const link = href.trim();
  if (!/^https?:\/\/\S+$/i.test(link) || link.length > 500) return null;
  const label = title.replace(/\s+/g, ' ').trim().slice(0, 120) || link;
  return shareWithStudents ? { title: label, href: link, shareWithStudents: true } : { title: label, href: link };
}

function cleanD12Videos(raw: unknown): InstructorD12CardVideo[] {
  if (!Array.isArray(raw)) return [];
  const out: InstructorD12CardVideo[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const value = row as Partial<InstructorD12CardVideo>;
    const video = cleanD12Video(
      typeof value.title === 'string' ? value.title : '',
      typeof value.href === 'string' ? value.href : '',
      value.shareWithStudents === true,
    );
    if (video && !out.some((item) => item.href === video.href)) out.push(video);
    if (out.length >= D12_CARD_VIDEOS_MAX) break;
  }
  return out;
}

function cleanCardList(raw: unknown): InstructorD12Card[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const next: InstructorD12Card[] = [];
  for (const row of raw) {
    const card = cleanCard(row);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    next.push(card);
    if (next.length >= CARD_MAX) break;
  }
  return next;
}

function readFile(storage: Pick<Storage, 'getItem'>): InstructorD12CardsFile {
  try {
    const raw = storage.getItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY);
    if (!raw) return emptyFile();
    const parsed = JSON.parse(raw) as { v?: number; cardsBySeat?: Record<string, unknown> };
    if (!parsed || parsed.v !== 1 || !parsed.cardsBySeat || typeof parsed.cardsBySeat !== 'object') {
      return emptyFile();
    }
    return {
      v: 1,
      cardsBySeat: Object.fromEntries(
        Object.entries(parsed.cardsBySeat).map(([key, value]) => [key, cleanCardList(value)]),
      ),
    };
  } catch {
    return emptyFile();
  }
}

/**
 * Cards for this seat. A seat with no saved file gets the starter subset
 * in memory only; nothing is written until the instructor saves a change.
 * An explicit empty list in the file is left empty, so deleted starters
 * do not come back.
 */
export function loadInstructorD12Cards(
  storage: Pick<Storage, 'getItem'> = localStorage,
  seatKey = 'owner',
): InstructorD12Card[] {
  const key = instructorD12SeatKey(seatKey);
  const file = readFile(storage);
  if (!Object.prototype.hasOwnProperty.call(file.cardsBySeat, key)) return instructorD12StarterCards();
  return file.cardsBySeat[key] ?? [];
}

const CARDS_CHANGE_EVENT = 'matboard-instructor-d12-cards';

export function subscribeInstructorD12Cards(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(CARDS_CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CARDS_CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function saveInstructorD12Cards(
  cards: readonly InstructorD12Card[],
  storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage,
  seatKey = 'owner',
): InstructorD12Card[] {
  const key = instructorD12SeatKey(seatKey);
  const file = readFile(storage);
  const clean = cleanCardList(cards);
  file.cardsBySeat[key] = clean;
  storage.setItem(INSTRUCTOR_D12_CARDS_STORAGE_KEY, JSON.stringify(file));
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(CARDS_CHANGE_EVENT));
  }
  return clean;
}

export function addInstructorD12Card(
  cards: readonly InstructorD12Card[],
  faceId: InstructorD12FaceId,
  name: string,
  rating?: AssessmentScore | null,
  at = Date.now(),
): { cards: InstructorD12Card[]; card: InstructorD12Card } | { error: 'blank' | 'duplicate' } {
  const review = reviewD12CardName(cards, faceId, name);
  if ('error' in review) return review;
  const card: InstructorD12Card = {
    id: newD12CardId(faceId, review.label, at),
    faceId,
    name: review.label,
    addedAt: at,
  };
  if (isAssessmentScore(rating)) card.rating = rating;
  return { cards: [...cards, card], card };
}

export function rateInstructorD12Card(
  cards: readonly InstructorD12Card[],
  id: string,
  rating: AssessmentScore,
): InstructorD12Card[] {
  if (!isAssessmentScore(rating)) return [...cards];
  return cards.map((card) => (card.id === id ? { ...card, rating } : card));
}

export function removeInstructorD12Card(cards: readonly InstructorD12Card[], id: string): InstructorD12Card[] {
  return cards.filter((card) => card.id !== id);
}


export function withD12CardNotes(cards: readonly InstructorD12Card[], id: string, notes: string): InstructorD12Card[] {
  const clean = cleanD12Notes(notes);
  return cards.map((card) => {
    if (card.id !== id) return card;
    const next = { ...card };
    if (clean) next.notes = clean;
    else delete next.notes;
    return next;
  });
}

export function withD12CardVideo(
  cards: readonly InstructorD12Card[],
  id: string,
  title: string,
  href: string,
): { cards: InstructorD12Card[] } | { error: 'link' | 'full' } {
  const video = cleanD12Video(title, href);
  if (!video) return { error: 'link' };
  const card = cards.find((item) => item.id === id);
  const list = card?.videos ?? [];
  if (list.length >= D12_CARD_VIDEOS_MAX) return { error: 'full' };
  if (list.some((item) => item.href === video.href)) return { cards: [...cards] };
  return { cards: cards.map((item) => (item.id === id ? { ...item, videos: [...list, video] } : item)) };
}

export function withoutD12CardVideo(cards: readonly InstructorD12Card[], id: string, href: string): InstructorD12Card[] {
  return cards.map((card) => {
    if (card.id !== id || !card.videos) return card;
    const videos = card.videos.filter((video) => video.href !== href);
    const next = { ...card };
    if (videos.length) next.videos = videos;
    else delete next.videos;
    return next;
  });
}

/**
 * Rename a card or move it to another D12 face. The id stays the same, so
 * Path to Mastery connections follow the card. A moved card takes the next
 * open seat on its new face (newest addedAt), so cards already there keep
 * their places; the old face re-lays center-out like a removal.
 */
export function editInstructorD12Card(
  cards: readonly InstructorD12Card[],
  id: string,
  edit: { name: string; faceId: InstructorD12FaceId | null },
  at = Date.now(),
): { cards: InstructorD12Card[] } | { error: 'blank' | 'duplicate' | 'face' | 'missing' } {
  const card = cards.find((item) => item.id === id);
  if (!card) return { error: 'missing' };
  if (!edit.faceId || !isInstructorD12FaceId(edit.faceId)) return { error: 'face' };
  const review = reviewD12CardName(cards, edit.faceId, edit.name, id);
  if ('error' in review) return review;
  const moved = edit.faceId !== card.faceId;
  return {
    cards: cards.map((item) =>
      item.id === id ? { ...item, name: review.label, faceId: edit.faceId!, addedAt: moved ? at : item.addedAt } : item,
    ),
  };
}

export function toggleD12CardNoteShare(cards: readonly InstructorD12Card[], id: string, share: boolean): InstructorD12Card[] {
  return cards.map((card) => {
    if (card.id !== id) return card;
    const next = { ...card };
    if (share) next.shareNotes = true;
    else delete next.shareNotes;
    return next;
  });
}

export function toggleD12CardVideoShare(
  cards: readonly InstructorD12Card[],
  id: string,
  href: string,
  share: boolean,
): InstructorD12Card[] {
  return cards.map((card) => {
    if (card.id !== id || !card.videos) return card;
    return {
      ...card,
      videos: card.videos.map((video) => {
        if (video.href !== href) return video;
        const next: InstructorD12CardVideo = { title: video.title, href: video.href };
        if (share) next.shareWithStudents = true;
        return next;
      }),
    };
  });
}
