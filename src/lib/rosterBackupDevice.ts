/** Read and write a full roster backup on this device. The logic lives in rosterBackup.ts. */

import { CARD_SYNC_EVENT, CARD_SYNC_SENT_KEY } from './cardSync.ts';
import { COACH_STUDENT_INBOX_EVENT, COACH_STUDENT_INBOX_KEY } from './coachStudentInbox.ts';
import { PHOTO_REVIEW_KEY } from './rosterPhotoApproval.ts';
import {
  buildRosterBackup,
  COACH_STORE_CAPS,
  emptyCoachStores,
  mergeRosterBackup,
  parseRosterBackup,
  readCoachStores,
  type CoachSyncStores,
  type ParsedRosterBackup,
  type RosterBackup,
  type RosterBackupScope,
  type RosterBackupSources,
  type RosterMergeReport,
} from './rosterBackup.ts';
import {
  defaultCardStorage,
  readCardFile,
  readInboxItems,
  readPrivateNotes,
  writeCardFile,
  writeInboxItems,
  writePrivateNotes,
  type KeyValueStore,
} from './rosterCardFields.ts';
import { getRoster, normalizeRoster, replaceRosterState, type RosterState } from './rosterStore.ts';

function readJson(storage: Pick<KeyValueStore, 'getItem'> | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/** The roster sync layer's coach stores, read as plain JSON. Their own readers check each row on use. */
export function readCoachSyncStores(storage: Pick<KeyValueStore, 'getItem'> | null): CoachSyncStores {
  return (
    readCoachStores({
      studentInbox: readJson(storage, COACH_STUDENT_INBOX_KEY),
      photoReviews: readJson(storage, PHOTO_REVIEW_KEY),
      cardSyncSent: readJson(storage, CARD_SYNC_SENT_KEY),
    }) ?? emptyCoachStores()
  );
}

function emit(name: string): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') window.dispatchEvent(new Event(name));
}

export function writeCoachSyncStores(storage: KeyValueStore, stores: CoachSyncStores): void {
  const inbox = stores.studentInbox;
  storage.setItem(
    COACH_STUDENT_INBOX_KEY,
    JSON.stringify({
      notices: inbox.notices.slice(-COACH_STORE_CAPS.notices),
      dismissed: inbox.dismissed.slice(-COACH_STORE_CAPS.dismissed),
      shares: inbox.shares.slice(-COACH_STORE_CAPS.shares),
      decided: inbox.decided.slice(-COACH_STORE_CAPS.decided),
    }),
  );
  storage.setItem(PHOTO_REVIEW_KEY, JSON.stringify(stores.photoReviews.slice(-COACH_STORE_CAPS.photoReviews)));
  storage.setItem(CARD_SYNC_SENT_KEY, JSON.stringify(stores.cardSyncSent.slice(-COACH_STORE_CAPS.cardSyncSent)));
  emit(COACH_STUDENT_INBOX_EVENT);
  emit(CARD_SYNC_EVENT);
}

export function readRosterBackupSources(
  storage: Pick<KeyValueStore, 'getItem'> | null = defaultCardStorage(),
  options: { includePrivate: boolean } = { includePrivate: false },
): RosterBackupSources {
  return {
    roster: getRoster(),
    cardFile: readCardFile(storage),
    // Private coach notes are only read for the coach's own device backup.
    privateNotes: options.includePrivate ? readPrivateNotes(storage) : {},
    inbox: readInboxItems(storage),
    coachStores: readCoachSyncStores(storage),
  };
}

export function deviceRosterBackup(scope: RosterBackupScope, now = new Date()): RosterBackup {
  return buildRosterBackup(readRosterBackupSources(defaultCardStorage(), { includePrivate: scope === 'coach-private' }), {
    scope,
    now,
  });
}

/** Parse with the app's full roster checks (belts, clipping) instead of the light server check. */
export function parseRosterBackupOnDevice(text: string): ParsedRosterBackup {
  return parseRosterBackup(text, normalizeRoster);
}

/** Merge a parsed backup into this device. Only what changed is written. */
export function importRosterBackupOnDevice(backup: RosterBackup, newerSchema = false): RosterMergeReport {
  const storage = defaultCardStorage();
  const local = readRosterBackupSources(storage, { includePrivate: true });
  const { next, report, changed } = mergeRosterBackup(local, backup, { newerSchema, normalize: normalizeRoster });
  if (changed.roster) replaceRosterState(next.roster as RosterState);
  if (storage) {
    if (changed.cards) writeCardFile(storage, next.cardFile);
    if (changed.privateNotes) writePrivateNotes(storage, next.privateNotes);
    if (changed.inbox) writeInboxItems(storage, next.inbox);
    if (changed.coachStores && next.coachStores) writeCoachSyncStores(storage, next.coachStores);
  }
  return report;
}

/** Fill this device's private coach notes from the author's own cloud copy. Never overwrites a note. */
export function fillPrivateNotesOnDevice(notes: Readonly<Record<string, string>>): number {
  const storage = defaultCardStorage();
  if (!storage) return 0;
  const current = readPrivateNotes(storage);
  const next = { ...current };
  let added = 0;
  for (const [id, text] of Object.entries(notes)) {
    if (typeof text !== 'string' || !text.trim() || (next[id] ?? '').trim()) continue;
    next[id] = text;
    added += 1;
  }
  if (added) writePrivateNotes(storage, next);
  return added;
}
