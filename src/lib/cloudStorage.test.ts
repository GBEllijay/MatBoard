import assert from 'node:assert/strict';
import test from 'node:test';
import { CLOUD_STORAGE_PROVIDER_IDS, CONNECT_WITH_TITLE, cloudStorage, cloudStorageChoices } from './cloudStorage.ts';

test('Google Drive is the default connector and later providers stay unavailable', async () => {
  assert.deepEqual(CLOUD_STORAGE_PROVIDER_IDS, ['googleDrive', 'oneDrive', 'dropbox', 'iCloud']);
  assert.equal(CONNECT_WITH_TITLE, 'Connect with');
  const choices = cloudStorageChoices();
  assert.deepEqual(
    choices.map((provider) => provider.displayName),
    ['Google Drive', 'OneDrive', 'Dropbox', 'iCloud'],
  );
  assert.equal(choices[0]?.phase, 'live');
  assert.deepEqual(
    choices.slice(1).map((provider) => provider.phase),
    ['coming-soon', 'coming-soon', 'coming-soon'],
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
  drive.disconnect();

  for (const id of ['oneDrive', 'dropbox', 'iCloud'] as const) {
    const provider = cloudStorage(id);
    assert.equal(provider.id, id);
    assert.equal(provider.isAvailable(), false);
    assert.equal(provider.isConnected(), false);
    assert.equal(provider.binding(), null);
    assert.equal(provider.getBindingSnapshot(), null);
    assert.equal(provider.openFolderUrl('folder'), null);
    assert.match(provider.unavailableMessage(), /coming soon/i);
    assert.doesNotMatch(provider.unavailableMessage(), /client id|oauth|cloud console|client secret|contact Advantage/i);
    const result = await provider.connect();
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'unavailable');
    provider.disconnect();
  }
});
