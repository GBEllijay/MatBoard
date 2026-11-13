import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadAdvantageCloudFile, type CloudUploadResume } from './advantageCloudMedia.ts';
import { cloudFingerprint, fingerprintSamples, FINGERPRINT_FULL_MAX_BYTES, isCloudFingerprint, sha256Hex } from './cloudFingerprint.ts';
import { UploadCanceledError } from './cloudUploadRetry.ts';

type Call = { method: string; url: string; body?: unknown };

function fakeCloud(script: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    const call: Call = { method: init?.method ?? 'GET', url: String(input) };
    if (typeof init?.body === 'string') call.body = JSON.parse(init.body);
    calls.push(call);
    return script(call, calls.length - 1);
  }) as typeof fetch;
  return { calls, fetcher };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const instant = async () => undefined;

test('fingerprints: full hash for small files, sampled hash for large ones', async () => {
  const small = new Blob([new TextEncoder().encode('jpeg')]);
  assert.equal(await cloudFingerprint(small), `v1-full-${await sha256Hex(new TextEncoder().encode('jpeg'))}`);
  assert.equal(isCloudFingerprint(await cloudFingerprint(small)), true);
  assert.equal(isCloudFingerprint('v1-full-xyz'), false);
  assert.equal(isCloudFingerprint('../x'), false);

  const size = FINGERPRINT_FULL_MAX_BYTES + 1024;
  const ranges = fingerprintSamples(size);
  assert.deepEqual(ranges[0], { start: 0, end: 4 * 1024 * 1024 });
  assert.equal(ranges[2]!.end, size);
  const big = new Uint8Array(size);
  const a = await cloudFingerprint(new Blob([big]));
  assert.match(a, /^v1-sample-[0-9a-f]{64}$/);
  big[size - 1] = 7; // a change in the tail sample changes the print
  assert.notEqual(await cloudFingerprint(new Blob([big])), a);
  const longer = await cloudFingerprint(new Blob([new Uint8Array(size + 1)]));
  assert.notEqual(longer, a, 'size is part of the sampled print');
});

test('upload sends the fingerprint and stops when the server says duplicate', async () => {
  const { calls, fetcher } = fakeCloud(() => json({ ok: true, mode: 'duplicate', path: 'gallery/approved/2026-11-12/a.jpg', lane: 'approved' }));
  const progress: number[] = [];
  const result = await uploadAdvantageCloudFile({
    purpose: 'gallery',
    dateKey: '2026-11-12',
    file: new Blob(['abcd']),
    fileName: 'a.jpg',
    mime: 'image/jpeg',
    token: 't',
    fetcher,
    fingerprint: `v1-full-${'a'.repeat(64)}`,
    onProgress: (sent) => progress.push(sent),
  });
  assert.deepEqual(result, { ok: true, path: 'gallery/approved/2026-11-12/a.jpg', duplicate: true, lane: 'approved' });
  assert.equal(calls.length, 1);
  assert.equal((calls[0]!.body as { fingerprint: string }).fingerprint, `v1-full-${'a'.repeat(64)}`);
  assert.deepEqual(progress, [4]);
});

test('multipart: a 504 on a part is retried, progress counts each part, complete carries the fingerprint', async () => {
  let partTries = 0;
  const { calls, fetcher } = fakeCloud((call) => {
    if (call.body && (call.body as { action: string }).action === 'start') {
      return json({ ok: true, mode: 'multipart', key: 'groups/l/videos/daily/2026-11-12/v.mp4', path: 'videos/daily/2026-11-12/v.mp4', uploadId: 'up', partSize: 4, lane: 'pending' });
    }
    if (call.url.includes('op=part')) {
      partTries += 1;
      if (partTries === 2) return new Response('gateway', { status: 504 });
      return json({ ok: true, etag: `e${partTries}` });
    }
    return json({ ok: true });
  });
  const progress: number[] = [];
  const result = await uploadAdvantageCloudFile({
    purpose: 'daily-video',
    dateKey: '2026-11-12',
    file: new Blob(['0123456789']),
    fileName: 'v.mp4',
    mime: 'video/mp4',
    token: 't',
    fetcher,
    fingerprint: `v1-sample-${'b'.repeat(64)}`,
    retry: { attempts: 3, sleep: instant },
    onProgress: (sent) => progress.push(sent),
  });
  assert.deepEqual(result, { ok: true, path: 'videos/daily/2026-11-12/v.mp4', lane: 'pending' });
  assert.deepEqual(progress, [4, 8, 10]);
  const complete = calls.at(-1)!.body as { action: string; parts: { partNumber: number }[]; fingerprint: string };
  assert.equal(complete.action, 'complete');
  assert.deepEqual(complete.parts.map((part) => part.partNumber), [1, 2, 3]);
  assert.equal(complete.fingerprint, `v1-sample-${'b'.repeat(64)}`);
});

