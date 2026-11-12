/**
 * Videos on one journal card (one class, one date).
 * Each video is a phone file or a pasted link, and each names the glossary term it shows.
 * Phone files stay in this phone's film store (IndexedDB). Nothing here uploads to Advantage Cloud.
 * Card shares to a coach never carry the journal, so these never travel with a card share.
 */

import { glossaryTermById, matchGlossary, type ExtraName, type GlossaryTerm } from './glossaryMatch.ts';
import { termKey } from './indexCards.ts';
import { cleanJournalCardVideo, cleanVideoLink } from './progress/cardVideos.ts';
import {
  JOURNAL_CARD_VIDEOS_MAX,
  PROGRESS_NAME_MAX,
  PROGRESS_NOTE_MAX,
  type JournalCardVideo,
  type JournalEntry,
  type JournalVideoTerm,
  type StudentProgressReport,
} from './progress/types.ts';

export const CARD_VIDEO_ID_PREFIX = 'jvid';
export const CARD_VIDEO_LINK_ERROR = 'Paste an http or https link (YouTube, Instagram, Drive, …).';
export const CARD_VIDEO_TERM_ERROR = 'Pick the glossary term this video shows.';
export const CARD_VIDEO_FULL_ERROR = `This card already has ${JOURNAL_CARD_VIDEOS_MAX} videos. Remove one first.`;
export const CARD_VIDEO_NOTE_ERROR = `That note is longer than ${PROGRESS_NOTE_MAX} characters.`;
export const CARD_VIDEO_MISSING_CARD = 'That card is not on this device.';

export type CardVideoDraft =
  | { source: 'link'; url: string; term: JournalVideoTerm | null; note: string }
  | { source: 'phone'; fileName: string; mime: string; size: number; term: JournalVideoTerm | null; note: string };

/** The card's videos, oldest first. Older cards have none. */
export function journalCardVideos(entry: Pick<JournalEntry, 'videos'> | null | undefined): JournalCardVideo[] {
  return entry?.videos ? [...entry.videos] : [];
}

/** Blank when the link is a usable http(s) link. */
export function cardVideoLinkError(url: string): string {
  return cleanVideoLink(url) ? '' : CARD_VIDEO_LINK_ERROR;
}

/**
 * The tag saved for a picked or typed name.
 * A core glossary headword or alias resolves to its `gl.` id and headword spelling.
 * One of the student's own moves keeps a `mine.` id. Anything else keeps the name with a blank id.
 */
export function cardVideoTerm(name: string, mine: readonly ExtraName[] = []): JournalVideoTerm | null {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, PROGRESS_NAME_MAX);
  if (!clean) return null;
  const core = glossaryTermById(clean);
  if (core) return { id: core.id, name: core.name };
  const key = termKey(clean);
  const own = mine.find((row) => termKey(row.name) === key);
  if (own) return { id: `mine.${key}`, name: own.name };
  return { id: '', name: clean };
}

/** A tag picked straight from the suggestion list. */
export function cardVideoTermFrom(term: Pick<GlossaryTerm, 'id' | 'name'>): JournalVideoTerm {
  return { id: term.id, name: term.name };
}

/** True when the tag is a glossary headword or one of the student's own named moves. */
export function cardVideoTermKnown(term: JournalVideoTerm | null | undefined): boolean {
  return Boolean(term && (term.id.startsWith('gl.') || term.id.startsWith('mine.')));
}

/** Suggestions for the tag field: core glossary first, then the student's own moves. */
export function cardVideoTermSuggestions(
  query: string,
  options: { mine?: readonly ExtraName[]; blockedIds?: readonly string[]; blockedNames?: readonly string[]; limit?: number } = {},
): GlossaryTerm[] {
  return matchGlossary(query, {
    extra: options.mine ?? [],
    blockedIds: options.blockedIds,
    blockedNames: options.blockedNames,
    limit: options.limit ?? 6,
  }).map((match) => match.term);
}

/** The card's own technique names that are glossary terms, offered as one-tap tags. */
export function cardVideoQuickTerms(names: readonly string[], mine: readonly ExtraName[] = []): JournalVideoTerm[] {
  const out: JournalVideoTerm[] = [];
  const seen = new Set<string>();
  for (const name of names) {
    const term = cardVideoTerm(name, mine);
    if (!term || !cardVideoTermKnown(term)) continue;
    if (seen.has(term.id)) continue;
    seen.add(term.id);
    out.push(term);
  }
  return out;
}

export function cardVideoDraftError(draft: CardVideoDraft, current: readonly JournalCardVideo[] = []): string {
  if (current.length >= JOURNAL_CARD_VIDEOS_MAX) return CARD_VIDEO_FULL_ERROR;
  if (draft.source === 'link' && cardVideoLinkError(draft.url)) return CARD_VIDEO_LINK_ERROR;
  if (!draft.term || !draft.term.name.trim()) return CARD_VIDEO_TERM_ERROR;
  if (draft.note.trim().length > PROGRESS_NOTE_MAX) return CARD_VIDEO_NOTE_ERROR;
  return '';
}

