/**
 * Gym roster in the gym's own Google Drive or OneDrive folder (purpose `roster` in gymTree).
 *
 *   roster/advantage-roster-backup.json              shared master roster (owner, Instructors seat)
 *   roster/advantage-roster-pending-{who}-{stamp}.json  a Coach seat's adds and edits for the head coach
 *
 * Shared files never carry private coach notes or face photos (sharedRosterBackup).
 * Saving the master first reads what is there and only adds to it, so a save never
 * drops a student another coach put there. Nothing here deletes a file.
 */

import { readDriveBinding, requestDriveToken, ensureDriveRelativeFolder, listFolderFiles, downloadDriveFile, uploadGymTreeBytes } from './googleDrive.ts';
import { routeUpload, parentSegments, type GymActor } from './gymTree.ts';
import { createOneDriveFolder, downloadOneDriveBytes, listOneDriveItems, readOneDriveBinding, readOneDriveSession, saveOneDriveBytes } from './oneDrive.ts';
import {
  ROSTER_BACKUP_FILE_NAME,
  buildRosterBackup,
  mergeRosterBackup,
  parseRosterBackup,
  serializeRosterBackup,
  sharedRosterBackup,
  type RosterBackup,
  type RosterNormalizer,
} from './rosterBackup.ts';

export const ROSTER_PENDING_PREFIX = 'advantage-roster-pending-';
export const ROSTER_FOLDER_DECIDED_KEY = 'matboard.rosterFolder.decided.v1';

export type FolderRosterMode = 'master' | 'pending' | 'hidden';

/** Owner and Instructors seats keep the master file. Coach seats leave pending files. Everyone else: nothing. */
export function folderRosterMode(role: GymActor): FolderRosterMode {
  if (role === 'owner' || role === 'instructor') return 'master';
  if (role === 'coach') return 'pending';
  return 'hidden';
}