test('multipart resume: a second try skips start and parts already sent', async () => {
  const resume: CloudUploadResume = {};
  let fail = true;
  const first = fakeCloud((call) => {
    if ((call.body as { action?: string } | undefined)?.action === 'start') {
      return json({ ok: true, mode: 'multipart', key: 'groups/l/gallery/approved/2026-11-12/v.mp4', path: 'gallery/approved/2026-11-12/v.mp4', uploadId: 'up', partSize: 4 });
    }
    if (call.url.includes('partNumber=2') && fail) return new Response('{"error":"gateway"}', { status: 502 });
    if (call.url.includes('op=part')) return json({ ok: true, etag: 'e' });
    return json({ ok: true });
  });
  const input = { purpose: 'gallery' as const, dateKey: '2026-11-12', file: new Blob(['0123456789']), fileName: 'v.mp4', mime: 'video/mp4', token: 't', resume };
  const failed = await uploadAdvantageCloudFile({ ...input, fetcher: first.fetcher });
  assert.equal(failed.ok, false);
  assert.equal(!failed.ok && failed.retryable, true);
  assert.equal(resume.uploadId, 'up');
  assert.deepEqual(resume.parts, [{ partNumber: 1, etag: 'e' }]);

  fail = false;
  const second = fakeCloud((call) => (call.url.includes('op=part') ? json({ ok: true, etag: 'e' }) : json({ ok: true })));
  const ok = await uploadAdvantageCloudFile({ ...input, fetcher: second.fetcher });
  assert.equal(ok.ok, true);
  assert.equal(second.calls.some((call) => (call.body as { action?: string } | undefined)?.action === 'start'), false);
  assert.deepEqual(
    second.calls.filter((call) => call.url.includes('op=part')).map((call) => new URL(call.url).searchParams.get('partNumber')),
    ['2', '3'],
  );
});

test('cancel stops the upload and aborts the server multipart upload', async () => {
  const controller = new AbortController();
  const { calls, fetcher } = fakeCloud((call) => {
    if ((call.body as { action?: string } | undefined)?.action === 'start') {
      return json({ ok: true, mode: 'multipart', key: 'groups/l/gallery/approved/2026-11-12/v.mp4', path: 'gallery/approved/2026-11-12/v.mp4', uploadId: 'up', partSize: 4 });
    }
    if (call.url.includes('op=part')) {
      controller.abort();
      throw new UploadCanceledError();
    }
    return json({ ok: true });
  });
  const result = await uploadAdvantageCloudFile({
    purpose: 'gallery',
    dateKey: '2026-11-12',
    file: new Blob(['0123456789']),
    fileName: 'v.mp4',
    mime: 'video/mp4',
    token: 't',
    fetcher,
    signal: controller.signal,
  });
  assert.deepEqual(result, { ok: false, message: 'Canceled.', canceled: true });
  const abort = calls.find((call) => (call.body as { action?: string } | undefined)?.action === 'abort');
  assert.deepEqual(abort?.body, { action: 'abort', key: 'groups/l/gallery/approved/2026-11-12/v.mp4', uploadId: 'up' });
});

test('a refusal is not marked retryable; a dropped connection is', async () => {
  const full = fakeCloud(() => json({ ok: false, error: 'Advantage Cloud is full for this gym.' }, 409));
  const refused = await uploadAdvantageCloudFile({ purpose: 'gallery', dateKey: '2026-11-12', file: new Blob(['x']), fileName: 'x.jpg', mime: 'image/jpeg', token: 't', fetcher: full.fetcher, retry: { attempts: 3, sleep: instant } });
  assert.deepEqual(refused, { ok: false, message: 'Advantage Cloud is full for this gym.', retryable: false });
  assert.equal(full.calls.length, 1);
  const dropped = await uploadAdvantageCloudFile({
    purpose: 'gallery',
    dateKey: '2026-11-12',
    file: new Blob(['x']),
    fileName: 'x.jpg',
    mime: 'image/jpeg',
    token: 't',
    fetcher: (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch,
    retry: { attempts: 2, sleep: instant },
  });
  assert.equal(dropped.ok, false);
  assert.equal(!dropped.ok && dropped.retryable, true);
});

test('single PUT carries the fingerprint for the server to verify', async () => {
  const { calls, fetcher } = fakeCloud((call) => {
    if ((call.body as { action?: string } | undefined)?.action === 'start') return json({ ok: true, mode: 'single', key: 'groups/l/gallery/approved/2026-11-12/a.jpg', path: 'gallery/approved/2026-11-12/a.jpg', lane: 'approved' });
    return json({ ok: true });
  });
  const print = `v1-full-${'c'.repeat(64)}`;
  const result = await uploadAdvantageCloudFile({ purpose: 'gallery', dateKey: '2026-11-12', file: new Blob(['x']), fileName: 'a.jpg', mime: 'image/jpeg', token: 't', fetcher, fingerprint: print });
  assert.equal(result.ok, true);
  assert.equal(new URL(calls[1]!.url).searchParams.get('fingerprint'), print);
});
