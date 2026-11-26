/**
 * Advantage Cloud folder view (Gallery, Pro Shop, Events, Schedule), Review Inbox daily-video rows, the client
 * lane store, and the visible Cloud copy status on the Gallery page.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { Window } from 'happy-dom';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const dom = new Window({ url: 'https://advantagebjjtimer.com/slideshow?folder=gallery' });
const view = dom as unknown as Window & typeof globalThis;
function installGlobal(key: string, value: unknown) {
  const desc = Object.getOwnPropertyDescriptor(globalThis, key);
  if (desc && desc.configurable === false && desc.writable !== true) return;
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
installGlobal('window', view);
installGlobal('document', view.document);
installGlobal('localStorage', view.localStorage);
installGlobal('sessionStorage', view.sessionStorage);
installGlobal('HTMLElement', view.HTMLElement);
installGlobal('navigator', view.navigator);
installGlobal('Event', view.Event);
installGlobal('IS_REACT_ACT_ENVIRONMENT', true);
let urlSeq = 0;
URL.createObjectURL = () => `blob:test-${(urlSeq += 1)}`;
URL.revokeObjectURL = () => undefined;

const { CloudGallerySection, CLOUD_GALLERY_EMPTY, thumbnailBatch } = await import('./CloudGallerySection.tsx');
const { CloudVideoCleanup, CLOUD_CLEANUP_TITLE } = await import('./CloudVideoCleanup.tsx');
const { MediaFolderTiles, mediaTileCount } = await import('./MediaFolderTiles.tsx');
const { MediaFolderGrid, viewerCount } = await import('./MediaFolderGrid.tsx');
const { advantageCloudLaneStore, listApprovedCloudMedia, CLOUD_GALLERY_READ_ERROR } = await import('../lib/advantageCloudLanes.ts');
const { CLOUD_CLEANUP_EMPTY } = await import('../lib/cloudVideoCleanup.ts');
const { cloudCopyLine, copyFilesToCloudGallery } = await import('../lib/galleryCloudCopy.ts');
type ApprovalItem = import('../lib/approvalLanes.ts').ApprovalItem;
type ApprovalLaneStore = import('../lib/approvalLanes.ts').ApprovalLaneStore;

const flush = async () => {
  for (let index = 0; index < 6; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
};

function mount(node: React.ReactNode): { root: Root; host: HTMLElement } {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(node));
  return { root, host };
}

const photo: ApprovalItem = {
  provider: 'advantage-cloud',
  source: 'gallery',
  lane: 'approved',
  path: 'gallery/approved/2026-11-11/class.jpg',
  name: 'class.jpg',
  dateKey: '2026-11-11',
  mime: 'image/jpeg',
  size: 3,
  kind: 'photo',
};
const video: ApprovalItem = {
  ...photo,
  source: 'daily-video',
  path: 'videos/daily/2026-11-12/drill.mp4',
  name: 'drill.mp4',
  dateKey: '2026-11-12',
  mime: 'video/mp4',
  kind: 'video',
};

function fakeStore(opened: string[]): ApprovalLaneStore {
  return {
    provider: 'advantage-cloud',
    list: async () => [],
    decide: async (item) => ({ ok: true, item }),
    open: async (item) => {
      opened.push(item.path);
      return new Blob(['x'], { type: item.mime });
    },
  };
}

type FolderItem = import('../lib/advantageCloudFolders.ts').CloudFolderItem;
type FolderListing = import('../lib/advantageCloudFolders.ts').CloudFolderListing;
const galleryPhoto: FolderItem = { ...photo, folder: 'gallery' };
const galleryClip: FolderItem = {
  ...photo,
  folder: 'gallery',
  path: 'gallery/approved/2026-11-12/clip.mp4',
  name: 'clip.mp4',
  dateKey: '2026-11-12',
  mime: 'video/mp4',
  kind: 'video',
};
const shopCard: FolderItem = { ...galleryPhoto, folder: 'pro-shop', path: 'pro-shop/gi.jpg', name: 'gi.jpg', dateKey: '' };
function folders(byId: Partial<Record<string, FolderItem[]>>, rights = { canUpload: true, canDelete: true }) {
  return async (folder: string): Promise<FolderListing> => ({
    folder: folder as FolderListing['folder'],
    items: byId[folder] ?? [],
    canUpload: rights.canUpload,
    canDelete: rights.canDelete,
    uploadLane: folder === 'gallery' && rights.canUpload ? 'approved' : null,
  });
}

test('Cloud shows four folders to tap instead of every image; Gallery opens and plays only Gallery', async () => {
  const opened: string[] = [];
  const { root, host } = mount(
    <CloudGallerySection load={folders({ gallery: [galleryClip, galleryPhoto], 'pro-shop': [shopCard] })} store={fakeStore(opened)} />,
  );
  await flush();
  assert.ok(host.querySelector('[data-cloud-gallery]'));
  assert.match(host.textContent ?? '', /Advantage Cloud/);
  const folderIds = [...host.querySelectorAll('[data-cloud-folder-open]')].map((node) => node.getAttribute('data-cloud-folder-open'));
  // The Schedule upload folder never fed the TV, so it shows only while it still holds files.
  assert.deepEqual(folderIds, ['gallery', 'pro-shop', 'events']);
  assert.deepEqual(
    [...host.querySelectorAll('.cloud-folders__label')].map((node) => node.textContent),
    ['Gallery', 'Pro Shop', 'Events'],
  );
  assert.doesNotMatch(host.textContent ?? '', /Class photos/);
  // Folder view: no tiles and no thumbnails until a folder is opened.
  assert.equal(host.querySelectorAll('[data-cloud-gallery-item]').length, 0);
  assert.deepEqual(opened, []);
  assert.match(host.querySelector('[data-cloud-folder-open="gallery"]')?.textContent ?? '', /2 files/);

  await act(async () => (host.querySelector('[data-cloud-folder-open="gallery"]') as HTMLButtonElement).click());
  await flush();
  assert.ok(host.querySelector('[data-cloud-folder="gallery"]'));
  const tiles = [...host.querySelectorAll('[data-cloud-gallery-item]')].map((node) => node.getAttribute('data-cloud-gallery-item'));
  assert.deepEqual(tiles.sort(), [galleryPhoto.path, galleryClip.path].sort());
  assert.deepEqual(opened, [galleryPhoto.path], 'photo thumbnails come from op=file; videos wait until played');
  assert.ok(host.querySelector(`[data-cloud-gallery-item="${galleryPhoto.path}"] img`));

  const play = host.querySelector('[data-cloud-gallery-play]') as HTMLButtonElement;
  assert.match(play.textContent ?? '', /Play Gallery slideshow \(2\)/);
  await act(async () => play.click());
  await flush();
  assert.equal(host.querySelector('[data-cloud-slide]')?.getAttribute('data-cloud-slide'), galleryClip.path);
  assert.ok(host.querySelector('.cloud-gallery__player video'));
  const next = [...host.querySelectorAll('.cloud-gallery__controls button')].find((node) => node.textContent === 'Next') as HTMLButtonElement;
  await act(async () => next.click());
  await flush();
  assert.equal(host.querySelector('[data-cloud-slide]')?.getAttribute('data-cloud-slide'), galleryPhoto.path);
  await act(async () => next.click());
  await flush();
  assert.equal(host.querySelector('[data-cloud-slide]')?.getAttribute('data-cloud-slide'), galleryClip.path, 'Pro Shop never joins the slideshow');
  const close = [...host.querySelectorAll('.cloud-gallery__controls button')].find((node) => node.textContent === 'Close') as HTMLButtonElement;
  await act(async () => close.click());
  assert.equal(host.querySelector('[data-cloud-slide]'), null);

  await act(async () => (host.querySelector('[data-cloud-folder-back]') as HTMLButtonElement).click());
  await flush();
  await act(async () => (host.querySelector('[data-cloud-folder-open="pro-shop"]') as HTMLButtonElement).click());
  await flush();
  assert.deepEqual([...host.querySelectorAll('[data-cloud-gallery-item]')].map((node) => node.getAttribute('data-cloud-gallery-item')), [shopCard.path]);
  assert.equal(host.querySelector('[data-cloud-folder="pro-shop"] [data-cloud-gallery-play]'), null, 'only Gallery offers the TV slideshow');
  assert.ok(host.querySelector('[data-cloud-folder-upload="pro-shop"]'));
  act(() => root.unmount());
});

test('gallerySlideshowItems keeps Gallery photos and videos only', async () => {
  const { gallerySlideshowItems } = await import('../lib/advantageCloudFolders.ts');
  const pdf: FolderItem = { ...shopCard, folder: 'schedule', path: 'schedule/week.pdf', name: 'week.pdf', mime: 'application/pdf', kind: 'file' };
  const galleryPdf: FolderItem = { ...galleryPhoto, path: 'gallery/approved/2026-11-12/x.pdf', kind: 'file' };
  const pending: FolderItem = { ...galleryPhoto, lane: 'pending', path: 'gallery/pending/2026-11-12/wait.jpg' };
  assert.deepEqual(
    gallerySlideshowItems([galleryPhoto, shopCard, pdf, galleryClip, galleryPdf, pending]).map((item) => item.path),
    [galleryPhoto.path, galleryClip.path],
  );
});

test('Cloud folders render nothing off Cloud, an empty line in an empty folder, and a visible error on failure', async () => {
  const off = mount(<CloudGallerySection load={async () => null} store={fakeStore([])} />);
  await flush();
  assert.equal(off.host.querySelector('[data-cloud-gallery]'), null);
  act(() => off.root.unmount());

  const empty = mount(<CloudGallerySection load={folders({})} store={fakeStore([])} initialFolder="gallery" />);
  await flush();
  assert.equal(empty.host.querySelector('[data-cloud-gallery-empty]')?.textContent, CLOUD_GALLERY_EMPTY);
  assert.equal(empty.host.querySelector('[data-cloud-gallery-play]'), null);
  act(() => empty.root.unmount());

  const failed = mount(<CloudGallerySection load={async () => ({ error: CLOUD_GALLERY_READ_ERROR })} store={fakeStore([])} />);
  await flush();
  assert.equal(failed.host.querySelector('[data-cloud-gallery-error]')?.textContent, CLOUD_GALLERY_READ_ERROR);
  act(() => failed.root.unmount());
});

test('Gallery upload and Copy from Google Drive show only for uploaders; uploads go to the opened folder', async () => {
  const viewer = mount(
    <CloudGallerySection
      load={folders({ gallery: [galleryPhoto] }, { canUpload: false, canDelete: false })}
      store={fakeStore([])}
      onCopyFromDrive={() => undefined}
      driveConnected
      initialFolder="gallery"
    />,
  );
  await flush();
  assert.equal(viewer.host.querySelector('[data-cloud-folder-upload]'), null);
  assert.equal(viewer.host.querySelector('[data-cloud-drive-copy]'), null);
  assert.equal(viewer.host.querySelector('[data-cloud-delete]'), null);
  act(() => viewer.root.unmount());

  let driveOpened = 0;
  const sent: { folder: string; name: string }[] = [];
  const { root, host } = mount(
    <CloudGallerySection
      load={folders({ gallery: [galleryPhoto] })}
      store={fakeStore([])}
      onCopyFromDrive={() => {
        driveOpened += 1;
      }}
      driveConnected={false}
      upload={async ({ folder, file }) => {
        sent.push({ folder, name: file.name });
        return { ok: true, path: `gallery/approved/2026-11-18/${file.name}`, lane: 'approved' };
      }}
      initialFolder="gallery"
    />,
  );
  await flush();
  const drive = host.querySelector('[data-cloud-drive-copy]') as HTMLButtonElement;
  assert.equal(drive.getAttribute('data-cloud-drive-copy'), 'connect');
  assert.match(drive.textContent ?? '', /Connect Google Drive/);
  await act(async () => drive.click());
  assert.equal(driveOpened, 1);
  const input = host.querySelector('[data-cloud-folder-input="gallery"]') as HTMLInputElement;
  assert.equal(input.getAttribute('accept'), 'image/*,video/*');
  Object.defineProperty(input, 'files', { value: [new File(['x'], 'mat.jpg', { type: 'image/jpeg' })], configurable: true });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await flush();
  assert.deepEqual(sent, [{ folder: 'gallery', name: 'mat.jpg' }]);
  assert.match(host.querySelector('[data-cloud-folder-note]')?.textContent ?? '', /Added 1 to Gallery/);
  act(() => root.unmount());
});

test('client lane store: approved-media list, daily review rows, decisions use the right action, op=file opens bytes', async () => {
  const calls: { url: string; body?: string }[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: typeof init?.body === 'string' ? init.body : undefined });
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (href.includes('purpose=approved-media')) {
      return json({
        items: [
          { name: 'class.jpg', path: photo.path, size: 3, mime: 'image/jpeg', source: 'gallery', dateKey: '2026-11-11', lane: 'approved' },
          { name: 'drill.mp4', path: video.path, size: 4, mime: 'video/mp4', source: 'daily-video', dateKey: '2026-11-12', lane: 'approved' },
        ],
      });
    }
    if (href.includes('purpose=gallery&lane=pending')) {
      return json({ files: [{ name: 'wait.jpg', path: 'gallery/pending/2026-11-12/wait.jpg', size: 1, mime: 'image/jpeg' }] });
    }
    if (href.includes('purpose=daily-review')) {
      return json({ files: [{ name: 'coach.mp4', path: 'videos/daily/2026-11-12/coach.mp4', size: 4, mime: 'video/mp4', dateKey: '2026-11-12', lane: 'pending' }] });
    }
    if (href.includes('op=file')) return new Response(new Blob(['abc']), { status: 200 });
    if (href.endsWith('/api/gym/cloud')) return json({ ok: true, lane: 'approved', path: video.path });
    return json({ ok: false }, 404);
  }) as typeof fetch;

  const approved = await listApprovedCloudMedia({ token: 'tok', fetcher });
  assert.ok(Array.isArray(approved));
  assert.deepEqual(approved.map((item) => [item.path, item.source, item.kind]), [
    [video.path, 'daily-video', 'video'],
    [photo.path, 'gallery', 'photo'],
  ]);
  assert.equal(await listApprovedCloudMedia({ token: '', fetcher }), null);
  const failing = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
  assert.deepEqual(await listApprovedCloudMedia({ token: 'tok', fetcher: failing }), { error: CLOUD_GALLERY_READ_ERROR });

  const store = advantageCloudLaneStore({ token: 'tok', fetcher });
  const pending = await store.list({ lane: 'pending' });
  assert.deepEqual(pending?.map((item) => [item.source, item.path]), [
    ['daily-video', 'videos/daily/2026-11-12/coach.mp4'],
    ['gallery', 'gallery/pending/2026-11-12/wait.jpg'],
  ]);
  const daily = pending!.find((item) => item.source === 'daily-video')!;
  const decided = await store.decide(daily, 'approve');
  assert.equal(decided.ok, true);
  assert.deepEqual(JSON.parse(calls.at(-1)!.body!), { action: 'daily-approve', key: daily.path });
  await store.decide(pending!.find((item) => item.source === 'gallery')!, 'reject');
  assert.deepEqual(JSON.parse(calls.at(-1)!.body!), { action: 'gallery-reject', key: 'gallery/pending/2026-11-12/wait.jpg' });
  const blob = await store.open(photo);
  assert.equal(await blob?.text(), 'abc');
  assert.match(calls.at(-1)!.url, /op=file&path=gallery%2Fapproved%2F2026-11-11%2Fclass\.jpg/);
});

test('Gallery Cloud copy: failures are counted and shown instead of swallowed; off-Cloud stays silent', async () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });
  const route = { ok: true as const, purpose: 'gallery' as const, lane: 'approved' as const, kind: 'photo' as const, fileName: 'a.jpg', path: 'gallery/approved/2026-11-12/a.jpg' };
  const ok = await copyFilesToCloudGallery([file('a.jpg', 'image/jpeg')], {
    dateKey: '2026-11-12',
    publish: async () => ({ route, home: 'advantage-cloud', remoteId: route.path, failed: false }),
  });
  assert.deepEqual(ok, { attempted: 1, copied: 1, waiting: 0, failed: 0, message: '' });
  assert.deepEqual(cloudCopyLine(ok!), { tone: 'saved', text: 'Copied 1 to Advantage Cloud.' });

  const waiting = await copyFilesToCloudGallery([file('b.jpg', 'image/jpeg')], {
    dateKey: '2026-11-12',
    publish: async () => ({ route: { ...route, lane: 'pending' as const }, home: 'advantage-cloud', remoteId: 'x', failed: false }),
  });
  assert.match(cloudCopyLine(waiting!).text, /1 wait for approval in Review Inbox/);

  let calls = 0;
  const mixed = await copyFilesToCloudGallery([file('c.jpg', 'image/jpeg'), file('d.mp4', ''), file('e.jpg', 'image/jpeg')], {
    dateKey: '2026-11-12',
    publish: async (input) => {
      calls += 1;
      if (calls === 1) return { route, home: 'advantage-cloud', remoteId: 'x', failed: false };
      if (calls === 2) {
        assert.equal(input.mime, 'video/mp4');
        assert.equal(input.kind, 'video');
        return { route, home: 'advantage-cloud', remoteId: null, failed: true, message: 'Advantage Cloud is full.' };
      }
      throw new Error('offline');
    },
  });
  assert.deepEqual(mixed, { attempted: 3, copied: 1, waiting: 0, failed: 2, message: 'Advantage Cloud could not be reached.' });
  const line = cloudCopyLine(mixed!);
  assert.equal(line.tone, 'error');
  assert.match(line.text, /Saved on this device\. 2 of 3 did not copy to Advantage Cloud/);

  const offCloud = await copyFilesToCloudGallery([file('f.jpg', 'image/jpeg')], {
    dateKey: '2026-11-12',
    cloudOnly: true,
    publish: async (input) => {
      assert.equal(input.cloudOnly, true);
      return { route, home: 'phone', remoteId: null, failed: false };
    },
  });
  assert.equal(offCloud, null);
});

test('Gallery page wiring: every gallery import path copies to Cloud and the old silent catch is gone', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync('src/pages/Screensaver.tsx', 'utf8');
  assert.match(page, /<CloudGallerySection onCopyFromDrive=\{\(\) => openDrivePick\('gallery', 'any'\)\} driveConnected=/);
  assert.equal((page.match(/copyGalleryToCloud\(/g) ?? []).length >= 3, true, 'device, Google Photos, and Drive picks all copy');
  assert.match(page, /data-cloud-copy=/);
  const review = readFileSync('src/components/GalleryReviewQueue.tsx', 'utf8');
  assert.match(review, /advantageCloudLaneStore\(\)/);
  assert.match(review, /Daily video/);
});

test('Delete on a Gallery video waits for confirm, then removes the file; non-managers see no Delete', async () => {
  const hidden = mount(
    <CloudGallerySection load={folders({ gallery: [galleryClip, galleryPhoto] })} store={fakeStore([])} canManage={false} initialFolder="gallery" />,
  );
  await flush();
  assert.equal(hidden.host.querySelector('[data-cloud-delete]'), null);
  assert.equal(hidden.host.querySelector('[data-cloud-cleanup]'), null);
  act(() => hidden.root.unmount());

  const removed: string[][] = [];
  const { root, host } = mount(
    <CloudGallerySection
      load={folders({ gallery: [galleryClip, galleryPhoto] })}
      store={fakeStore([])}
      canManage
      initialFolder="gallery"
      remove={async ({ paths }) => {
        removed.push(paths);
        return { ok: true, deleted: paths.length, licenseUsedBytes: 0, bucketUsedBytes: 0, capBytes: 8_000_000_000 };
      }}
    />,
  );
  await flush();
  const del = host.querySelector(`[data-cloud-delete="${galleryClip.path}"]`) as HTMLButtonElement;
  assert.ok(del);
  await act(async () => del.click());
  await flush();
  assert.equal(removed.length, 0, 'no delete until confirm');
  assert.match(host.querySelector('[data-cloud-delete-confirm]')?.textContent ?? '', /Delete this video from Advantage Cloud/);
  const cancel = [...host.querySelectorAll('[data-cloud-delete-confirm] button')].find((node) => node.textContent === 'Cancel') as HTMLButtonElement;
  await act(async () => cancel.click());
  await flush();
  assert.equal(host.querySelector('[data-cloud-delete-confirm]'), null);
  await act(async () => (host.querySelector(`[data-cloud-delete="${galleryClip.path}"]`) as HTMLButtonElement).click());
  await flush();
  await act(async () => (host.querySelector('[data-cloud-delete-go]') as HTMLButtonElement).click());
  await flush();
  assert.deepEqual(removed, [[galleryClip.path]]);
  assert.equal(host.querySelector(`[data-cloud-gallery-item="${galleryClip.path}"]`), null);
  assert.ok(host.querySelector(`[data-cloud-gallery-item="${galleryPhoto.path}"]`));
  act(() => root.unmount());
});

test('cleanup lists videos for the chosen cutoff and only deletes after confirm', async () => {
  const calls: { days?: number; paths?: string[] }[] = [];
  const itemsFor = (days: number) =>
    days >= 90
      ? [
          { name: 'old.mp4', path: 'videos/daily/2026-05-01/old.mp4', size: 4_000_000, mime: 'video/mp4', dateKey: '2026-05-01', source: 'daily-video' as const, kind: 'video' as const, lane: 'approved' as const },
        ]
      : [];
  const { root, host } = mount(
    <CloudVideoCleanup
      list={async ({ days }) => {
        calls.push({ days });
        const items = itemsFor(days);
        return { days: days === 30 || days === 60 || days === 90 || days === 180 ? days : 90, cutoff: '2026-08-14', count: items.length, totalBytes: items.reduce((sum, item) => sum + item.size, 0), items, truncated: false };
      }}
      remove={async ({ paths }) => {
        calls.push({ paths });
        return { ok: true, deleted: paths.length, licenseUsedBytes: 1, bucketUsedBytes: 2, capBytes: 8_000_000_000 };
      }}
    />,
  );
  await flush();
  assert.match(host.textContent ?? '', new RegExp(CLOUD_CLEANUP_TITLE));
  await act(async () => (host.querySelector('[data-cloud-cleanup-open]') as HTMLButtonElement).click());
  await flush();
  assert.equal((host.querySelector('[data-cloud-cleanup-days]') as HTMLSelectElement).value, '90');
  assert.match(host.querySelector('[data-cloud-cleanup-summary]')?.textContent ?? '', /1 video · 4 MB/);
  assert.ok(host.querySelector('[data-cloud-cleanup-item="videos/daily/2026-05-01/old.mp4"]'));
  await act(async () => {
    const select = host.querySelector('[data-cloud-cleanup-days]') as HTMLSelectElement;
    select.value = '30';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
  assert.equal(host.querySelector('[data-cloud-cleanup-empty]')?.textContent, CLOUD_CLEANUP_EMPTY(30));
  await act(async () => {
    const select = host.querySelector('[data-cloud-cleanup-days]') as HTMLSelectElement;
    select.value = '90';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
  await act(async () => (host.querySelector('[data-cloud-cleanup-delete]') as HTMLButtonElement).click());
  await flush();
  assert.equal(calls.some((call) => call.paths), false, 'no delete until confirm');
  assert.match(host.querySelector('[data-cloud-delete-confirm]')?.textContent ?? '', /Permanently delete 1 video/);
  await act(async () => (host.querySelector('[data-cloud-delete-go]') as HTMLButtonElement).click());
  await flush();
  assert.deepEqual(calls.filter((call) => call.paths).map((call) => call.paths), [['videos/daily/2026-05-01/old.mp4']]);
  assert.match(host.querySelector('[data-cloud-cleanup-note]')?.textContent ?? '', /Deleted 1 video/);
  act(() => root.unmount());
});

test('Review Inbox: pending rows from all four folders; only the owner can decide them; daily videos keep their rule', async () => {
  const { canDecideCloudRow, cloudPendingLabel } = await import('./GalleryReviewQueue.tsx');
  const fetcher = (async (url: string | URL) => {
    const href = String(url);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    if (href.includes('purpose=gallery&lane=pending')) return json({ files: [{ name: 'wait.jpg', path: 'gallery/pending/2026-11-18/wait.jpg', size: 1, mime: 'image/jpeg' }] });
    if (href.includes('purpose=folder-pending')) {
      return json({
        files: [
          { name: 'gi.jpg', path: 'pro-shop/pending/gi.jpg', size: 1, mime: 'image/jpeg' },
          { name: 'flyer.jpg', path: 'events/pending/flyer.jpg', size: 1, mime: 'image/jpeg' },
          { name: 'Nov.pdf', path: 'schedule/pending/Nov.pdf', size: 1, mime: 'application/pdf' },
        ],
      });
    }
    if (href.includes('purpose=daily-review')) return json({ files: [{ name: 'c.mp4', path: 'videos/daily/2026-11-18/c.mp4', size: 1, mime: 'video/mp4', dateKey: '2026-11-18', lane: 'pending' }] });
    return new Response('{}', { status: 404 });
  }) as typeof fetch;
  const pending = await advantageCloudLaneStore({ token: 'tok', fetcher }).list({ lane: 'pending' });
  assert.ok(pending);
  assert.deepEqual(pending.map((item) => cloudPendingLabel(item)).sort(), ['Daily video', 'Events photo', 'Gallery photo', 'Pro Shop photo', 'Schedule file']);
  const owner = { kind: 'owner' as const };
  for (const item of pending) {
    assert.equal(canDecideCloudRow(item, owner), true, item.path);
    for (const preset of ['coach', 'assistant-coach', 'program-director']) {
      assert.equal(canDecideCloudRow(item, { kind: 'seat', preset }), false, `${preset} ${item.path}`);
    }
    // Instructors seat: not for Gallery, Pro Shop, Events, Schedule. Daily videos keep their old rule.
    assert.equal(canDecideCloudRow(item, { kind: 'seat', preset: 'instructors' }), item.source === 'daily-video', item.path);
  }
});

test('Events folder: image files show thumbnails (never a PDF tile), and the slideshow caption has no file name', async () => {
  const { itemOfForTest } = await import('../lib/advantageCloudFolders.ts');
  const names = ['00-Title.png', '1000017087-jsw3yr.png', 'KIM-Fitness.png'];
  const items = names.map((name) => itemOfForTest('events', { name, path: `events/${name}`, size: 10, mime: 'application/octet-stream', kind: 'file' })!);
  assert.deepEqual(items.map((item) => [item.kind, item.mime]), names.map(() => ['photo', 'image/png']));
  const opened: string[] = [];
  const { root, host } = mount(<CloudGallerySection load={folders({ events: items })} store={fakeStore(opened)} initialFolder="events" />);
  await flush();
  const tiles = [...host.querySelectorAll('[data-cloud-folder="events"] [data-cloud-gallery-item]')];
  assert.equal(tiles.length, 3);
  for (const tile of tiles) {
    assert.ok(tile.querySelector('img'), 'a real thumbnail');
    assert.doesNotMatch(tile.querySelector('.cloud-gallery__glyph')?.textContent ?? '', /PDF/);
  }
  assert.equal(opened.length, 3);

  await act(async () => (tiles[0].querySelector('button.cloud-gallery__open') as HTMLButtonElement).click());
  await flush();
  const player = host.querySelector('.cloud-gallery__player') as HTMLElement;
  assert.ok(player.querySelector('img'));
  const count = player.querySelector('[data-cloud-slide-count]');
  assert.equal(count?.textContent?.replace(/\s+/g, ' ').trim(), '1 of 3');
  assert.doesNotMatch(player.querySelector('.cloud-gallery__controls')?.textContent ?? '', /\.png|00-Title/);
  act(() => root.unmount());
});

test('thumbnails: all of a small Events folder, but a Gallery of 6 MB phone photos stays near the old 24', () => {
  const item = (i: number, size: number) => ({
    provider: 'advantage-cloud' as const,
    source: 'gallery' as const,
    lane: 'approved' as const,
    folder: 'events' as const,
    path: `events/p${i}.png`,
    name: `p${i}.png`,
    dateKey: '',
    mime: 'image/png',
    size,
    kind: 'photo' as const,
  });
  const small = Array.from({ length: 13 }, (_, i) => item(i, 300_000));
  assert.equal(thumbnailBatch(small, {}).length, 13);
  const big = Array.from({ length: 89 }, (_, i) => item(i, 6_500_000));
  const batch = thumbnailBatch(big, {});
  assert.ok(batch.length >= 20 && batch.length <= 24, `got ${batch.length}`);
  // One huge photo still gets its thumbnail, and a photo that already has one is skipped.
  assert.equal(thumbnailBatch([item(0, 400_000_000)], {}).length, 1);
  assert.equal(thumbnailBatch(small, { 'events/p0.png': 'blob:x' }).length, 12);
});

test('Media screen: four folder tiles with a count, a Play on TV switch, and Add; tapping opens that folder', async () => {
  const opened: string[] = [];
  const played: string[] = [];
  const added: string[] = [];
  const tiles = (['gallery', 'schedule', 'shop', 'events'] as const).map((id, index) => ({
    id,
    label: ['Gallery', 'Schedule', 'Pro Shop', 'Events'][index]!,
    count: [4, 0, 1, null][index] as number | null,
    noun: ['item', 'class', 'card', 'photo'][index]!,
    nounPlural: ['items', 'classes', 'cards', 'photos'][index]!,
    playOn: index !== 2,
    onPlay: (on: boolean) => played.push(`${id}:${on}`),
    addLabel: 'Add',
    onAdd: () => added.push(id),
  }));
  const { root, host } = mount(<MediaFolderTiles tiles={tiles} onOpen={(id) => opened.push(id)} />);
  assert.deepEqual([...host.querySelectorAll('[data-media-tile]')].map((node) => node.getAttribute('data-media-tile')), ['gallery', 'schedule', 'shop', 'events']);
  assert.deepEqual([...host.querySelectorAll('[data-media-tile-count]')].map((node) => node.textContent), ['4 items', '0 classes', '1 card', '…']);
  const shopSwitch = host.querySelector('[data-media-tile="shop"] input[type="checkbox"]') as HTMLInputElement;
  assert.equal(shopSwitch.checked, false);
  await act(async () => shopSwitch.click());
  assert.deepEqual(played, ['shop:true']);
  await act(async () => (host.querySelector('[data-media-tile="events"] [data-media-tile-add]') as HTMLButtonElement).click());
  assert.deepEqual(added, ['events']);
  await act(async () => (host.querySelector('[data-media-tile-open="gallery"]') as HTMLButtonElement).click());
  assert.deepEqual(opened, ['gallery']);
  assert.equal(mediaTileCount({ count: 1, noun: 'card', nounPlural: 'cards' }), '1 card');
  act(() => root.unmount());
});

test('Media folder grid: thumbnails, one Delete per item, and a viewer that shows only N of M', async () => {
  const removed: string[] = [];
  const items = [
    { id: 'a', name: 'IMG_0001.jpg', mime: 'image/jpeg', label: 'Fictional open mat' },
    { id: 'b', name: 'IMG_0002.jpg', mime: 'image/jpeg', label: '' },
  ];
  const { root, host } = mount(
    <MediaFolderGrid
      items={items as never}
      thumbById={{ a: 'blob:a', b: 'blob:b' }}
      onRemove={async (id: string) => void removed.push(id)}
      emptyCopy="Nothing here yet."
    />,
  );
  assert.equal(host.querySelectorAll('[data-media-grid-item]').length, 2);
  await act(async () => (host.querySelectorAll('[data-media-delete]')[1] as HTMLButtonElement).click());
  assert.deepEqual(removed, ['b']);
  await act(async () => (host.querySelector('[data-media-grid-item] .cloud-gallery__open') as HTMLButtonElement).click());
  const viewer = host.querySelector('[data-media-viewer]');
  assert.ok(viewer);
  assert.equal(host.querySelector('[data-media-viewer-count]')?.textContent, '1 of 2');
  assert.doesNotMatch(viewer.textContent ?? '', /IMG_000/);
  assert.equal(viewerCount(1, 2), '2 of 2');
  act(() => root.unmount());
});
