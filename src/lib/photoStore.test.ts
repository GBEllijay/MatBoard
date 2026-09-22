import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FOLDERS,
  fileMatchesFolder,
  migrateLegacyVideoFolder,
  type PhotoRow,
} from './photoStore.ts';

function row(partial: Partial<PhotoRow> & Pick<PhotoRow, 'id' | 'folderId'>): PhotoRow {
  return {
    label: partial.id,
    mime: 'image/jpeg',
    blob: new Blob(),
    addedAt: 0,
    sortOrder: 0,
    playEnabled: true,
    ...partial,
  };
}

test('Console folders are Gallery, Pro Shop, and Events', () => {
  assert.deepEqual(
    FOLDERS.map((folder) => folder.id),
    ['gallery', 'shop', 'events'],
  );
  assert.equal(FOLDERS[0].videoAddLabel, 'Add videos');
  assert.equal(FOLDERS[0].addLabel, 'Add photos');
});

test('Gallery accepts photos and videos; other folders stay images', () => {
  const gallery = { id: 'gallery', mimePrefix: 'image/' };
  const shop = { id: 'shop', mimePrefix: 'image/' };
  const photo = new File(['x'], 'kid.jpg', { type: 'image/jpeg' });
  const clip = new File(['x'], 'drill.mp4', { type: 'video/mp4' });
  const bare = new File(['x'], 'drill.MOV', { type: '' });
  assert.equal(fileMatchesFolder(photo, gallery), true);
  assert.equal(fileMatchesFolder(clip, gallery), true);
  assert.equal(fileMatchesFolder(bare, gallery), true);
  assert.equal(fileMatchesFolder(photo, shop), true);
  assert.equal(fileMatchesFolder(clip, shop), false);
});

test('old Videos folder items append after Gallery once', () => {
  const photos = [
    row({ id: 'p1', folderId: 'gallery', sortOrder: 0, mime: 'image/jpeg' }),
    row({ id: 'p2', folderId: 'gallery', sortOrder: 1, mime: 'image/jpeg' }),
  ];
  const clips = [
    row({ id: 'v2', folderId: 'videos', sortOrder: 1, mime: 'video/webm', playEnabled: false }),
    row({ id: 'v1', folderId: 'videos', sortOrder: 0, mime: 'video/mp4' }),
  ];
  const first = migrateLegacyVideoFolder([...clips, ...photos]);
  assert.deepEqual(
    first.rows.map((item) => [item.id, item.folderId, item.sortOrder, item.playEnabled]),
    [
      ['v2', 'gallery', 3, false],
      ['v1', 'gallery', 2, true],
      ['p1', 'gallery', 0, true],
      ['p2', 'gallery', 1, true],
    ],
  );
  assert.deepEqual(
    first.changed.map((item) => item.id),
    ['v1', 'v2'],
  );
  const again = migrateLegacyVideoFolder(first.rows);
  assert.deepEqual(again.changed, []);
  assert.deepEqual(again.rows, first.rows);
});
