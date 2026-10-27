import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  CLOUD_STORAGE_PROVIDER_IDS,
  CONNECT_WITH_BODY,
  CONNECT_WITH_TITLE,
  cloudStorage,
  cloudStorageChoices,
} from './cloudStorage.ts';

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url));

test('the cloud provider list is exactly Google Drive, OneDrive, and Google Photos', () => {
  assert.deepEqual(CLOUD_STORAGE_PROVIDER_IDS, ['googleDrive', 'oneDrive', 'googlePhotos']);
  const choices = cloudStorageChoices();
  assert.deepEqual(
    choices.map((provider) => provider.displayName),
    ['Google Drive', 'OneDrive', 'Google Photos'],
  );
  assert.deepEqual(
    choices.map((provider) => provider.id),
    ['googleDrive', 'oneDrive', 'googlePhotos'],
  );
  assert.equal(choices.every((provider) => provider.phase === 'live'), true);
  assert.equal(
    choices.some((provider) => /icloud/i.test(provider.id) || /icloud/i.test(provider.displayName)),
    false,
  );
  assert.doesNotMatch(CONNECT_WITH_BODY, /icloud/i);
});

test('Google Drive stays the default and launch providers are listed in owner order', async () => {
  assert.deepEqual(CLOUD_STORAGE_PROVIDER_IDS, ['googleDrive', 'oneDrive', 'googlePhotos']);
  assert.equal(CONNECT_WITH_TITLE, 'Connect with');
  const choices = cloudStorageChoices();
  assert.deepEqual(
    choices.map((provider) => provider.displayName),
    ['Google Drive', 'OneDrive', 'Google Photos'],
  );
  assert.equal(choices.length, 3);
  assert.equal(choices[0]?.phase, 'live');
  assert.equal(choices[1]?.id, 'oneDrive');
  assert.equal(choices[1]?.phase, 'live');
  assert.equal(choices[2]?.id, 'googlePhotos');
  assert.equal(choices[2]?.phase, 'live');
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
  assert.equal(photos.id, 'googlePhotos');
  assert.equal(photos.phase, 'live');
  assert.equal(photos.isAvailable(), false);
  assert.equal(photos.isConnected(), false);
  assert.equal(photos.binding(), null);
  assert.equal(photos.getBindingSnapshot(), null);
  assert.match(photos.unavailableMessage(), /Google Photos is not available on this build yet — contact Advantage/);
  assert.doesNotMatch(photos.unavailableMessage(), /coming soon|coming for launch|client id|oauth|client secret/i);
  assert.equal(photos.openFolderUrl('library'), 'https://photos.google.com/');
  assert.equal(photos.openFolderUrl('folder'), null);
  const photosConnect = await photos.connect();
  assert.equal(photosConnect.ok, false);
  if (!photosConnect.ok) {
    assert.equal(photosConnect.reason, 'unavailable');
    assert.match(photosConnect.message, /contact Advantage/);
  }
  await assert.rejects(() => photos.save('token', { name: 'a.txt', text: 'b' }), /contact Advantage/);
  await assert.rejects(() => photos.open('token'), /contact Advantage/);
  photos.disconnect();

  const dropbox = cloudStorage('dropbox');
  assert.equal(dropbox.phase, 'reserved');
  assert.equal(dropbox.isAvailable(), false);
  assert.match(dropbox.unavailableMessage(), /not on the Coach and Pro launch list/);
  assert.doesNotMatch(dropbox.unavailableMessage(), /coming soon|coming for launch/i);
});

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (entry.isFile()) out.push(path);
  }
  return out;
}

function isTestPath(path: string): boolean {
  return /\.(test|spec)\.[cm]?[jt]sx?$/.test(path);
}

/** Lines that only say iCloud is missing may keep the word. */
function isAbsenceAssertion(line: string): boolean {
  return /doesNotMatch|\.not\.(?:toMatch|toContain|toHaveText|toBeVisible)|toHaveCount\(\s*0\s*\)|iCloud is absent|does not (?:include|offer|list|mention|name)|not offered|no longer/i.test(line);
}

test('user-facing source under src does not mention iCloud', () => {
  const hits: string[] = [];
  for (const path of sourceFiles(SRC_ROOT)) {
    if (isTestPath(path)) continue;
    if (!/\.(tsx?|jsx?|css|html|md|svg)$/.test(path)) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/icloud/i.test(line)) return;
      if (isAbsenceAssertion(line)) return;
      hits.push(`${path}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(hits, []);
});
