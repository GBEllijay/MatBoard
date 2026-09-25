import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildPlayQueue, isItemPlayEnabled, type PlaylistItem } from './playlist.ts';

function item(
  partial: Partial<PlaylistItem> & Pick<PlaylistItem, 'id' | 'folderId'>,
): PlaylistItem {
  return {
    label: partial.id,
    sortOrder: 0,
    addedAt: 0,
    playEnabled: true,
    ...partial,
  };
}

function queue(
  items: PlaylistItem[],
  extra?: Partial<Parameters<typeof buildPlayQueue>[1]>,
) {
  return buildPlayQueue(items, {
    folderIds: ['gallery', 'shop'],
    folderEnabled: { gallery: true, shop: true },
    isPlayable: () => true,
    ...extra,
  });
}

describe('isItemPlayEnabled', () => {
  it('treats a missing playEnabled flag as On so older saved clips still play', () => {
    assert.equal(isItemPlayEnabled({}), true);
    assert.equal(isItemPlayEnabled({ playEnabled: undefined }), true);
    assert.equal(isItemPlayEnabled({ playEnabled: true }), true);
    assert.equal(isItemPlayEnabled({ playEnabled: false }), false);
  });
});

describe('buildPlayQueue item Play On/Off', () => {
  it('keeps Play On items in folder list order and skips Play Off', () => {
    const a = item({ id: 'a', folderId: 'gallery', sortOrder: 0 });
    const b = item({ id: 'b', folderId: 'gallery', sortOrder: 1, playEnabled: false });
    const c = item({ id: 'c', folderId: 'gallery', sortOrder: 2 });
    assert.deepEqual(
      queue([c, b, a]).map((row) => row.id),
      ['a', 'c'],
    );
  });

  it('treats a missing playEnabled flag as On so older saved clips still play', () => {
    const legacy = item({ id: 'legacy', folderId: 'gallery' });
    delete (legacy as { playEnabled?: boolean }).playEnabled;
    assert.deepEqual(queue([legacy]).map((row) => row.id), ['legacy']);
  });

  it('returns a single enabled clip so the player can loop it alone', () => {
    const items = [
      item({ id: 'off', folderId: 'gallery', sortOrder: 0, playEnabled: false }),
      item({ id: 'solo', folderId: 'gallery', sortOrder: 1 }),
    ];
    assert.deepEqual(queue(items).map((row) => row.id), ['solo']);
  });

  it('returns an empty queue when every clip is Play Off', () => {
    const items = [
      item({ id: 'a', folderId: 'gallery', sortOrder: 0, playEnabled: false }),
      item({ id: 'b', folderId: 'gallery', sortOrder: 1, playEnabled: false }),
    ];
    assert.deepEqual(queue(items), []);
  });

  it('still skips a Play On item when its folder is Off', () => {
    const clip = item({ id: 'clip', folderId: 'shop' });
    assert.deepEqual(
      queue([clip], { folderEnabled: { gallery: true, shop: false } }),
      [],
    );
  });

  it('plays enabled folders in folder order without mixing their lists', () => {
    const items = [
      item({ id: 'photo', folderId: 'gallery', sortOrder: 0 }),
      item({ id: 'clip', folderId: 'gallery', sortOrder: 1 }),
      item({ id: 'skip', folderId: 'shop', sortOrder: 0, playEnabled: false }),
      item({ id: 'flyer', folderId: 'shop', sortOrder: 1 }),
    ];
    assert.deepEqual(queue(items).map((row) => row.id), ['photo', 'clip', 'flyer']);
  });

  it('skips Play Off ids in a cross-folder story list', () => {
    const items = [
      item({ id: 'a', folderId: 'gallery', sortOrder: 0 }),
      item({ id: 'b', folderId: 'gallery', sortOrder: 1, playEnabled: false }),
      item({ id: 'c', folderId: 'gallery', sortOrder: 2 }),
    ];
    assert.deepEqual(
      queue(items, { storyIds: ['b', 'c', 'a'] }).map((row) => row.id),
      ['c', 'a'],
    );
  });
});
