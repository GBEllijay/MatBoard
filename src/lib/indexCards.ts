/**
 * Live index cards for one student on this phone.
 * A card is keyed by a normalized term, so the same move opened from the D8,
 * the journal, or another screen is the same card.
 * Ratings live in their own local key. This file does not rewrite the journal
 * or a self-assessment.
 */

import type { AssessmentScore, AssessmentScores } from './studentAssessment.ts';
import { journalFields } from './journalIndex.ts';
import type { JournalEntry } from './progress/types.ts';

export const INDEX_CARDS_STORAGE_KEY = 'matboard.studentEdition.indexCards.v1';

export const INDEX_FACE_IDS = [
  'guard-control',
  'passing',
  'sweeps',
  'takedowns',
  'escapes-defense',
  'submissions',
  'conditioning',
  'mindset',
] as const;

export type IndexFaceId = (typeof INDEX_FACE_IDS)[number];

export const NEUTRAL_RATING = 3;

/** Shown while the 1–5 control is still on its untouched neutral value. */
export const NEUTRAL_NOTE = 'Defaults to 3 — neutral. Rate only if you want to.';

export const OPTIONAL_NOTE = 'Rate only if you want to.';

export const EMPTY_JOURNAL = 'No journal entries mention this yet.';

export const EMPTY_VIDEOS = 'No videos linked to this yet.';

export const DUPLICATE_NAME = 'Already on this face.';

const NAME_MAX = 80;
const VIDEO_TITLE_MAX = 120;
const VIDEO_HREF_MAX = 500;
const CARD_MAX = 400;
/** Longest note the student can keep on one card. */
export const CARD_NOTES_MAX = 1000;
/** Connections one card can hold. */
export const CARD_LINKS_MAX = 24;

export type CatalogLine = {
  id: string;
  faceId: IndexFaceId;
  faceLabel: string;
  name: string;
  /** Short name drawn on a diamond tile. */
  tile: string;
};

export type CardVideo = {
  title: string;
  href: string;
};

/** leads = this move leads to the other. defense = the other defends or counters this move. */
export type CardLinkRelation = 'leads' | 'defense';

/**
 * A Technique Tree connection the student added from a card. `to` is the other card's id,
 * or `gl.<key>` for a glossary move that is not on their D8 yet; `name` is then its glossary name.
 */
export type CardLink = {
  to: string;
  relation: CardLinkRelation;
  name?: string;
};

/** Link target id for a glossary move that is not a D8 card. */
export function glossaryLinkId(key: string): string {
  return `gl.${key}`;
}

/** A stored move with no D8 face, from an old file or an import. Not drawn and never glossary-tagged. */
export const UNSORTED_FACE = 'other';

export type StoredFaceId = IndexFaceId | typeof UNSORTED_FACE;

export type StoredIndexCard = {
  id: string;
  /** "other" only for a legacy or imported card the student has not placed yet. */
  faceId: StoredFaceId;
  name: string;
  /** The student's own name for a built-in move. The built-in name stays in the catalog. */
  userName?: string;
  /** The student's own face for a built-in move. Their choice wins on their D8. */
  userFace?: IndexFaceId;
  /** Missing means the student has not rated it. The card shows 3. */
  rating?: AssessmentScore;
  addedAt?: number;
  video?: CardVideo | null;
  /** The student's own notes on this card. Plain text. */
  notes?: string;
  /** Technique Tree connections added from this card. */
  links?: CardLink[];
  /** Reserved for a later tree. Nothing draws this yet. */
  tree: null;
};

export type IndexCardFile = {
  version: 1;
  cards: StoredIndexCard[];
};

export type LiveCard = {
  id: string;
  faceId: IndexFaceId;
  faceLabel: string;
  name: string;
  tile: string;
  rating: AssessmentScore;
  /** False when the student has never chosen a 1–5. */
  touched: boolean;
  addedAt: number;
  custom: boolean;
  /** True when the student renamed or moved a built-in move. */
  edited: boolean;
  /** Built-in name and face, before the student's own. Same as name and faceId for a custom card. */
  baseName: string;
  baseFaceId: IndexFaceId;
  video: CardVideo | null;
  /** The student's notes. Empty when none. Optional so older sample cards still type-check. */
  notes?: string;
  /** Connections added from this card. */
  links?: CardLink[];
  tree: null;
};

