import assert from 'node:assert/strict';
import test from 'node:test';
import { FolderBatchError, type FolderSaveProgress } from './folderBatch.ts';
import {
  DEVICE_STORAGE_FULL_NOTE,
  FOLDERS,
  StorageQuotaError,
  addFolderFiles,
  fileMatchesFolder,
  isStorageQuotaError,
  listPhotos,
  migrateLegacyVideoFolder,
  quotaAddNote,
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
  assert.equal(FOLDERS[1].label, 'Pro Shop');
  assert.equal(FOLDERS[1].ready, true);
  assert.equal(FOLDERS[2].label, 'Events');
  assert.equal(FOLDERS[2].ready, true);
  assert.equal(FOLDERS[2].comingSoon, '');
  assert.equal(FOLDERS[2].addLabel, 'Add photos');
  assert.equal(FOLDERS[2].videoAddLabel, '');
});

test('Gallery accepts photos and videos; other folders stay images', () => {
  const gallery = { id: 'gallery', mimePrefix: 'image/' };
  const shop = { id: 'shop', mimePrefix: 'image/' };
  const events = { id: 'events', mimePrefix: 'image/' };
  const photo = new File(['x'], 'kid.jpg', { type: 'image/jpeg' });
  const clip = new File(['x'], 'drill.mp4', { type: 'video/mp4' });
  const bare = new File(['x'], 'drill.MOV', { type: '' });
  assert.equal(fileMatchesFolder(photo, gallery), true);
  assert.equal(fileMatchesFolder(clip, gallery), true);
  assert.equal(fileMatchesFolder(bare, gallery), true);
  assert.equal(fileMatchesFolder(photo, shop), true);
  assert.equal(fileMatchesFolder(clip, shop), false);
  assert.equal(fileMatchesFolder(photo, events), true);
  assert.equal(fileMatchesFolder(clip, events), false);
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

test('storage quota is the Safari memory dialog, not a random failure', () => {
  assert.equal(isStorageQuotaError(null), false);
  assert.equal(isStorageQuotaError(new Error('network down')), false);
  assert.equal(isStorageQuotaError(new DOMException('Transaction aborted', 'AbortError')), false);
  assert.equal(isStorageQuotaError(new DOMException('The quota has been exceeded.', 'QuotaExceededError')), true);
  assert.equal(isStorageQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' }), true);
  assert.equal(isStorageQuotaError({ code: 22 }), true);
  assert.equal(isStorageQuotaError({ code: 1014 }), true);
  assert.equal(isStorageQuotaError({ message: 'not enough memory on phone' }), true);
  assert.equal(quotaAddNote(new Error('nope')), null);
  assert.equal(quotaAddNote(new StorageQuotaError(0)), DEVICE_STORAGE_FULL_NOTE);
  assert.equal(quotaAddNote(new StorageQuotaError(1)), `Saved 1. ${DEVICE_STORAGE_FULL_NOTE}`);
  assert.equal(DEVICE_STORAGE_FULL_NOTE.includes('memory'), false);
});

type DbGlobals = {
  indexedDB?: unknown;
  document?: Document;
  createImageBitmap?: typeof createImageBitmap;
};

function rememberGlobals(): DbGlobals {
  return {
    indexedDB: globalThis.indexedDB,
    document: globalThis.document,
    createImageBitmap: globalThis.createImageBitmap,
  };
}

function restoreGlobals(previous: DbGlobals) {
  const target = globalThis as DbGlobals;
  for (const key of ['indexedDB', 'document', 'createImageBitmap'] as const) {
    if (previous[key] === undefined) delete target[key];
    else target[key] = previous[key] as never;
  }
}

function installPhotoFixtures(failPutsAfter?: number, putFailure: 'quota' | 'generic' = 'quota') {
  const tables = new Map<string, Map<string, unknown>>();
  let version = 0;
  let puts = 0;
  let decoded = 0;

  const table = (name: string) => {
    let rows = tables.get(name);
    if (!rows) {
      rows = new Map();
      tables.set(name, rows);
    }
    return rows;
  };

  const db = {
    objectStoreNames: {
      contains: (name: string) => tables.has(name),
    },
    createObjectStore: (name: string) => {
      table(name);
      return {};
    },
    transaction: (storeName: string) => {
      const tx: {
        error: DOMException | null;
        oncomplete: null | (() => void);
        onabort: null | (() => void);
        objectStore: () => {
          getAll: () => FakeRequest;
          openCursor: () => FakeRequest;
          put: (value: { id: string }) => void;
        };
      } = {
        error: null,
        oncomplete: null,
        onabort: null,
        objectStore: () => ({
          getAll: () => {
            const req: FakeRequest = {};
            queueMicrotask(() => {
              req.result = [...table(storeName).values()];
              req.onsuccess?.();
            });
            return req;
          },
          openCursor: () => {
            const req: FakeRequest = {};
            queueMicrotask(() => {
              req.result = null;
              req.onsuccess?.();
            });
            return req;
          },
          put: (value: { id: string }) => {
            puts += 1;
            if (failPutsAfter != null && puts > failPutsAfter) {
              tx.error =
                putFailure === 'generic'
                  ? new DOMException('The operation failed.', 'UnknownError')
                  : new DOMException('The quota has been exceeded.', 'QuotaExceededError');
              return;
            }
            table(storeName).set(value.id, value);
          },
        }),
      };
      queueMicrotask(() => {
        if (tx.error) tx.onabort?.();
        else tx.oncomplete?.();
      });
      return tx;
    },
  };

  globalThis.indexedDB = {
    open: (_name: string, nextVersion: number) => {
      const req: FakeRequest & { transaction?: unknown } = {};
      queueMicrotask(() => {
        if (nextVersion > version) {
          version = nextVersion;
          req.result = db;
          req.transaction = db.transaction('photos');
          req.onupgradeneeded?.();
        }
        req.result = db;
        queueMicrotask(() => req.onsuccess?.());
      });
      return req;
    },
  } as unknown as IDBFactory;

  globalThis.createImageBitmap = (async () => {
    decoded += 1;
    return {
      width: 4032,
      height: 3024,
      close() {},
    };
  }) as typeof createImageBitmap;

  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: '',
        imageSmoothingEnabled: false,
        imageSmoothingQuality: 'low',
        fillRect() {},
        drawImage() {},
      }),
      toBlob: (callback: (blob: Blob | null) => void, mime: string) => {
        callback(new Blob([new Uint8Array(32_000)], { type: mime }));
      },
    }),
  } as unknown as Document;

  return {
    decoded: () => decoded,
  };
}

