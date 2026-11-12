/**
 * Advantage Cloud gallery view, Review Inbox daily-video rows, the client
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

const { CloudGallerySection, CLOUD_GALLERY_EMPTY } = await import('./CloudGallerySection.tsx');
const { advantageCloudLaneStore, listApprovedCloudMedia, CLOUD_GALLERY_READ_ERROR } = await import('../lib/advantageCloudLanes.ts');
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

test('Cloud gallery lists approved photos and daily videos with thumbnails and plays them as a slideshow', async () => {
  const opened: string[] = [];
  const { root, host } = mount(<CloudGallerySection load={async () => [video, photo]} store={fakeStore(opened)} />);
  await flush();
  assert.ok(host.querySelector('[data-cloud-gallery]'));
  assert.match(host.textContent ?? '', /Advantage Cloud/);
  assert.match(host.textContent ?? '', /Class photos and clips \(1\)/);
  assert.match(host.textContent ?? '', /Daily videos \(1\)/);
  const tiles = [...host.querySelectorAll('[data-cloud-gallery-item]')].map((node) => node.getAttribute('data-cloud-gallery-item'));
  assert.deepEqual(tiles.sort(), [photo.path, video.path].sort());
  // Photo thumbnails come from op=file through the store. Videos are not fetched until played.
  assert.deepEqual(opened, [photo.path]);
  assert.ok(host.querySelector(`[data-cloud-gallery-item="${photo.path}"] img`));

  const play = host.querySelector('[data-cloud-gallery-play]') as HTMLButtonElement;
  assert.match(play.textContent ?? '', /Play Advantage Cloud slideshow \(2\)/);
  await act(async () => play.click());
  await flush();
  const slide = host.querySelector('[data-cloud-slide]');
  assert.equal(slide?.getAttribute('data-cloud-slide'), video.path);
  assert.ok(host.querySelector('.cloud-gallery__player video'));
  assert.ok(opened.includes(video.path));
  const next = [...host.querySelectorAll('.cloud-gallery__controls button')].find((node) => node.textContent === 'Next') as HTMLButtonElement;
  await act(async () => next.click());
  await flush();
  assert.equal(host.querySelector('[data-cloud-slide]')?.getAttribute('data-cloud-slide'), photo.path);
  assert.ok(host.querySelector('.cloud-gallery__player img'));
  const close = [...host.querySelectorAll('.cloud-gallery__controls button')].find((node) => node.textContent === 'Close') as HTMLButtonElement;
  await act(async () => close.click());
  assert.equal(host.querySelector('[data-cloud-slide]'), null);
  act(() => root.unmount());
});

test('Cloud gallery renders nothing off Cloud, an empty line with nothing approved, and a visible error on failure', async () => {
  const off = mount(<CloudGallerySection load={async () => null} store={fakeStore([])} />);
  await flush();
  assert.equal(off.host.querySelector('[data-cloud-gallery]'), null);
  act(() => off.root.unmount());

  const empty = mount(<CloudGallerySection load={async () => []} store={fakeStore([])} />);
  await flush();
  assert.equal(empty.host.querySelector('[data-cloud-gallery-empty]')?.textContent, CLOUD_GALLERY_EMPTY);
  act(() => empty.root.unmount());

  const failed = mount(<CloudGallerySection load={async () => ({ error: CLOUD_GALLERY_READ_ERROR })} store={fakeStore([])} />);
  await flush();
  assert.equal(failed.host.querySelector('[data-cloud-gallery-error]')?.textContent, CLOUD_GALLERY_READ_ERROR);
  act(() => failed.root.unmount());
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
  assert.match(line.text, /Saved on this phone\. 2 of 3 did not copy to Advantage Cloud/);

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
  assert.match(page, /<CloudGallerySection \/>/);
  assert.equal((page.match(/copyGalleryToCloud\(/g) ?? []).length >= 3, true, 'device, Google Photos, and Drive picks all copy');
  assert.match(page, /data-cloud-copy=/);
  const review = readFileSync('src/components/GalleryReviewQueue.tsx', 'utf8');
  assert.match(review, /advantageCloudLaneStore\(\)/);
  assert.match(review, /Daily video/);
});