export type JournalMention = {
  id: string;
  date: string;
  line: string;
};

export type TermVideo = {
  id: string;
  title: string;
  href: string;
  where: 'library' | 'phone' | 'card';
};

export type TermAlias = {
  id: string;
  name: string;
};

type MemoryStore = Pick<Storage, 'getItem' | 'setItem'>;

const SCORE = [1, 2, 3, 4, 5] as const;

export function isAssessmentScore(value: unknown): value is AssessmentScore {
  return typeof value === 'number' && SCORE.includes(value as AssessmentScore);
}

export function isIndexFaceId(value: string): value is IndexFaceId {
  return (INDEX_FACE_IDS as readonly string[]).includes(value);
}

/** Lowercase, accents dropped, punctuation turned into single hyphens. */
export function termKey(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return folded.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-');
}

export function emptyIndexCards(): IndexCardFile {
  return { version: 1, cards: [] };
}

export function shownRating(value: number | null | undefined): AssessmentScore {
  return isAssessmentScore(value) ? value : NEUTRAL_RATING;
}

export function ratingNote(value: number | null | undefined): string {
  return shownRating(value) === NEUTRAL_RATING ? NEUTRAL_NOTE : OPTIONAL_NOTE;
}

function scoredRatings(ratings: readonly number[]): AssessmentScore[] {
  return ratings.filter((value): value is AssessmentScore => isAssessmentScore(value));
}

/** Rounded average of every line. An empty face is the neutral 3. */
export function faceAverage(ratings: readonly number[]): AssessmentScore {
  const scored = scoredRatings(ratings);
  if (!scored.length) return NEUTRAL_RATING;
  const rounded = Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
  return isAssessmentScore(rounded) ? rounded : NEUTRAL_RATING;
}

/** Unrounded mean, to one decimal. An empty face is the neutral 3. Geometry still uses faceAverage. */
export function faceAverageExact(ratings: readonly number[]): number {
  const scored = scoredRatings(ratings);
  if (!scored.length) return NEUTRAL_RATING;
  const mean = scored.reduce((sum, value) => sum + value, 0) / scored.length;
  return Math.round(mean * 10) / 10;
}

export function loadIndexCards(storage: Pick<Storage, 'getItem'>): IndexCardFile {
  try {
    const raw = storage.getItem(INDEX_CARDS_STORAGE_KEY);
    if (!raw) return emptyIndexCards();
    return normalizeFile(JSON.parse(raw));
  } catch {
    return emptyIndexCards();
  }
}

export function writeIndexCards(storage: MemoryStore, file: IndexCardFile): IndexCardFile {
  const clean = normalizeFile(file);
  storage.setItem(INDEX_CARDS_STORAGE_KEY, JSON.stringify(clean));
  return clean;
}

function normalizeFile(value: unknown): IndexCardFile {
  const cards = value && typeof value === 'object' && Array.isArray((value as { cards?: unknown }).cards)
    ? (value as { cards: unknown[] }).cards
    : [];
  const seen = new Set<string>();
  const next: StoredIndexCard[] = [];
  for (const row of cards) {
    const card = cleanCard(row);
    if (!card || seen.has(card.id)) continue;
    seen.add(card.id);
    next.push(card);
    if (next.length >= CARD_MAX) break;
  }
  return { version: 1, cards: next };
}