type FakeRequest = {
  result?: unknown;
  onsuccess?: (() => void) | null;
  onupgradeneeded?: (() => void) | null;
};

function phonePhoto(name: string, bytes = 3_500_000, type = 'image/jpeg') {
  return new File([new Uint8Array(bytes)], name, { type });
}

test('two large Pro Shop photos are stored shrunk, and a full quota says so', async () => {
  const previous = rememberGlobals();
  try {
    const fixtures = installPhotoFixtures();
    const added = await addFolderFiles(
      [phonePhoto('gi.jpg'), phonePhoto('rashguard.heic', 2_800_000, 'image/heic')],
      'shop',
    );
    assert.equal(added, 2);
    assert.equal(fixtures.decoded(), 2);
    const cards = await listPhotos('shop');
    assert.equal(cards.length, 2);
    assert.deepEqual(
      cards.map((card) => card.label),
      ['Card 1', 'Card 2'],
    );
    assert.ok(cards.every((card) => card.mime === 'image/jpeg' && card.blob.size === 32_000));
    assert.ok(cards.every((card) => card.blob.size < 100_000));

    installPhotoFixtures();
    const clip = new File([new Uint8Array(80_000)], 'class.mp4', { type: 'video/mp4' });
    const galleryAdded = await addFolderFiles([clip, phonePhoto('mat.jpg')], 'gallery');
    assert.equal(galleryAdded, 2);
    const gallery = await listPhotos('gallery');
    const video = gallery.find((item) => item.mime === 'video/mp4');
    const photo = gallery.find((item) => item.mime === 'image/jpeg');
    assert.equal(video?.blob.size, 80_000);
    assert.equal(photo?.blob.size, 32_000);

    installPhotoFixtures(1);
    await assert.rejects(
      addFolderFiles([phonePhoto('belt.jpg'), phonePhoto('tape.jpg')], 'shop'),
      (error: unknown) => {
        assert.ok(error instanceof StorageQuotaError);
        assert.equal(error.saved, 1);
        assert.equal(error.attempted, 2);
        const note = quotaAddNote(error);
        assert.equal(note, `Saved 1. ${DEVICE_STORAGE_FULL_NOTE}`);
        assert.equal(note?.includes('memory'), false);
        return true;
      },
    );
    const kept = await listPhotos('shop');
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.blob.size, 32_000);

    installPhotoFixtures(0);
    await assert.rejects(addFolderFiles([phonePhoto('shorts.jpg')], 'shop'), (error: unknown) => {
      assert.ok(error instanceof StorageQuotaError);
      assert.equal(error.saved, 0);
      assert.equal(error.attempted, 1);
      assert.equal(quotaAddNote(error), DEVICE_STORAGE_FULL_NOTE);
      return true;
    });
    assert.equal((await listPhotos('shop')).length, 0);
  } finally {
    restoreGlobals(previous);
  }
});

