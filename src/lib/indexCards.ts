/**
 * Live index cards for one student on this phone.
 * A card is keyed by a normalized term, so the same move opened from the D8,
 * the journal, or another screen is the same card.
 * Ratings live in their own local key. This file does not rewrite the journal
 * or a self-assessment.
 */

import type { AssessmentScore } from './studentAssessment.ts';
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

export type StoredIndexCard = {
  id: string;
  faceId: IndexFaceId;
  name: string;
  /** Missing means the student has not rated it. The card shows 3. */
  rating?: AssessmentScore;
  addedAt?: number;
  video?: CardVideo | null;
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
  video: CardVideo | null;
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

/** Rounded average of every line. An empty face is the neutral 3. */
export function faceAverage(ratings: readonly number[]): AssessmentScore {
  const scored = ratings.filter((value): value is AssessmentScore => isAssessmentScore(value));
  if (!scored.length) return NEUTRAL_RATING;
  const rounded = Math.round(scored.reduce((sum, value) => sum + value, 0) / scored.length);
  return isAssessmentScore(rounded) ? rounded : NEUTRAL_RATING;
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
  const faceId = typeof row.faceId === 'string' ? row.faceId : '';
  const name = cleanName(typeof row.name === 'string' ? row.name : '');
  if (!id || id.length > 80 || !isIndexFaceId(faceId) || !name) return null;
  const card: StoredIndexCard = { id, faceId, name, tree: null };
  if (isAssessmentScore(row.rating)) card.rating = row.rating;
  if (typeof row.addedAt === 'number' && Number.isFinite(row.addedAt)) card.addedAt = row.addedAt;
  const video = cleanVideo(row.video);
  if (video) card.video = video;
  return card;
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
  const cards: LiveCard[] = catalog.map((line) => liveFromCatalog(line, stored.get(line.id)));
  for (const saved of file.cards) {
    if (catalog.some((line) => line.id === saved.id)) continue;
    cards.push({
      id: saved.id,
      faceId: saved.faceId,
      faceLabel: catalog.find((line) => line.faceId === saved.faceId)?.faceLabel ?? saved.faceId,
      name: saved.name,
      tile: saved.name,
      rating: shownRating(saved.rating),
      touched: isAssessmentScore(saved.rating),
      addedAt: saved.addedAt ?? 0,
      custom: true,
      video: saved.video ?? null,
      tree: null,
    });
  }
  return cards;
}

function liveFromCatalog(line: CatalogLine, saved: StoredIndexCard | undefined): LiveCard {
  return {
    id: line.id,
    faceId: line.faceId,
    faceLabel: line.faceLabel,
    name: line.name,
    tile: line.tile,
    rating: shownRating(saved?.rating),
    touched: isAssessmentScore(saved?.rating),
    addedAt: saved?.addedAt ?? 0,
    custom: false,
    video: saved?.video ?? null,
    tree: null,
  };
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
    if (termKey(card.name) === key || card.id === `term.${key}`) return card.id;
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
  };
  if (current.touched) next.rating = current.rating;
  return upsert(file, next);
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

export function faceCards(cards: readonly LiveCard[], faceId: IndexFaceId): LiveCard[] {
  return cards.filter((card) => card.faceId === faceId);
}

export function faceScore(cards: readonly LiveCard[], faceId: IndexFaceId): AssessmentScore {
  return faceAverage(faceCards(cards, faceId).map((card) => card.rating));
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