function cleanCard(value: unknown): StoredIndexCard | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<StoredIndexCard>;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const rawFace = typeof row.faceId === 'string' ? row.faceId : '';
  const faceId: StoredFaceId = isIndexFaceId(rawFace) ? rawFace : UNSORTED_FACE;
  const name = cleanName(typeof row.name === 'string' ? row.name : '');
  if (!id || id.length > 80 || !name) return null;
  const card: StoredIndexCard = { id, faceId, name, tree: null };
  const userName = cleanName(typeof row.userName === 'string' ? row.userName : '');
  if (userName) card.userName = userName;
  if (typeof row.userFace === 'string' && isIndexFaceId(row.userFace)) card.userFace = row.userFace;
  if (isAssessmentScore(row.rating)) card.rating = row.rating;
  if (typeof row.addedAt === 'number' && Number.isFinite(row.addedAt)) card.addedAt = row.addedAt;
  const video = cleanVideo(row.video);
  if (video) card.video = video;
  const notes = cleanNotes(row.notes);
  if (notes) card.notes = notes;
  const links = cleanLinks(row.links, id);
  if (links.length) card.links = links;
  return card;
}

/** Trimmed at the ends, line breaks kept, capped. Non-text is dropped. */
export function cleanNotes(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').trim().slice(0, CARD_NOTES_MAX);
}

