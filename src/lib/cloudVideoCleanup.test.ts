import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOUD_CLEANUP_EMPTY,
  DEFAULT_VIDEO_CLEANUP_DAYS,
  MEDIA_DELETE_BATCH_MAX,
  OLD_VIDEO_LIST_MAX,
  VIDEO_CLEANUP_DAYS,
  cloudCleanupConfirm,
  cloudCleanupSummary,
  deleteCloudMedia,
  deleteCloudMediaInBatches,
  isOnOrBeforeDateKey,
  isVideoCleanupDays,
  listOldCloudVideos,
  parseVideoCleanupDays,
  videoCleanupCutoffDate,
} from './cloudVideoCleanup.ts';

test('cutoff selection: 30, 60, 90, and 180 days, default 90, inclusive date', () => {
  assert.deepEqual(VIDEO_CLEANUP_DAYS, [30, 60, 90, 180]);
  assert.equal(DEFAULT_VIDEO_CLEANUP_DAYS, 90);
  assert.equal(isVideoCleanupDays(90), true);
  assert.equal(isVideoCleanupDays(45), false);
  assert.equal(parseVideoCleanupDays('60'), 60);
  assert.equal(parseVideoCleanupDays('7'), 90);
  assert.equal(parseVideoCleanupDays(undefined), 90);
  const now = new Date('2026-11-12T05:00:00.000Z');
  assert.equal(videoCleanupCutoffDate(30, now), '2026-10-13');
  assert.equal(videoCleanupCutoffDate(60, now), '2026-09-13');
  assert.equal(videoCleanupCutoffDate(90, now), '2026-08-14');
  assert.equal(videoCleanupCutoffDate(180, now), '2026-05-16');
  assert.equal(isOnOrBeforeDateKey('2026-08-14', '2026-08-14'), true);
  assert.equal(isOnOrBeforeDateKey('2026-08-13', '2026-08-14'), true);
  assert.equal(isOnOrBeforeDateKey('2026-08-15', '2026-08-14'), false);
  assert.equal(CLOUD_CLEANUP_EMPTY(90), 'No videos are older than 90 days.');
  assert.equal(cloudCleanupSummary(0, 0), '0 videos');
  assert.equal(cloudCleanupSummary(1, 1500), '1 video · 1.5 KB');
  assert.equal(cloudCleanupSummary(3, 24_000_000), '3 videos · 24 MB');
  assert.match(cloudCleanupSummary(200, 1_000, true), /At least 200 videos/);
  assert.equal(cloudCleanupConfirm(3, 24_000_000), 'Permanently delete 3 videos (24 MB) from Advantage Cloud? This cannot be undone.');
});

test('client delete and old-video list use the cloud route, and the batch helper respects the cap', async () => {
  const calls: { url: string; body?: string }[] = [];
  const fetcher = (async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    calls.push({ url: href, body: typeof init?.body === 'string' ? init.body : undefined });
    if (href.includes('purpose=old-videos&days=90')) {
      return new Response(
        JSON.stringify({
          ok: true,
          days: 90,
          cutoff: '2026-08-14',
          count: 2,
          totalBytes: 8,
          truncated: false,
          items: [
            { name: 'old.mp4', path: 'videos/daily/2026-05-01/old.mp4', size: 4, mime: 'video/mp4', dateKey: '2026-05-01', source: 'daily-video', kind: 'video', lane: 'approved' },
            { name: 'clip.mp4', path: 'gallery/approved/2026-06-01/clip.mp4', size: 4, mime: 'video/mp4', dateKey: '2026-06-01', source: 'gallery', kind: 'video', lane: 'approved' },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as { keys: string[] };
      return new Response(JSON.stringify({ ok: true, deleted: body.keys.length, licenseUsedBytes: 10, bucketUsedBytes: 20, capBytes: 8_000_000_000 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('no', { status: 500 });
  }) as typeof fetch;

  const listed = await listOldCloudVideos({ days: 90, token: 'tok', fetcher });
  assert.ok(listed && !('error' in listed));
  assert.equal(listed.count, 2);
  assert.equal(listed.cutoff, '2026-08-14');
  assert.equal(await listOldCloudVideos({ days: 90, token: '', fetcher }), null);

  const one = await deleteCloudMedia({ paths: ['videos/daily/2026-05-01/old.mp4'], token: 'tok', fetcher });
  assert.deepEqual(one, { ok: true, deleted: 1, licenseUsedBytes: 10, bucketUsedBytes: 20, capBytes: 8_000_000_000 });
  assert.deepEqual(JSON.parse(calls.at(-1)!.body!), { action: 'delete-media', keys: ['videos/daily/2026-05-01/old.mp4'] });

  assert.equal(MEDIA_DELETE_BATCH_MAX, 100);
  assert.equal(OLD_VIDEO_LIST_MAX, 200);
  const over = await deleteCloudMedia({ paths: Array.from({ length: MEDIA_DELETE_BATCH_MAX + 1 }, (_, i) => `videos/daily/2026-01-01/v${i}.mp4`), token: 'tok', fetcher });
  assert.equal(over.ok, false);

  const paths = Array.from({ length: 101 }, (_, i) => `videos/daily/2026-01-01/v${i}.mp4`);
  const batched = await deleteCloudMediaInBatches({ paths, token: 'tok', fetcher });
  assert.equal(batched.ok, true);
  if (batched.ok) assert.equal(batched.deleted, 101);
  const posted = calls.filter((call) => call.body?.includes('delete-media'));
  assert.equal(posted.length, 3); // one single + two batch slices (100 + 1), the over-cap call never posted
  assert.equal((JSON.parse(posted[1]!.body!) as { keys: string[] }).keys.length, 100);
  assert.equal((JSON.parse(posted[2]!.body!) as { keys: string[] }).keys.length, 1);
});

test('soft-limit link: CLOUD_CLEANUP_ROUTE opens the cleanup panel in the Media gallery', async () => {
  const { CLOUD_CLEANUP_ROUTE } = await import('./advantageCloudMedia.ts');
  const { cloudCleanupRequested } = await import('./cloudVideoCleanup.ts');
  assert.ok(CLOUD_CLEANUP_ROUTE);
  const url = new URL(CLOUD_CLEANUP_ROUTE, 'https://advantagebjjtimer.com');
  assert.equal(url.pathname, '/slideshow');
  assert.equal(url.searchParams.get('folder'), 'gallery');
  assert.equal(cloudCleanupRequested(url.search), true);
  assert.equal(cloudCleanupRequested('?folder=gallery'), false);
});

test('old-videos list carries the per-gym usage numbers from the server', async () => {
  const { listOldCloudVideos } = await import('./cloudVideoCleanup.ts');
  const fetcher = (async () =>
    new Response(JSON.stringify({ ok: true, days: 90, cutoff: '2026-08-14', count: 0, totalBytes: 0, items: [], truncated: false, licenseUsedBytes: 1234, capBytes: 100_000_000_000 }), {
      status: 200,
    })) as unknown as typeof fetch;
  const listed = await listOldCloudVideos({ days: 90, token: 't', fetcher });
  assert.ok(listed && !('error' in listed));
  assert.equal(listed.licenseUsedBytes, 1234);
  assert.equal(listed.capBytes, 100_000_000_000);
});
