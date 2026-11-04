import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { routeUpload, type GymActor } from './gymTree.ts';
import {
  ROSTER_PENDING_PREFIX,
  folderRosterMode,
  loadRosterFolder,
  markFolderDecided,
  pendingFileName,
  readFolderDecided,
  rosterFolderPath,
  saveRosterFolder,
  type RosterFolderIO,
} from './gymRosterFolder.ts';
import { ROSTER_BACKUP_FILE_NAME, buildRosterBackup, parseRosterBackup, type BackupStudent } from './rosterBackup.ts';

const now = new Date('2026-11-04T08:00:00.000Z');

function student(id: string, name: string, extra: Partial<BackupStudent> = {}): BackupStudent {
  return { id, name, belt: 'White', division: '', gym: '', photo: '', lastPromotion: '', note: '', checkedIn: false, ...extra };
}

function coachBackup(students: BackupStudent[], notes: Record<string, string> = {}) {
  return buildRosterBackup(
    { roster: { version: 1, students, ready: {}, gamePlans: {}, competitionPlans: {} }, cardFile: { cards: {} }, privateNotes: notes, inbox: [] },
    { scope: 'coach-private', now },
  );
}

function memoryFolder(): RosterFolderIO & { files: Map<string, string>; writes: string[]; deletes: number } {
  const files = new Map<string, string>();
  const writes: string[] = [];
  return {
    provider: 'google-drive',
    files,
    writes,
    deletes: 0,
    list: async () => [...files.keys()].map((path) => ({ id: path, name: path.split('/').pop()! })),
    read: async (id) => files.get(id) ?? '',
    write: async (path, text) => {
      writes.push(path);
      files.set(path, text);
    },
  };
}

describe('gym folder roster paths (gymTree purpose roster)', () => {
  it('owner, instructor, and coach write under roster/; students, assistants, and program directors cannot', () => {
    for (const role of ['owner', 'instructor', 'coach'] as GymActor[]) {
      assert.equal(rosterFolderPath(role, ROSTER_BACKUP_FILE_NAME, '2026-11-04'), `roster/${ROSTER_BACKUP_FILE_NAME}`);
    }
    for (const role of ['student', 'assistant', 'program-director', 'none'] as GymActor[]) {
      const route = routeUpload({ purpose: 'roster', role, kind: 'json', dateKey: '2026-11-04', fileName: ROSTER_BACKUP_FILE_NAME });
      assert.equal(route.ok, false, role);
      assert.equal(folderRosterMode(role), 'hidden', role);
    }
    assert.equal(folderRosterMode('owner'), 'master');
    assert.equal(folderRosterMode('instructor'), 'master');
    assert.equal(folderRosterMode('coach'), 'pending');
  });

  it('pending file names are safe and dated', () => {
    const name = pendingFileName('seat/../x y', now);
    assert.ok(name.startsWith(ROSTER_PENDING_PREFIX));
    assert.equal(name, 'advantage-roster-pending-seatxy-20261104080000.json');
    assert.equal(rosterFolderPath('coach', name, '2026-11-04'), `roster/${name}`);
  });
});

describe('gym folder roster save and load', () => {
  it('the head coach saves a shared master with no private notes or photos', async () => {
    const io = memoryFolder();
    const mode = await saveRosterFolder(io, {
      role: 'owner',
      who: 'owner',
      local: coachBackup([student('a', 'Ana', { photo: 'data:image/png;base64,FACE' })], { a: 'Private: hurt knee' }),
      now,
    });
    assert.equal(mode, 'master');
    const text = io.files.get(`roster/${ROSTER_BACKUP_FILE_NAME}`)!;
    assert.doesNotMatch(text, /Private:|FACE/);
    const parsed = parseRosterBackup(text);
    assert.ok(parsed.ok);
    assert.equal(parsed.backup.scope, 'shared');
  });

  it('saving the master adds to what is in the folder and never drops another coach’s student', async () => {
    const io = memoryFolder();
    await saveRosterFolder(io, { role: 'instructor', who: 'seat-i', local: coachBackup([student('a', 'Ana')]), now });
    await saveRosterFolder(io, { role: 'owner', who: 'owner', local: coachBackup([student('b', 'Bo')]), now });
    const parsed = parseRosterBackup(io.files.get(`roster/${ROSTER_BACKUP_FILE_NAME}`)!);
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.backup.roster.students.map((row) => row.name).sort(), ['Ana', 'Bo']);
  });

  it('a master the device cannot read is left alone', async () => {
    const io = memoryFolder();
    io.files.set(`roster/${ROSTER_BACKUP_FILE_NAME}`, 'garbage');
    await assert.rejects(saveRosterFolder(io, { role: 'owner', who: 'owner', local: coachBackup([student('a', 'Ana')]), now }));
    assert.equal(io.files.get(`roster/${ROSTER_BACKUP_FILE_NAME}`), 'garbage');
  });

  it('a coach seat leaves a pending file; only the head coach sees pending files; decided files stay hidden and are never deleted', async () => {
    const io = memoryFolder();
    await saveRosterFolder(io, { role: 'owner', who: 'owner', local: coachBackup([student('a', 'Ana')]), now });
    const mode = await saveRosterFolder(io, { role: 'coach', who: 'seat-c', local: coachBackup([student('c', 'Cy')], { c: 'Private: c' }), now });
    assert.equal(mode, 'pending');
    assert.equal(io.writes.at(-1), `roster/${pendingFileName('seat-c', now)}`);
    assert.doesNotMatch(io.files.get(io.writes.at(-1)!)!, /Private:/);
    // The master did not change from the coach save.
    const master = parseRosterBackup(io.files.get(`roster/${ROSTER_BACKUP_FILE_NAME}`)!);
    assert.ok(master.ok);
    assert.equal(master.backup.roster.students.length, 1);

    const coachView = await loadRosterFolder(io, 'coach', new Set());
    assert.equal(coachView.pending.length, 0);
    assert.equal(coachView.master?.roster.students.length, 1);

    const headView = await loadRosterFolder(io, 'owner', new Set());
    assert.equal(headView.pending.length, 1);
    assert.equal(headView.pending[0].backup.roster.students[0].name, 'Cy');

    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) };
    markFolderDecided(storage, headView.pending[0].id);
    const after = await loadRosterFolder(io, 'owner', readFolderDecided(storage));
    assert.equal(after.pending.length, 0);
    assert.equal(io.files.size, 2, 'nothing deleted');
  });

  it('assistant and program director roles do not write', async () => {
    const io = memoryFolder();
    assert.equal(await saveRosterFolder(io, { role: 'assistant', who: 'a', local: coachBackup([student('a', 'Ana')]), now }), 'hidden');
    assert.equal(await saveRosterFolder(io, { role: 'program-director', who: 'p', local: coachBackup([student('a', 'Ana')]), now }), 'hidden');
    assert.equal(io.files.size, 0);
  });
});