/** Valid, de-duplicated connections. A card never links to itself. */
export function cleanLinks(value: unknown, selfId: string): CardLink[] {
  if (!Array.isArray(value)) return [];
  const out: CardLink[] = [];
  const seen = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Partial<CardLink>;
    const to = typeof item.to === 'string' ? item.to.trim() : '';
    const relation = item.relation === 'defense' ? 'defense' : item.relation === 'leads' ? 'leads' : null;
    if (!to || to.length > 80 || to === selfId || !relation) continue;
    const name = typeof item.name === 'string' ? cleanName(item.name) : '';
    if (to.startsWith('gl.') && !name) continue;
    const key = `${relation}:${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name ? { to, relation, name } : { to, relation });
    if (out.length >= CARD_LINKS_MAX) break;
  }
  return out;
}

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
}

function cleanVideo(value: unknown): CardVideo | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Partial<CardVideo>;
  const href = typeof row.href === 'string' ? row.href.trim().slice(0, VIDEO_HREF_MAX) : '';
  if (!/^https?:\/\//i.test(href)) return null;
  const title = typeof row.title === 'string' ? row.title.trim().replace(/\s+/g, ' ').slice(0, VIDEO_TITLE_MAX) : '';
  return { title, href };
}

export function assembleCards(catalog: readonly CatalogLine[], file: IndexCardFile): LiveCard[] {
  const stored = new Map(file.cards.map((card) => [card.id, card]));
  const cards: LiveCard[] = catalog.map((line) => liveFromCatalog(line, stored.get(line.id), catalog));
  for (const saved of file.cards) {
    if (catalog.some((line) => line.id === saved.id)) continue;
    const faceId = saved.faceId;
    if (!isIndexFaceId(faceId)) continue;
    cards.push({
      id: saved.id,
      faceId,
      faceLabel: faceLabelFrom(catalog, faceId),
      name: saved.name,
      tile: saved.name,
      rating: shownRating(saved.rating),
      touched: isAssessmentScore(saved.rating),
      addedAt: saved.addedAt ?? 0,
      custom: true,
      edited: false,
      baseName: saved.name,
      baseFaceId: faceId,
      video: saved.video ?? null,
      notes: saved.notes ?? '',
      links: saved.links ?? [],
      tree: null,
    });
  }
  return cards;
}

function faceLabelFrom(catalog: readonly CatalogLine[], faceId: IndexFaceId): string {
  return catalog.find((line) => line.faceId === faceId)?.faceLabel ?? faceId;
}

function liveFromCatalog(line: CatalogLine, saved: StoredIndexCard | undefined, catalog: readonly CatalogLine[]): LiveCard {
  const faceId = saved?.userFace ?? line.faceId;
  const name = saved?.userName ?? line.name;
  return {
    id: line.id,
    faceId,
    faceLabel: faceId === line.faceId ? line.faceLabel : faceLabelFrom(catalog, faceId),
    name,
    tile: saved?.userName ?? line.tile,
    rating: shownRating(saved?.rating),
    touched: isAssessmentScore(saved?.rating),
    addedAt: saved?.addedAt ?? 0,
    custom: false,
    edited: Boolean(saved?.userName || saved?.userFace),
    baseName: line.name,
    baseFaceId: line.faceId,
    video: saved?.video ?? null,
    notes: saved?.notes ?? '',
    links: saved?.links ?? [],
    tree: null,
  };
}

/** Stored moves with no D8 face yet. The D8 asks the student to place them. */
export function unsortedCards(file: IndexCardFile): StoredIndexCard[] {
  return file.cards.filter((card) => card.faceId === UNSORTED_FACE);
}

type KeptFields = Pick<StoredIndexCard, 'userName' | 'userFace' | 'notes' | 'links'>;

/** The student's own name, face, notes, and connections survive a rating or video save. */
function keepEdits(file: IndexCardFile, id: string): KeptFields {
  const saved = file.cards.find((card) => card.id === id);
  const keep: KeptFields = {};
  if (saved?.userName) keep.userName = saved.userName;
  if (saved?.userFace) keep.userFace = saved.userFace;
  if (saved?.notes) keep.notes = saved.notes;
  if (saved?.links?.length) keep.links = saved.links;
  return keep;
}

export type CardEdit = { name: string; faceId: IndexFaceId };

/**
 * The student's own name and face for any move. A built-in move keeps its catalog entry and
 * stores the student's version beside it. A custom or unsorted move is simply rewritten.
 * Any of the eight faces is allowed. There is no "Other".
 */
export function withCardEdit(
  catalog: readonly CatalogLine[],
  file: IndexCardFile,
  id: string,
  edit: CardEdit,
  now = Date.now(),
): { file: IndexCardFile } | { error: 'blank' | 'duplicate' | 'face' | 'missing'; faceLabel?: string } {
  const name = cleanName(edit.name);
  if (!name) return { error: 'blank' };
  if (!isIndexFaceId(edit.faceId)) return { error: 'face' };
  const cards = assembleCards(catalog, file);
  const key = termKey(name);
  const clash = cards.find((card) => card.id !== id && (termKey(card.name) === key || termKey(card.tile) === key));
  if (clash) return { error: 'duplicate', faceLabel: clash.faceLabel };
  const line = catalog.find((item) => item.id === id);
  const saved = file.cards.find((card) => card.id === id);
  if (line) {
    const next: StoredIndexCard = {
      id,
      faceId: edit.faceId,
      name,
      addedAt: saved?.addedAt || now,
      video: saved?.video ?? null,
      tree: null,
    };
    if (saved?.rating) next.rating = saved.rating;
    if (saved?.notes) next.notes = saved.notes;
    if (saved?.links?.length) next.links = saved.links;
    if (key !== termKey(line.name)) next.userName = name;
    if (edit.faceId !== line.faceId) next.userFace = edit.faceId;
    return { file: upsert(file, next) };
  }
  if (!saved) return { error: 'missing' };
  return { file: upsert(file, { ...saved, name, faceId: edit.faceId }) };
}

/** Back to the built-in name and face. Rating and video stay. */
export function withCardReset(file: IndexCardFile, id: string): IndexCardFile {
  const saved = file.cards.find((card) => card.id === id);
  if (!saved || (!saved.userName && !saved.userFace)) return file;
  const next: StoredIndexCard = { ...saved };
  delete next.userName;
  delete next.userFace;
  return upsert(file, next);
}

/** Catalog id, stored id, or the same move under a different spelling. */
export function termIdFor(catalog: readonly CatalogLine[], file: IndexCardFile, nameOrId: string): string | null {
  const raw = nameOrId.trim();
  if (!raw) return null;
  if (catalog.some((line) => line.id === raw) || file.cards.some((card) => card.id === raw)) return raw;
  const key = termKey(raw);
  if (!key) return null;
  for (const line of catalog) {
    if (termKey(line.name) === key || termKey(line.tile) === key) return line.id;
  }
  for (const card of file.cards) {
    if (termKey(card.name) === key || (card.userName && termKey(card.userName) === key) || card.id === `term.${key}`) return card.id;
  }
  return null;
}

export function aliasesFor(cards: readonly LiveCard[]): TermAlias[] {
  const aliases: TermAlias[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    for (const name of [card.name, card.tile]) {
      const key = `${card.id}:${termKey(name)}`;
      if (termKey(name).length < 4 || seen.has(key)) continue;
      seen.add(key);
      aliases.push({ id: card.id, name });
    }
  }
  return aliases;
}

export function reviewCardName(
  cards: readonly LiveCard[],
  faceId: IndexFaceId,
  raw: string,
): { name: string } | { error: 'blank' | 'duplicate'; faceLabel?: string } {
  const name = cleanName(raw);
  if (!name) return { error: 'blank' };
  const key = termKey(name);
  const existing = cards.find((card) => termKey(card.name) === key || termKey(card.tile) === key);
  if (!existing) return { name };
  if (existing.faceId === faceId) return { error: 'duplicate' };
  return { error: 'duplicate', faceLabel: existing.faceLabel };
}

export function withRating(catalog: readonly CatalogLine[], file: IndexCardFile, id: string, rating: AssessmentScore, now = Date.now()): IndexCardFile {
  const current = assembleCards(catalog, file).find((card) => card.id === id);
  if (!current || !isAssessmentScore(rating)) return file;
  return upsert(file, {
    id: current.id,
    faceId: current.faceId,
    name: current.name,
    rating,
    addedAt: current.addedAt || now,
    video: current.video,
    tree: null,
    ...keepEdits(file, current.id),
  });
}

export function withVideo(catalog: readonly CatalogLine[], file: IndexCardFile, id: string, video: CardVideo | null, now = Date.now()): IndexCardFile {
  const current = assembleCards(catalog, file).find((card) => card.id === id);
  const clean = video ? cleanVideo(video) : null;
  if (!current || (video && !clean)) return file;
  const next: StoredIndexCard = {
    id: current.id,
    faceId: current.faceId,
    name: current.name,
    addedAt: current.addedAt || now,
    video: clean,
    tree: null,
    ...keepEdits(file, current.id),
  };
  if (current.touched) next.rating = current.rating;
  return upsert(file, next);
}

/**
 * Save the student's notes on any card, built-in or their own. A blank note clears it.
 * Rating, video, name, face, and connections stay as they are.
 */
export function withCardNotes(catalog: readonly CatalogLine[], file: IndexCardFile, id: string, notes: string): IndexCardFile {
  return withStoredCard(catalog, file, id, (card) => {
    const clean = cleanNotes(notes);
    const next = { ...card };
    if (clean) next.notes = clean;
    else delete next.notes;
    return next;
  });
}

/** Add a Technique Tree connection from one card to another. Same connection twice is a no-op. */
export function withCardLink(
  catalog: readonly CatalogLine[],
  file: IndexCardFile,
  fromId: string,
  link: CardLink,
): IndexCardFile {
  const cards = assembleCards(catalog, file);
  const known = cards.some((card) => card.id === link.to) || (link.to.startsWith('gl.') && Boolean(link.name?.trim()));
  if (!known || link.to === fromId) return file;
  return withStoredCard(catalog, file, fromId, (card) => {
    const links = cleanLinks([...(card.links ?? []), link], card.id);
    if (links.length === (card.links ?? []).length) return card;
    return { ...card, links };
  });
}

/** Remove one connection added from a card. */
export function withoutCardLink(catalog: readonly CatalogLine[], file: IndexCardFile, fromId: string, link: CardLink): IndexCardFile {
  const saved = file.cards.find((card) => card.id === fromId);
  if (!saved?.links?.some((row) => row.to === link.to && row.relation === link.relation)) return file;
  return withStoredCard(catalog, file, fromId, (card) => {
    const links = (card.links ?? []).filter((row) => !(row.to === link.to && row.relation === link.relation));
    const next = { ...card };
    if (links.length) next.links = links;
    else delete next.links;
    return next;
  });
}

/**
 * Change one stored card, writing a stored copy of a built-in move first if needed.
 * A built-in move that only gets notes or connections keeps no addedAt, so its place on the D8 does not change.
 */
function withStoredCard(
  catalog: readonly CatalogLine[],
  file: IndexCardFile,
  id: string,
  change: (card: StoredIndexCard) => StoredIndexCard,
): IndexCardFile {
  const saved = file.cards.find((card) => card.id === id);
  if (saved) {
    const next = change(saved);
    return next === saved ? file : upsert(file, next);
  }
  const current = assembleCards(catalog, file).find((card) => card.id === id);
  if (!current) return file;
  const base: StoredIndexCard = { id: current.id, faceId: current.faceId, name: current.name, tree: null };
  const next = change(base);
  return next === base ? file : upsert(file, next);
}

export function withCustomCard(
  catalog: readonly CatalogLine[],
  file: IndexCardFile,
  faceId: IndexFaceId,
  raw: string,
  rating: AssessmentScore,
  now = Date.now(),
): { file: IndexCardFile; id: string } | { error: 'blank' | 'duplicate'; faceLabel?: string } {
  const cards = assembleCards(catalog, file);
  const review = reviewCardName(cards, faceId, raw);
  if ('error' in review) return review;
  const id = `term.${termKey(review.name)}`;
  return {
    id,
    file: upsert(file, {
      id,
      faceId,
      name: review.name,
      rating: shownRating(rating),
      addedAt: now,
      video: null,
      tree: null,
    }),
  };
}

function upsert(file: IndexCardFile, card: StoredIndexCard): IndexCardFile {
  const rest = file.cards.filter((item) => item.id !== card.id);
  return normalizeFile({ version: 1, cards: [...rest, card] });
}

/**
 * A per-face starting score for lines the student has not rated: the daily check-in
 * (Generic) score for that face. Display only. Nothing here is written to the card file.
 */
export type FaceBaseline = Partial<Record<IndexFaceId, AssessmentScore>>;

const AREA_FACE: Record<keyof AssessmentScores, IndexFaceId> = {
  guard: 'guard-control',
  passing: 'passing',
  sweeps: 'sweeps',
  takedowns: 'takedowns',
  escapes: 'escapes-defense',
  submissions: 'submissions',
  conditioning: 'conditioning',
  mindset: 'mindset',
};

/** Check-in area scores keyed by D8 face. Areas with no score stay off, so their lines stay at 3. */
export function faceBaselineFromScores(scores: Partial<AssessmentScores> | null | undefined): FaceBaseline {
  const out: FaceBaseline = {};
  if (!scores) return out;
  for (const area of Object.keys(AREA_FACE) as (keyof AssessmentScores)[]) {
    const value = scores[area];
    if (isAssessmentScore(value)) out[AREA_FACE[area]] = value;
  }
  return out;
}

export function hasFaceBaseline(baseline: FaceBaseline | null | undefined): boolean {
  return Boolean(baseline && Object.keys(baseline).length);
}

/**
 * Lines the student rated keep their rating. An unrated line takes the check-in score
 * for its face; with no check-in score it stays at the neutral 3. Returns the same
 * array when nothing changes.
 */
export function withFaceBaseline(cards: LiveCard[], baseline: FaceBaseline | null | undefined): LiveCard[] {
  if (!hasFaceBaseline(baseline)) return cards;
  let changed = false;
  const next = cards.map((card) => {
    const base = baseline?.[card.faceId];
    if (card.touched || !isAssessmentScore(base) || card.rating === base) return card;
    changed = true;
    return { ...card, rating: base };
  });
  return changed ? next : cards;
}

export function faceCards(cards: readonly LiveCard[], faceId: IndexFaceId): LiveCard[] {
  return cards.filter((card) => card.faceId === faceId);
}

export function faceScore(cards: readonly LiveCard[], faceId: IndexFaceId): AssessmentScore {
  return faceAverage(faceCards(cards, faceId).map((card) => card.rating));
}

export function faceScoreExact(cards: readonly LiveCard[], faceId: IndexFaceId): number {
  return faceAverageExact(faceCards(cards, faceId).map((card) => card.rating));
}

/** Whole words only. "Mount" matches "mount", not "mountain". */
export function mentionsPhrase(text: string, name: string): boolean {
  const phrase = termKey(name).replace(/-/g, ' ');
  if (phrase.length < 2) return false;
  const hay = termKey(text).replace(/-/g, ' ');
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  return new RegExp(`(?:^|\\s)${escaped}(?:\\s|$)`).test(hay);
}

export function journalMentions(journal: readonly JournalEntry[], names: readonly string[]): JournalMention[] {
  const aliases = names.map((name) => name.trim()).filter((name) => termKey(name).length >= 2);
  if (!aliases.length) return [];
  const hits: JournalMention[] = [];
  for (const entry of journal) {
    const fields = journalFields(entry);
    const matched = fields.filter((field) => aliases.some((name) => mentionsPhrase(field.text, name)));
    const hit = matched.sort((left, right) => right.text.length - left.text.length)[0];
    if (!hit) continue;
    hits.push({ id: entry.id, date: entry.date, line: `${hit.label}: ${hit.text}`.slice(0, 240) });
  }
  return hits.sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
}

type ClipLike = {
  id: string;
  url: string;
  description: string;
  note?: string;
  techniqueAnchor?: { name?: string };
};

type FilmLike = {
  id: string;
  fileName: string;
  technique: string;
  note: string;
  techniqueAnchor?: { name?: string };
};

/**
 * Library clips and filmed moves are not stored against a D8 id.
 * A row is included when its title, note, or technique name is this term.
 */
export function videosForTerm(names: readonly string[], clips: readonly ClipLike[], films: readonly FilmLike[], cardVideo: CardVideo | null): TermVideo[] {
  const aliases = names.map((name) => name.trim()).filter((name) => termKey(name).length >= 2);
  const videos: TermVideo[] = [];
  const seen = new Set<string>();
  const push = (video: TermVideo) => {
    const key = video.href ? video.href : `${video.where}:${video.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    videos.push(video);
  };
  if (cardVideo) push({ id: 'card-video', title: cardVideo.title || cardVideo.href, href: cardVideo.href, where: 'card' });
  for (const clip of clips) {
    const anchor = clip.techniqueAnchor?.name ?? '';
    const text = `${clip.description} ${clip.note ?? ''} ${anchor}`;
    if (!aliases.some((name) => mentionsPhrase(text, name) || termKey(anchor) === termKey(name))) continue;
    push({ id: clip.id, title: clip.description || anchor || 'Video', href: clip.url, where: 'library' });
  }
  for (const film of films) {
    const anchor = film.techniqueAnchor?.name ?? '';
    const text = `${film.technique} ${film.note} ${film.fileName} ${anchor}`;
    if (!aliases.some((name) => mentionsPhrase(text, name) || termKey(anchor) === termKey(name))) continue;
    push({ id: film.id, title: film.technique || film.fileName || 'Filmed move', href: '', where: 'phone' });
  }
  return videos;
}

