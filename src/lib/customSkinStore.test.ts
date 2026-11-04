import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { CUSTOM_SKIN_DELETE_FIRST } from './customSkin.ts';
import {
  deleteCustomSkin,
  hydrateCustomSkins,
  listCustomSkins,
  readCustomSkin,
  renameCustomSkin,
  savePreparedCustomSkin,
  useCustomSkinDatabase,
  type CustomSkinRecord,
} from './customSkinStore.ts';
const view = new Window();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: view.localStorage });

function memoryDb() {
  const rows = new Map<string, CustomSkinRecord>();
  return {
    async get(id: string) {
      return rows.get(id) ?? null;
    },
    async put(record: CustomSkinRecord) {
      rows.set(record.id, record);
    },
    async delete(id: string) {
      rows.delete(id);
    },
    async all() {
      return [...rows.values()];
    },
  };
}

function installFakeIndexedDb(): void {
  type Row = { id: string };
  const stores = new Map<string, Map<string, Row>>();
  const indexedDB = {
    open() {
      const request = {
        result: {
          objectStoreNames: { contains: (name: string) => stores.has(name) },
          createObjectStore(name: string) {
            stores.set(name, new Map());
            return {};
          },
          transaction(name: string) {
            const store = stores.get(name) ?? new Map<string, Row>();
            stores.set(name, store);
            const tx = {
              error: null,
              objectStore() {
                return {
                  get(id: string) {
                    const req = { result: store.get(id) ?? null, onsuccess: () => undefined, onerror: () => undefined };
                    queueMicrotask(() => req.onsuccess());
                    return req;
                  },
                  getAll() {
                    const req = { result: [...store.values()], onsuccess: () => undefined, onerror: () => undefined };
                    queueMicrotask(() => req.onsuccess());
                    return req;
                  },
                  put(record: Row) {
                    store.set(record.id, record);
                  },
                  delete(id: string) {
                    store.delete(id);
                  },
                };
              },
              oncomplete: () => undefined,
              onerror: () => undefined,
              onabort: () => undefined,
            };
            queueMicrotask(() => tx.oncomplete());
            return tx;
          },
          close() {},
        },
        onsuccess: () => undefined,
        onerror: () => undefined,
        onblocked: () => undefined,
        onupgradeneeded: () => undefined,
      };
      queueMicrotask(() => {
        if (!stores.has('skins')) request.onupgradeneeded();
        request.onsuccess();
      });
      return request;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
}

function blob(size = 12): Blob {
  return new Blob([new Uint8Array(size)], { type: 'image/jpeg' });
}

test('ten skins are the cap, a skin survives a new read, and delete clears it', async () => {
  useCustomSkinDatabase(memoryDb());
  localStorage.clear();
  for (let i = 0; i < 10; i += 1) {
    const saved = await savePreparedCustomSkin({
      id: `skin${String(i).padStart(8, '0')}`,
      name: `Mat ${i}`,
      image: blob(20 + i),
      thumb: blob(4),
      mime: 'image/jpeg',
      publish: false,
    });
    assert.equal(saved.ok, true, String(i));
  }
  assert.equal(listCustomSkins().length, 10);
  const blocked = await savePreparedCustomSkin({
    name: 'One more',
    image: blob(),
    thumb: blob(2),
    mime: 'image/jpeg',
    publish: false,
  });
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.error, CUSTOM_SKIN_DELETE_FIRST);

  const kept = await readCustomSkin('skin00000003');
  assert.equal(kept?.name, 'Mat 3');
  assert.equal(kept?.image.size, 23);
  await renameCustomSkin('skin00000003', 'Evening mat');
  assert.equal((await readCustomSkin('skin00000003'))?.name, 'Evening mat');
  assert.equal(listCustomSkins().find((skin) => skin.id === 'skin00000003')?.name, 'Evening mat');

  await deleteCustomSkin('skin00000003');
  assert.equal(await readCustomSkin('skin00000003'), null);
  assert.equal(listCustomSkins().some((skin) => skin.id === 'skin00000003'), false);
  const after = await savePreparedCustomSkin({
    name: 'Replacement',
    image: blob(),
    thumb: blob(2),
    mime: 'image/jpeg',
    publish: false,
  });
  assert.equal(after.ok, true);
  useCustomSkinDatabase(null);
});

test('IndexedDB keeps a custom skin after the manifest cache is dropped', async () => {
  const previous = globalThis.indexedDB;
  installFakeIndexedDb();
  useCustomSkinDatabase(null);
  localStorage.clear();
  const saved = await savePreparedCustomSkin({
    id: 'skinindexed1',
    name: 'Stored',
    image: blob(30),
    thumb: blob(5),
    mime: 'image/jpeg',
    publish: false,
  });
  assert.equal(saved.ok, true);
  localStorage.removeItem('matboard.customSkins.v1');
  await hydrateCustomSkins();
  const row = listCustomSkins().find((skin) => skin.id === 'skinindexed1');
  assert.equal(row?.name, 'Stored');
  assert.equal((await readCustomSkin('skinindexed1'))?.bytes, 30);
  await deleteCustomSkin('skinindexed1');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: previous });
  useCustomSkinDatabase(null);
});
