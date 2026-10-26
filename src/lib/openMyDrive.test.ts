import assert from 'node:assert/strict';
import test from 'node:test';
import { OPEN_MY_DRIVE_CONNECT, OPEN_MY_DRIVE_LABEL, driveFolderWebUrl } from './openMyDrive.ts';

test('Open my Drive opens the connected Drive folder, and a Photos URL is not a folder id', () => {
  assert.equal(OPEN_MY_DRIVE_LABEL, 'Open my Drive');
  assert.match(OPEN_MY_DRIVE_CONNECT, /pick the gym folder/);
  assert.match(OPEN_MY_DRIVE_CONNECT, /does not host/);
  assert.doesNotMatch(OPEN_MY_DRIVE_CONNECT, /photos\.google|client id/i);

  const url = driveFolderWebUrl('1AbC-_folderId');
  assert.equal(url, 'https://drive.google.com/drive/folders/1AbC-_folderId');
  assert.match(url ?? '', /^https:\/\/drive\.google\.com\/drive\/folders\//);
  assert.doesNotMatch(url ?? '', /photos\.google/);

  assert.equal(driveFolderWebUrl(null), null);
  assert.equal(driveFolderWebUrl(''), null);
  assert.equal(driveFolderWebUrl('   '), null);
  assert.equal(driveFolderWebUrl('https://photos.google.com/album/1'), null);
  assert.equal(driveFolderWebUrl('folder id'), null);
  assert.equal(driveFolderWebUrl('../etc'), null);
});
