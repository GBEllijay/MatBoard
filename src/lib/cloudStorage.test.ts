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
  assert.deepEqual(
    choices.slice(2).map((provider) => provider.phase),
    ['coming-for-launch', 'coming-for-launch'],
  );
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

  for (const id of ['googlePhotos', 'iCloud'] as const) {
    const provider = cloudStorage(id);
    assert.equal(provider.id, id);
    assert.equal(provider.phase, 'coming-for-launch');
    assert.equal(provider.isAvailable(), false);
    assert.equal(provider.isConnected(), false);
    assert.equal(provider.binding(), null);
    assert.equal(provider.getBindingSnapshot(), null);
    assert.equal(provider.openFolderUrl('folder'), null);
    assert.match(provider.unavailableMessage(), /coming for launch/i);
    assert.doesNotMatch(provider.unavailableMessage(), /coming soon|client id|oauth|cloud console|client secret/i);
    const result = await provider.connect();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'unavailable');
    await assert.rejects(() => provider.save('token', { name: 'a.txt', text: 'b' }), /coming for launch/i);
    await assert.rejects(() => provider.open('token'), /coming for launch/i);
    provider.disconnect();
  }

  const dropbox = cloudStorage('dropbox');
  assert.equal(dropbox.phase, 'reserved');
  assert.equal(dropbox.isAvailable(), false);
  assert.match(dropbox.unavailableMessage(), /not on the Coach and Pro launch list/);
  assert.doesNotMatch(dropbox.unavailableMessage(), /coming soon|coming for launch/i);
});
