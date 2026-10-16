import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  clipsNotYetLinked,
  galleryItemShows,
  galleryLoopSec,
  nextClassFromDays,
} from './gallerySchedule.ts';

test('a gallery item with no schedule still plays, and a dated item plays on that day', () => {
  const always = { folderId: 'gallery' };
  assert.equal(galleryItemShows(always, '2026-10-09', null), true);
  assert.equal(galleryItemShows({ folderId: 'gallery', schedule: 'always' }, '2026-10-09', null), true);
  assert.equal(
    galleryItemShows({ folderId: 'gallery', schedule: 'date', showDate: '2026-10-07' }, '2026-10-09', '2026-10-09'),
    false,
  );
  assert.equal(
    galleryItemShows({ folderId: 'gallery', schedule: 'date', showDate: '2026-10-09' }, '2026-10-09', null),
    true,
  );
  assert.equal(
    galleryItemShows({ folderId: 'gallery', schedule: 'next-class' }, '2026-10-09', '2026-10-09'),
    true,
  );
  assert.equal(
    galleryItemShows({ folderId: 'gallery', schedule: 'next-class' }, '2026-10-08', '2026-10-09'),
    false,
  );
  assert.equal(galleryItemShows({ folderId: 'shop', schedule: 'date', showDate: '2026-01-01' }, '2026-10-09', null), true);
  assert.equal(nextClassFromDays(['2026-10-07', '2026-10-11'], '2026-10-09'), '2026-10-11');
  assert.equal(nextClassFromDays(['2026-10-07'], '2026-10-09'), null);
  assert.equal(galleryLoopSec(300), 300);
  assert.deepEqual(
    clipsNotYetLinked(['clip-a'], [
      { clipId: 'clip-a', loopSec: 300 },
      { clipId: 'clip-b', loopSec: 150 },
    ]).map((clip) => clip.clipId),
    ['clip-b'],
  );

  const list = readFileSync(new URL('../components/FolderItemList.tsx', import.meta.url), 'utf8');
  assert.match(list, /GALLERY_SHOW_ON_DATE/);
  assert.match(list, /GALLERY_NEXT_CLASS/);
  assert.match(list, /Caption for/);
  const folder = readFileSync(new URL('../components/ToolboxFolder.tsx', import.meta.url), 'utf8');
  assert.match(folder, /GALLERY_LINK_TECHNIQUES/);
  const store = readFileSync(new URL('./photoStore.ts', import.meta.url), 'utf8');
  assert.match(store, /blob: new Blob\(\)/);
  assert.match(store, /techniqueClipId: galleryClipId\(clip\.clipId\)/);
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  assert.match(css, /\.preset--on \{[\s\S]*background:\s*var\(--permission-on\)/);
});
