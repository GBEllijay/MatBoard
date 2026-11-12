/**
 * Reader for the optional `videos` list on a journal card.
 * Lenient on purpose: a card from an older file has no list and reads as none,
 * and a damaged video row is dropped so the rest of the journal still opens.
 * Only ids, links, names, and notes live here. Video bytes never do.
 */

import {
  JOURNAL_CARD_VIDEOS_MAX,
  PROGRESS_CLIP_URL_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  type JournalCardVideo,
  type JournalVideoTerm,
} from './types.ts';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const TERM_ID_RE = /^(gl|mine)\.[A-Za-z0-9][A-Za-z0-9._ -]{0,79}$/;
const FILE_NAME_MAX = 160;
const MIME_RE = /^video\/[a-z0-9.+-]{1,40}$/i;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

function time(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** An http or https link, or blank. */
export function cleanVideoLink(value: unknown): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > PROGRESS_CLIP_URL_MAX) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? raw : '';
  } catch {
    return '';
  }
}

export function cleanVideoTerm(value: unknown): JournalVideoTerm | null {
  const record = asObject(value);
  if (!record) return null;
  const name = text(record.name, PROGRESS_NAME_MAX);
  if (!name) return null;
  const id = typeof record.id === 'string' && TERM_ID_RE.test(record.id) ? record.id : '';
  return { id, name };
}

/** One card video, cleaned, or null when it cannot be used. */
export function cleanJournalCardVideo(value: unknown): JournalCardVideo | null {
  const record = asObject(value);
  if (!record) return null;
  const id = typeof record.id === 'string' && ID_RE.test(record.id) ? record.id : '';
  const source = record.source === 'phone' || record.source === 'link' ? record.source : null;
  const term = cleanVideoTerm(record.term);
  if (!id || !source || !term) return null;
  const video: JournalCardVideo = {
    id,
    source,
    term,
    note: text(record.note, PROGRESS_NOTE_MAX),
    createdAt: time(record.createdAt),
    updatedAt: time(record.updatedAt),
  };
  if (source === 'link') {
    const url = cleanVideoLink(record.url);
    if (!url) return null;
    video.url = url;
  } else {
    const fileName = text(record.fileName, FILE_NAME_MAX);
    if (fileName) video.fileName = fileName;
    if (typeof record.mime === 'string' && MIME_RE.test(record.mime)) video.mime = record.mime.toLowerCase();
    if (typeof record.size === 'number' && Number.isFinite(record.size) && record.size > 0) video.size = Math.round(record.size);
  }
  return video;
}

/** The card's videos. Missing or not a list reads as undefined (no videos). Duplicates by id keep the first. */
export function readJournalCardVideos(value: unknown): JournalCardVideo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<string>();
  const out: JournalCardVideo[] = [];
  for (const row of value) {
    const video = cleanJournalCardVideo(row);
    if (!video || seen.has(video.id)) continue;
    seen.add(video.id);
    out.push(video);
    if (out.length >= JOURNAL_CARD_VIDEOS_MAX) break;
  }
  return out.length ? out : undefined;
}

/** Restoring a file onto this phone: keep this phone's videos and add the ones it does not have. */
export function mergeJournalCardVideos(
  local: readonly JournalCardVideo[] | undefined,
  incoming: readonly JournalCardVideo[] | undefined,
): JournalCardVideo[] | undefined {
  if (!incoming?.length) return local ? local.map((video) => structuredClone(video)) : undefined;
  const out = (local ?? []).map((video) => structuredClone(video));
  const ids = new Set(out.map((video) => video.id));
  for (const video of incoming) {
    if (ids.has(video.id) || out.length >= JOURNAL_CARD_VIDEOS_MAX) continue;
    ids.add(video.id);
    out.push(structuredClone(video));
  }
  return out.length ? out : undefined;
}
