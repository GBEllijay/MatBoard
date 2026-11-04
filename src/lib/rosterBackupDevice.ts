/** Read and write a full roster backup on this device. The logic lives in rosterBackup.ts. */

import {
  buildRosterBackup,
  mergeRosterBackup,
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
import { getRoster, replaceRosterState } from './rosterStore.ts';

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
  };
}

export function deviceRosterBackup(scope: RosterBackupScope, now = new Date()): RosterBackup {
  return buildRosterBackup(readRosterBackupSources(defaultCardStorage(), { includePrivate: scope === 'coach-private' }), {
    scope,
    now,
  });
}

/** Merge a parsed backup into this device. Only what changed is written. */
export function importRosterBackupOnDevice(backup: RosterBackup, newerSchema = false): RosterMergeReport {
  const storage = defaultCardStorage();
  const local = readRosterBackupSources(storage, { includePrivate: true });
  const { next, report, changed } = mergeRosterBackup(local, backup, { newerSchema });
  if (changed.roster) replaceRosterState(next.roster);
  if (storage) {
    if (changed.cards) writeCardFile(storage, next.cardFile);
    if (changed.privateNotes) writePrivateNotes(storage, next.privateNotes);
    if (changed.inbox) writeInboxItems(storage, next.inbox);
  }
  return report;
}
