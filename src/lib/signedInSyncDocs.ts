/**
 * Sync document shapes and last-write-wins helpers. Safe to import from the
 * server: no DOM, no sign-in, and no imports of device stores.
 */

const DEFAULT_PROFILE_ID = 'default';

export type AcademySyncDoc = {
  v: 1;
  updatedAt: number;
  name: string;
  logoDataUrl: string | null;
  profile: {
    v: 1;
    foundedOn: string;
    founders: string;
    lineage: string;
    lineageVisible?: boolean;
    optIn: string[];
  };
};

/** Rank dates and stripes only. Promotion photos are not part of this type. */
export type StudentSyncRank = {
  id?: string;
  belt?: string;
  tapeCount?: number;
  awardedOn?: string;
  tapeDates?: string[];
  highDegreeDates?: string[];
  instructorBars?: boolean;
  instructorBarsOn?: string;
  history?: StudentSyncRank[];
  lineage?: string[];
  degreeFocus?: string[];
};

export type StudentSyncBasics = {
  displayName: string;
  gymName: string;
  belt: string;
  startedOn: string;
  rank?: StudentSyncRank;
};

export type StudentSyncDoc = {
  v: 1;
  updatedAt: number;
  profileId: string;
  indexCards: { version: 1; cards: StudentSyncCard[] };
  glossaryAdditions: { version: 1; additions: unknown[] };
  assessments: { entries: unknown[] };
  /** Name, belt, start date, and rank. Photos and videos are never stored here. */
  basics?: StudentSyncBasics;
};

export type StudentSyncCard = {
  id: string;
  faceId?: string;
  name?: string;
  userName?: string;
  userFace?: string;
  rating?: number;
  addedAt?: number;
  video?: unknown;
  /** The student's own notes on the card. */
  notes?: string;
  /** Technique Tree connections added from the card, by card id. */
  links?: { to: string; relation: 'leads' | 'defense'; name?: string }[];
  tree?: null;
};

export type ProfilesSyncDoc = {
  v: 1;
  updatedAt: number;
  profiles: { id: string; name: string; createdAt: string }[];
};

export type DocPick<T> = {
  winner: T | null;
  shouldUpload: boolean;
  source: 'local' | 'remote' | 'none';
};

export function academyDocIsEmpty(doc: AcademySyncDoc | null | undefined): boolean {
  if (!doc) return true;
  return !doc.name.trim() && !doc.logoDataUrl && !doc.profile.foundedOn && !doc.profile.founders.trim() && !doc.profile.lineage.trim() && doc.profile.optIn.length === 0;
}

function cardHasStudentWork(card: StudentSyncCard): boolean {
  return Boolean(
    card.rating ||
      card.userName ||
      card.userFace ||
      card.video ||
      (typeof card.notes === 'string' && card.notes.trim()) ||
      (Array.isArray(card.links) && card.links.length > 0) ||
      (typeof card.addedAt === 'number' && card.addedAt > 0) ||
      (card.id && card.id.startsWith('custom:')),
  );
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && Boolean(value.trim());
}

/** True when basics is more than a blank default (empty name, white belt, no date, empty rank). */
export function studentBasicsIsMeaningful(basics: StudentSyncBasics | null | undefined): boolean {
  if (!basics) return false;
  const rank = basics.rank;
  const rankUsed = Boolean(
    rank &&
      ((rank.tapeCount ?? 0) > 0 ||
        hasText(rank.awardedOn) ||
        rank.instructorBars ||
        hasText(rank.instructorBarsOn) ||
        rank.history?.length ||
        rank.tapeDates?.some(hasText) ||
        rank.highDegreeDates?.some(hasText) ||
        rank.lineage?.some(hasText) ||
        rank.degreeFocus?.some(hasText)),
  );
  return Boolean(basics.displayName.trim() || basics.gymName.trim() || (basics.belt.trim() && basics.belt !== 'white') || basics.startedOn.trim() || rankUsed);
}

export function studentDocIsEmpty(doc: StudentSyncDoc | null | undefined): boolean {
  if (!doc) return true;
  const hasCards = doc.indexCards.cards.some(cardHasStudentWork);
  return !hasCards && doc.glossaryAdditions.additions.length === 0 && doc.assessments.entries.length === 0 && !studentBasicsIsMeaningful(doc.basics);
}

/** If the winning doc has no meaningful basics, keep basics from an older copy. */
export function preserveStudentBasics(
  winner: StudentSyncDoc,
  ...fallbacks: (StudentSyncDoc | null | undefined)[]
): StudentSyncDoc {
  if (studentBasicsIsMeaningful(winner.basics)) return winner;
  for (const doc of fallbacks) {
    if (doc && studentBasicsIsMeaningful(doc.basics)) return { ...winner, basics: doc.basics };
  }
  return winner;
}

export function profilesDocIsEmpty(doc: ProfilesSyncDoc | null | undefined): boolean {
  if (!doc) return true;
  return !doc.profiles.some((row) => row.id !== DEFAULT_PROFILE_ID);
}

/**
 * Last-write-wins per document. An empty remote never beats local data, so the
 * first sync from a device that already has work uploads that work.
 */
export function pickWinningDoc<T>(
  local: T | null,
  remote: T | null,
  isEmpty: (doc: T | null | undefined) => boolean,
  updatedAt: (doc: T) => number,
): DocPick<T> {
  const localEmpty = isEmpty(local);
  const remoteEmpty = isEmpty(remote);
  if (localEmpty && remoteEmpty) return { winner: null, shouldUpload: false, source: 'none' };
  if (remoteEmpty && !localEmpty && local) return { winner: local, shouldUpload: true, source: 'local' };
  if (localEmpty && !remoteEmpty && remote) return { winner: remote, shouldUpload: false, source: 'remote' };
  if (!local || !remote) {
    return local && !localEmpty
      ? { winner: local, shouldUpload: true, source: 'local' }
      : { winner: remote, shouldUpload: false, source: remote ? 'remote' : 'none' };
  }
  if (updatedAt(local) >= updatedAt(remote)) return { winner: local, shouldUpload: updatedAt(local) > updatedAt(remote), source: 'local' };
  return { winner: remote, shouldUpload: false, source: 'remote' };
}