export function pendingFileName(who: string, now: Date): string {
  const safe = who.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'coach';
  const stamp = now.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${ROSTER_PENDING_PREFIX}${safe}-${stamp}.json`;
}

/** Relative path for a roster file, or null when this role does not write there. */
export function rosterFolderPath(role: GymActor, fileName: string, dateKey: string): string | null {
  const route = routeUpload({ purpose: 'roster', role, kind: 'json', dateKey, fileName });
  return route.ok ? route.path : null;
}

export type FolderFile = { id: string; name: string };

/** Storage the folder code reads and writes. Drive and OneDrive both fit it; tests use a map. */
export type RosterFolderIO = {
  provider: 'google-drive' | 'onedrive';
  list(): Promise<FolderFile[]>;
  read(id: string): Promise<string>;
  /** Create or replace one file in the roster folder by relative path. */
  write(relativePath: string, text: string): Promise<void>;
};

/** The file to write when saving. Master saves add to what is already in the folder. */
export function planFolderSave(input: {
  role: GymActor;
  who: string;
  local: RosterBackup;
  existingMaster: RosterBackup | null;
  now: Date;
  normalize?: RosterNormalizer;
}): { path: string; backup: RosterBackup; mode: 'master' | 'pending' } | null {
  const mode = folderRosterMode(input.role);
  if (mode === 'hidden') return null;
  const dateKey = input.now.toISOString().slice(0, 10);
  const shared = sharedRosterBackup(input.local);
  if (mode === 'pending') {
    const path = rosterFolderPath(input.role, pendingFileName(input.who, input.now), dateKey);
    return path ? { path, backup: shared, mode } : null;
  }
  const path = rosterFolderPath(input.role, ROSTER_BACKUP_FILE_NAME, dateKey);
  if (!path) return null;
  if (!input.existingMaster) return { path, backup: shared, mode };
  const there = sharedRosterBackup(input.existingMaster);
  const { next } = mergeRosterBackup(
    { roster: there.roster, cardFile: { cards: there.cards, settings: there.cardSettings }, privateNotes: {}, inbox: there.inbox, coachStores: there.coachStores },
    shared,
    { now: input.now.getTime(), normalize: input.normalize },
  );
  return { path, backup: buildRosterBackup({ ...next, privateNotes: {} }, { scope: 'shared', now: input.now }), mode };
}

export type FolderRosterLoad = {
  master: RosterBackup | null;
  newerSchema: boolean;
  /** Coach seat files not yet decided on this device. Only for the master role. */
  pending: { id: string; name: string; backup: RosterBackup; newerSchema: boolean }[];
};

export async function loadRosterFolder(io: RosterFolderIO, role: GymActor, decided: ReadonlySet<string>, normalize?: RosterNormalizer): Promise<FolderRosterLoad> {
  const files = await io.list();
  const out: FolderRosterLoad = { master: null, newerSchema: false, pending: [] };
  const masterFile = files.find((file) => file.name === ROSTER_BACKUP_FILE_NAME);
  if (masterFile) {
    const parsed = parseRosterBackup(await io.read(masterFile.id), normalize);
    if (parsed.ok) {
      out.master = sharedRosterBackup(parsed.backup);
      out.newerSchema = parsed.newerSchema;
    }
  }
  if (folderRosterMode(role) === 'master') {
    for (const file of files) {
      if (!file.name.startsWith(ROSTER_PENDING_PREFIX) || decided.has(file.id)) continue;
      const parsed = parseRosterBackup(await io.read(file.id), normalize);
      if (parsed.ok) out.pending.push({ id: file.id, name: file.name, backup: sharedRosterBackup(parsed.backup), newerSchema: parsed.newerSchema });
    }
  }
  return out;
}

export async function saveRosterFolder(io: RosterFolderIO, input: Omit<Parameters<typeof planFolderSave>[0], 'existingMaster'>): Promise<'master' | 'pending' | 'hidden'> {
  let existingMaster: RosterBackup | null = null;
  if (folderRosterMode(input.role) === 'master') {
    const files = await io.list();
    const masterFile = files.find((file) => file.name === ROSTER_BACKUP_FILE_NAME);
    if (masterFile) {
      const parsed = parseRosterBackup(await io.read(masterFile.id), input.normalize);
      // A master this device cannot read is left alone rather than replaced.
      if (!parsed.ok) throw new Error('The gym roster file in this folder could not be read. Nothing was replaced.');
      existingMaster = parsed.backup;
    }
  }
  const plan = planFolderSave({ ...input, existingMaster });
  if (!plan) return 'hidden';
  await io.write(plan.path, serializeRosterBackup(plan.backup));
  return plan.mode;
}

export function readFolderDecided(storage: Pick<Storage, 'getItem'> | null): Set<string> {
  try {
    const parsed = JSON.parse(storage?.getItem(ROSTER_FOLDER_DECIDED_KEY) ?? '[]') as unknown;
    return new Set(Array.isArray(parsed) ? parsed.filter((row): row is string => typeof row === 'string') : []);
  } catch {
    return new Set();
  }
}

export function markFolderDecided(storage: Pick<Storage, 'getItem' | 'setItem'> | null, id: string): void {
  if (!storage) return;
  const next = [...readFolderDecided(storage), id].slice(-500);
  storage.setItem(ROSTER_FOLDER_DECIDED_KEY, JSON.stringify([...new Set(next)]));
}

/* ------------------------------- browser IO ------------------------------- */

/** Google Drive first, then OneDrive, matching publishGymFile. Null when neither is connected. */
export async function connectedRosterFolder(): Promise<RosterFolderIO | null> {
  if (typeof window === 'undefined') return null;
  const drive = readDriveBinding();
  if (drive?.folderId) {
    const token = await requestDriveToken('silent');
    if (token) {
      let folderId = '';
      const folder = async () => (folderId ||= await ensureDriveRelativeFolder(token, drive.folderId, ['roster']));
      return {
        provider: 'google-drive',
        list: async () => (await listFolderFiles(token, await folder())).map((file) => ({ id: file.id, name: file.name })),
        read: async (id) => (await downloadDriveFile(token, id)).text(),
        write: async (relativePath, text) => {
          await uploadGymTreeBytes({
            token,
            rootFolderId: drive.folderId,
            relativePath,
            bytes: new Blob([text], { type: 'application/json' }),
            mime: 'application/json',
            appProperties: { advantage: 'roster', purpose: 'roster', kind: 'json' },
          });
        },
      };
    }
  }
  const one = readOneDriveBinding();
  const session = readOneDriveSession();
  if (one?.folderId && session) {
    const token = session.token;
    const ensure = async (segments: readonly string[]) => {
      let parent = one.folderId;
      for (const name of segments) parent = (await createOneDriveFolder(token, name, fetch, parent)).id;
      return parent;
    };
    return {
      provider: 'onedrive',
      list: async () => (await listOneDriveItems(token, { folderId: await ensure(['roster']) })).map((item) => ({ id: item.id, name: item.name })),
      read: async (id) => (await downloadOneDriveBytes(token, id)).text(),
      write: async (relativePath, text) => {
        const parentId = await ensure(parentSegments(relativePath));
        const name = relativePath.split('/').pop() ?? ROSTER_BACKUP_FILE_NAME;
        await saveOneDriveBytes(token, { name, bytes: new Blob([text], { type: 'application/json' }), mime: 'application/json' }, parentId);
      },
    };
  }
  return null;
}