test('a multi-photo batch reports progress as each file is stored and does not cap the count', async () => {
  const previous = rememberGlobals();
  try {
    const fixtures = installPhotoFixtures();
    const progress: FolderSaveProgress[] = [];
    let decodedWhenFirstSaved = -1;
    const photos = Array.from({ length: 6 }, (_, index) => phonePhoto(`mat-${index}.jpg`));
    const added = await addFolderFiles(photos, 'events', {
      onProgress: (update) => {
        progress.push({ ...update });
        if (update.phase === 'save' && update.done === 1 && decodedWhenFirstSaved < 0) {
          decodedWhenFirstSaved = fixtures.decoded();
        }
      },
    });
    assert.equal(added, 6);
    assert.equal((await listPhotos('events')).length, 6);
    assert.equal(decodedWhenFirstSaved, 1);
    assert.deepEqual(
      progress.map((update) => [update.phase, update.done, update.total]),
      [
        ['shrink', 0, 6],
        ['save', 1, 6],
        ['shrink', 1, 6],
        ['save', 2, 6],
        ['shrink', 2, 6],
        ['save', 3, 6],
        ['shrink', 3, 6],
        ['save', 4, 6],
        ['shrink', 4, 6],
        ['save', 5, 6],
        ['shrink', 5, 6],
        ['save', 6, 6],
      ],
    );
  } finally {
    restoreGlobals(previous);
  }
});

test('a non-quota stop keeps the photos already stored', async () => {
  const previous = rememberGlobals();
  try {
    installPhotoFixtures(1, 'generic');
    await assert.rejects(
      addFolderFiles([phonePhoto('one.jpg'), phonePhoto('two.jpg'), phonePhoto('three.jpg')], 'gallery'),
      (error: unknown) => {
        assert.ok(error instanceof FolderBatchError);
        assert.equal(error.saved, 1);
        assert.equal(error.failed, 2);
        assert.equal(error.total, 3);
        return true;
      },
    );
    const kept = await listPhotos('gallery');
    assert.equal(kept.length, 1);
    assert.equal(kept[0]?.label, 'Photo 1');
  } finally {
    restoreGlobals(previous);
  }
});
