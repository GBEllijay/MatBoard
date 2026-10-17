import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ACADEMY_BINDING_KEY,
  ACADEMY_FREE_NOTE,
  PERSONAL_DRIVE_KEY,
  academyPathway,
  academyPathwayUrl,
  clearStudentDriveLink,
  loadAcademyLink,
  loadPersonalDrive,
  parseAcademyInput,
  probeGoogleFolder,
  saveStudentDriveLink,
  shareGoogleFolderWithAnyone,
  studentOneDriveReturnPath,
} from './academyPathway.ts';

function memory() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  };
}

test('an academy pathway is a link the student can paste, and it does not use the Pro folder key', () => {
  const pathway = academyPathway({
    provider: 'googleDrive',
    folderId: 'academyFolder123',
    folderName: 'GB Ellijay',
    gymName: 'GB Ellijay',
  });
  assert.ok(pathway);
  const url = academyPathwayUrl(pathway, 'https://advantage.test');
  assert.match(url, /^https:\/\/advantage\.test\/student\/connections\?academy=/);
  assert.equal(parseAcademyInput(url)?.folderId, 'academyFolder123');
  assert.equal(parseAcademyInput(url)?.provider, 'googleDrive');
  assert.equal(parseAcademyInput('https://drive.google.com/drive/folders/academyFolder123')?.folderId, 'academyFolder123');
  assert.equal(parseAcademyInput('not a link'), null);
  assert.match(ACADEMY_FREE_NOTE, /do not pay/);

  const storage = memory();
  saveStudentDriveLink(storage, {
    role: 'academy',
    provider: 'googleDrive',
    folderId: 'academyFolder123',
    folderName: 'GB Ellijay',
    accountLabel: 'student@gym.test',
    gymName: 'GB Ellijay',
  });
  assert.equal(loadAcademyLink(storage)?.folderName, 'GB Ellijay');
  assert.equal(loadPersonalDrive(storage), null);
  assert.equal(storage.getItem('matboard.pro.googleDriveFolder.v1'), null);
  assert.ok(storage.getItem(ACADEMY_BINDING_KEY));
  clearStudentDriveLink(storage, 'academy');
  assert.equal(loadAcademyLink(storage), null);

  saveStudentDriveLink(storage, {
    role: 'personal',
    provider: 'oneDrive',
    folderId: 'personalFolder1',
    folderName: 'My journal',
    accountLabel: null,
    gymName: '',
  });
  assert.equal(loadPersonalDrive(storage)?.provider, 'oneDrive');
  assert.ok(storage.getItem(PERSONAL_DRIVE_KEY));
  assert.equal(studentOneDriveReturnPath('personal'), '/student/connections?student=1');
  assert.equal(studentOneDriveReturnPath('academy'), '/student/connections?student=1');
  assert.equal(studentOneDriveReturnPath(null), null);
});

test('academy folder probe and share report a clear failure', async () => {
  const denied: typeof fetch = async () => new Response('no', { status: 403 });
  const probed = await probeGoogleFolder('token', 'academyFolder123', denied);
  assert.equal(probed.ok, false);
  if (!probed.ok) assert.match(probed.error, /share the folder/);

  const opened: typeof fetch = async () => Response.json({ id: 'academyFolder123', name: 'GB Ellijay', mimeType: 'application/vnd.google-apps.folder' });
  const ok = await probeGoogleFolder('token', 'academyFolder123', opened);
  assert.equal(ok.ok && ok.name, 'GB Ellijay');

  const shared = await shareGoogleFolderWithAnyone('token', 'academyFolder123', async () => new Response('{}', { status: 200 }));
  assert.equal(shared.ok, true);
  const refused = await shareGoogleFolderWithAnyone('token', 'academyFolder123', async () => new Response('no', { status: 403 }));
  assert.equal(refused.ok, false);
});
