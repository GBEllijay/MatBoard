import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_STORAGE_PROVIDER_IDS, CONNECT_WITH_TITLE, cloudStorage, cloudStorageChoices } from './cloudStorage.ts';

test('Google Drive stays the default and launch providers are listed in owner order', async () => {
  assert.deepEqual(CLOUD_STORAGE_PROVIDER_IDS, ['googleDrive', 'oneDrive', 'googlePhotos', 'iCloud']);
  assert.equal(CONNECT_WITH_TITLE, 'Connect with');
  const choices = cloudStorageChoices();
  assert.deepEqual(
    choices.map((provider) => provider.displayName),
    ['Google Drive', 'OneDrive', 'Google Photos', 'iCloud'],
  );
  assert.equal(choices[0]?.phase, 'live');
  assert.equal(choices[1]?.id, 'oneDrive');
  assert.equal(choices[1]?.phase, 'live');
  assert.equal(choices[2]?.id, 'googlePhotos');
  assert.equal(choices[2]?.phase, 'coming-for-launch');
  assert.equal(choices[3]?.id, 'iCloud');
  assert.equal(choices[3]?.phase, 'live');
  assert.equal(
    choices.some((provider) => provider.id === 'dropbox'),
    false,
  );

  const drive = cloudStorage();
  assert.equal(drive.id, 'googleDrive');
  assert.equal(drive.displayName, 'Google Drive');
  assert.equal(drive, cloudStorage('googleDrive'));
  assert.equal(drive.isAvailable(), false);
  assert.equal(drive.isConnected(), false);
  assert.equal(drive.binding(), null);
  assert.match(drive.unavailableMessage(), /Google Drive is not available on this build yet — contact Advantage/);
  assert.equal(drive.createFolderLabel, 'Create Advantage Lesson Plans');
  assert.equal(drive.openFolderUrl('1AbC-_folderId'), 'https://drive.google.com/drive/folders/1AbC-_folderId');
  assert.equal(drive.openFolderUrl('https://photos.google.com/album/1'), null);
  assert.doesNotMatch(drive.openFolderUrl('1AbC-_folderId') ?? '', /photos\.google/);

  const connected = await drive.connect();
  assert.equal(connected.ok, false);
  if (!connected.ok) {
    assert.equal(connected.reason, 'unavailable');
    assert.match(connected.message, /contact Advantage/);
    assert.doesNotMatch(connected.message, /client id|oauth|cloud console|client secret/i);
  }
  await assert.rejects(() => drive.save('token', { name: 'note.txt', text: 'hi' }), /contact Advantage/);
  await assert.rejects(() => drive.open('token'), /contact Advantage/);
  drive.disconnect();

  const oneDrive = cloudStorage('oneDrive');
  assert.equal(oneDrive.phase, 'live');
  assert.equal(oneDrive.isAvailable(), false);
  assert.equal(oneDrive.isConnected(), false);
  assert.equal(oneDrive.binding(), null);
  assert.match(oneDrive.unavailableMessage(), /OneDrive is not available on this build yet — contact Advantage/);
  assert.doesNotMatch(oneDrive.unavailableMessage(), /client id|oauth|azure|client secret/i);
  assert.equal(oneDrive.createFolderLabel, 'Create Advantage Lesson Plans');
  assert.equal(oneDrive.openFolderUrl('folder'), null);
  const oneConnect = await oneDrive.connect();
  assert.equal(oneConnect.ok, false);
  if (!oneConnect.ok) {
    assert.equal(oneConnect.reason, 'unavailable');
    assert.match(oneConnect.message, /contact Advantage/);
  }
  await assert.rejects(() => oneDrive.save('token', { name: 'note.txt', text: 'hi' }), /contact Advantage/);
  await assert.rejects(() => oneDrive.open('token'), /contact Advantage/);
  oneDrive.disconnect();

  const photos = cloudStorage('googlePhotos');
  assert.equal(photos.phase, 'coming-for-launch');
  assert.equal(photos.isAvailable(), false);
  assert.match(photos.unavailableMessage(), /coming for launch/i);
  assert.doesNotMatch(photos.unavailableMessage(), /coming soon|client id|oauth|cloud console|client secret/i);
  const photoConnect = await photos.connect();
  assert.equal(photoConnect.ok, false);
  if (!photoConnect.ok) assert.equal(photoConnect.reason, 'unavailable');
  await assert.rejects(() => photos.save('token', { name: 'a.txt', text: 'b' }), /coming for launch/i);

  const icloud = cloudStorage('iCloud');
  assert.equal(icloud.phase, 'live');
  assert.equal(icloud.isAvailable(), false);
  assert.equal(icloud.isConnected(), false);
  assert.equal(icloud.binding(), null);
  assert.equal(icloud.openFolderUrl('folder'), null);
  assert.match(icloud.unavailableMessage(), /iCloud is not available on this build yet — contact Advantage/);
  assert.doesNotMatch(icloud.unavailableMessage(), /coming soon|coming for launch|client id|oauth|cloudkit|api token|client secret/i);
  assert.equal(icloud.createFolderLabel, 'Create Advantage Lesson Plans');
  const icloudConnect = await icloud.connect();
  assert.equal(icloudConnect.ok, false);
  if (!icloudConnect.ok) {
    assert.equal(icloudConnect.reason, 'unavailable');
    assert.match(icloudConnect.message, /contact Advantage/);
  }
  await assert.rejects(() => icloud.save('token', { name: 'a.txt', text: 'b' }), /contact Advantage/);
  await assert.rejects(() => icloud.open('token'), /contact Advantage/);
  icloud.disconnect();

  const dropbox = cloudStorage('dropbox');
  assert.equal(dropbox.phase, 'reserved');
  assert.equal(dropbox.isAvailable(), false);
  assert.match(dropbox.unavailableMessage(), /not on the Coach and Pro launch list/);
  assert.doesNotMatch(dropbox.unavailableMessage(), /coming soon|coming for launch/i);
});