export type TermPart = { text: string; termId: string | null };

/** Longest indexed name wins, so "Scissor sweep" is not split into a shorter word. */
export function splitIndexedTerms(text: string, aliases: readonly TermAlias[]): TermPart[] {
  const ranked = [...aliases]
    .filter((alias) => termKey(alias.name).length >= 4)
    .sort((left, right) => right.name.trim().length - left.name.trim().length || left.name.localeCompare(right.name));
  const parts: TermPart[] = [];
  let index = 0;
  while (index < text.length) {
    const boundary = index === 0 || /[^A-Za-z0-9]/.test(text[index - 1] ?? '');
    let found: { id: string; length: number } | null = null;
    if (boundary) {
      const rest = text.slice(index);
      for (const alias of ranked) {
        const phrase = alias.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        const match = new RegExp(`^${phrase}(?![A-Za-z0-9])`, 'i').exec(rest);
        if (match) {
          found = { id: alias.id, length: match[0].length };
          break;
        }
      }
    }
    if (found) {
      parts.push({ text: text.slice(index, index + found.length), termId: found.id });
      index += found.length;
      continue;
    }
    const last = parts[parts.length - 1];
    if (last && last.termId == null) last.text += text[index];
    else parts.push({ text: text[index] ?? '', termId: null });
    index += 1;
  }
  return parts.length ? parts : [{ text, termId: null }];
}
