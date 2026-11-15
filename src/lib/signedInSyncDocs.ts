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

export type StudentSyncDoc = {
  v: 1;
  updatedAt: number;
  profileId: string;
  indexCards: { version: 1; cards: StudentSyncCard[] };
  glossaryAdditions: { version: 1; additions: unknown[] };
  assessments: { entries: unknown[] };
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
      (typeof card.addedAt === 'number' && card.addedAt > 0) ||
      (card.id && card.id.startsWith('custom:')),
  );
}

export function studentDocIsEmpty(doc: StudentSyncDoc | null | undefined): boolean {
  if (!doc) return true;
  const hasCards = doc.indexCards.cards.some(cardHasStudentWork);
  return !hasCards && doc.glossaryAdditions.additions.length === 0 && doc.assessments.entries.length === 0;
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