export function newCardVideoId(now = Date.now()): string {
  return `${CARD_VIDEO_ID_PREFIX}.${now.toString(36)}.${Math.random().toString(36).slice(2, 8)}`;
}

/** The video row for a draft. Throws with a plain message when the draft cannot be saved. */
export function buildCardVideo(draft: CardVideoDraft, id: string, now = Date.now()): JournalCardVideo {
  const error = cardVideoDraftError(draft);
  if (error) throw new Error(error);
  const raw =
    draft.source === 'link'
      ? { id, source: 'link', url: draft.url.trim(), term: draft.term, note: draft.note, createdAt: now, updatedAt: now }
      : { id, source: 'phone', fileName: draft.fileName, mime: draft.mime, size: draft.size, term: draft.term, note: draft.note, createdAt: now, updatedAt: now };
  const video = cleanJournalCardVideo(raw);
  if (!video) throw new Error(draft.source === 'link' ? CARD_VIDEO_LINK_ERROR : CARD_VIDEO_TERM_ERROR);
  return video;
}

function withEntry(
  report: StudentProgressReport,
  entryId: string,
  change: (videos: JournalCardVideo[]) => JournalCardVideo[],
  now: number,
): StudentProgressReport {
  const index = report.journal.findIndex((entry) => entry.id === entryId);
  if (index < 0) throw new Error(CARD_VIDEO_MISSING_CARD);
  const entry = report.journal[index];
  const videos = change(journalCardVideos(entry));
  const next: JournalEntry = { ...entry };
  if (videos.length) next.videos = videos;
  else delete next.videos;
  const journal = report.journal.slice();
  journal[index] = next;
  return { ...report, updatedAt: now, journal };
}

/** Add one video to one card. Other cards and the card's words stay as they are. */
export function addCardVideo(
  report: StudentProgressReport,
  entryId: string,
  draft: CardVideoDraft,
  options: { id?: string; now?: number } = {},
): { report: StudentProgressReport; video: JournalCardVideo } {
  const now = options.now ?? Date.now();
  const entry = report.journal.find((row) => row.id === entryId);
  if (!entry) throw new Error(CARD_VIDEO_MISSING_CARD);
  const error = cardVideoDraftError(draft, journalCardVideos(entry));
  if (error) throw new Error(error);
  const video = buildCardVideo(draft, options.id ?? newCardVideoId(now), now);
  return { report: withEntry(report, entryId, (videos) => [...videos, video], now), video };
}

/** Change a video's tag or note. */
export function updateCardVideo(
  report: StudentProgressReport,
  entryId: string,
  videoId: string,
  patch: { term?: JournalVideoTerm; note?: string },
  now = Date.now(),
): StudentProgressReport {
  if (patch.term !== undefined && !patch.term.name.trim()) throw new Error(CARD_VIDEO_TERM_ERROR);
  if (patch.note !== undefined && patch.note.trim().length > PROGRESS_NOTE_MAX) throw new Error(CARD_VIDEO_NOTE_ERROR);
  return withEntry(
    report,
    entryId,
    (videos) =>
      videos.map((video) => {
        if (video.id !== videoId) return video;
        return cleanJournalCardVideo({ ...video, ...patch, updatedAt: now }) ?? video;
      }),
    now,
  );
}

/** Remove one video from one card. A phone video's bytes are removed by the caller. */
export function removeCardVideo(report: StudentProgressReport, entryId: string, videoId: string, now = Date.now()): StudentProgressReport {
  return withEntry(report, entryId, (videos) => videos.filter((video) => video.id !== videoId), now);
}

/** Every card video tagged with a term, across the journal, newest card first. */
export function cardVideosForTerm(report: StudentProgressReport, termName: string): { entry: JournalEntry; video: JournalCardVideo }[] {
  const key = termKey(termName);
  if (!key) return [];
  const core = glossaryTermById(termName);
  const out: { entry: JournalEntry; video: JournalCardVideo }[] = [];
  for (const entry of report.journal) {
    for (const video of entry.videos ?? []) {
      if ((core && video.term.id === core.id) || termKey(video.term.name) === key) out.push({ entry, video });
    }
  }
  return out.sort((a, b) => b.entry.date.localeCompare(a.entry.date) || a.video.createdAt - b.video.createdAt);
}

/** Where a video lives, for its row: the link's site, or this phone. */
export function cardVideoPlace(video: JournalCardVideo): string {
  if (video.source === 'phone') return video.fileName ? `On this phone · ${video.fileName}` : 'On this phone';
  try {
    const host = new URL(video.url ?? '').hostname.replace(/^www\./, '');
    return host ? `Link · ${host}` : 'Link';
  } catch {
    return 'Link';
  }
}

/** Short label for a video row: its glossary term, then where it lives. */
export function cardVideoLabel(video: JournalCardVideo): string {
  return `${video.term.name} · ${cardVideoPlace(video)}`;
}
