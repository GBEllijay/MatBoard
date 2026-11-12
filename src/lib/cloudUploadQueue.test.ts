import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCloudUploadQueue,
  queueStatusLabel,
  queueSummaryLine,
  summarizeQueue,
  type CloudQueueUpload,
} from './cloudUploadQueue.ts';
import { backoffDelay, fetchWithRetry, retryableStatus, UploadCanceledError } from './cloudUploadRetry.ts';
import type { CloudUploadResult } from './advantageCloudMedia.ts';

const instant = async (_ms: number, signal?: AbortSignal) => {
  if (signal?.aborted) throw new UploadCanceledError();
};

function file(name: string, size = 10): { file: Blob; name: string; mime: string; purpose: 'gallery'; dateKey: string } {
  return { file: new Blob([new Uint8Array(size)]), name, mime: 'image/jpeg', purpose: 'gallery', dateKey: '2026-11-12' };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test('backoff doubles, caps, and jitters ±25%', () => {
  assert.equal(backoffDelay(1, 1000, 15_000, () => 0.5), 1000);
  assert.equal(backoffDelay(2, 1000, 15_000, () => 0.5), 2000);
  assert.equal(backoffDelay(3, 1000, 15_000, () => 0.5), 4000);
  assert.equal(backoffDelay(10, 1000, 15_000, () => 0.5), 15_000);
  assert.equal(backoffDelay(1, 1000, 15_000, () => 0), 750);
  assert.equal(backoffDelay(1, 1000, 15_000, () => 1), 1250);
});

test('only timeouts, rate limits, and 5xx are retryable', () => {
  for (const status of [408, 429, 500, 502, 503, 504]) assert.equal(retryableStatus(status), true, String(status));
  for (const status of [400, 401, 403, 404, 409, 413]) assert.equal(retryableStatus(status), false, String(status));
});

test('fetchWithRetry retries a 504 and a dropped connection, then returns the good answer', async () => {
  const answers: (() => Response)[] = [
    () => new Response('gateway', { status: 504 }),
    () => {
      throw new TypeError('network');
    },
    () => new Response('{"ok":true}', { status: 200 }),
  ];
  const waits: number[] = [];
  let calls = 0;
  const response = await fetchWithRetry(
    (async () => answers[calls++]!()) as typeof fetch,
    'https://x/api',
    {},
    { attempts: 4, sleep: async (ms) => void waits.push(ms), random: () => 0.5 },
  );
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1000, 2000]);
});

test('fetchWithRetry does not retry a refusal like "full"', async () => {
  let calls = 0;
  const response = await fetchWithRetry(
    (async () => {
      calls += 1;
      return new Response('{"error":"full"}', { status: 409 });
    }) as typeof fetch,
    'https://x/api',
    {},
    { attempts: 4, sleep: instant },
  );
  assert.equal(response.status, 409);
  assert.equal(calls, 1);
});

test('fetchWithRetry gives the last 5xx back after the last try', async () => {
  let calls = 0;
  const response = await fetchWithRetry(
    (async () => {
      calls += 1;
      return new Response('', { status: 503 });
    }) as typeof fetch,
    'https://x/api',
    {},
    { attempts: 3, sleep: instant },
  );
  assert.equal(response.status, 503);
  assert.equal(calls, 3);
});

test('queue runs at most two files at a time and reports per-file and overall progress', async () => {
  let live = 0;
  let peak = 0;
  const gates = new Map<string, ReturnType<typeof deferred<CloudUploadResult>>>();
  const upload: CloudQueueUpload = async (job) => {
    live += 1;
    peak = Math.max(peak, live);
    job.onProgress(5, 10);
    const gate = deferred<CloudUploadResult>();
    gates.set(job.name, gate);
    const result = await gate.promise;
    live -= 1;
    return result;
  };
  const queue = createCloudUploadQueue({ upload, sleep: instant });
  queue.add([file('a'), file('b'), file('c'), file('d')]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(peak, 2);
  assert.deepEqual(
    queue.snapshot().map((item) => item.status),
    ['uploading', 'uploading', 'queued', 'queued'],
  );
  assert.equal(queue.snapshot()[0]!.sent, 5);
  assert.equal(queueStatusLabel(queue.snapshot()[0]!), '50%');
  const mid = summarizeQueue(queue.snapshot());
  assert.equal(mid.totalBytes, 40);
  assert.equal(mid.sentBytes, 10);
  assert.equal(mid.fraction, 0.25);
  assert.match(queueSummaryLine(mid), /0 of 4 finished/);

  gates.get('a')!.resolve({ ok: true, path: 'gallery/approved/2026-11-12/a', lane: 'approved' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(peak, 2);
  for (const name of ['b', 'c']) gates.get(name)!.resolve({ ok: true, path: name, lane: 'pending' });
  await new Promise((r) => setTimeout(r, 0));
  gates.get('d')!.resolve({ ok: true, path: 'd', duplicate: true });
  await queue.whenIdle();
  const done = summarizeQueue(queue.snapshot());
  assert.equal(done.done, 3);
  assert.equal(done.duplicate, 1);
  assert.equal(done.waitingApproval, 2);
  assert.equal(done.fraction, 1);
  assert.equal(queueSummaryLine(done), '3 uploaded to Advantage Cloud. 1 already uploaded, skipped. 2 wait for approval in Review Inbox.');
  assert.equal(queueStatusLabel(queue.snapshot()[3]!), 'Already uploaded');
  assert.equal(queueStatusLabel(queue.snapshot()[1]!), 'Uploaded · waiting for approval');
});

test('a retryable failure gets one automatic retry that resumes, then succeeds', async () => {
  const seen: { attempt: number; resumeKey?: string }[] = [];
  let attempt = 0;
  const queue = createCloudUploadQueue({
    sleep: instant,
    upload: async (job) => {
      attempt += 1;
      seen.push({ attempt, resumeKey: job.resume.key });
      if (attempt === 1) {
        job.resume.key = 'groups/l/gallery/approved/2026-11-12/a';
        job.resume.uploadId = 'up1';
        job.resume.parts = [{ partNumber: 1, etag: 'e1' }];
        return { ok: false, message: 'Advantage Cloud stopped during that upload.', retryable: true };
      }
      return { ok: true, path: 'a' };
    },
  });
  queue.add([file('a')]);
  await queue.whenIdle();
  assert.equal(queue.snapshot()[0]!.status, 'done');
  assert.equal(queue.snapshot()[0]!.attempts, 2);
  assert.deepEqual(seen, [{ attempt: 1, resumeKey: undefined }, { attempt: 2, resumeKey: 'groups/l/gallery/approved/2026-11-12/a' }]);
});

test('a refusal fails at once; manual Retry tries again and keeps the resume point', async () => {
  let calls = 0;
  let resumedParts = 0;
  const queue = createCloudUploadQueue({
    sleep: instant,
    upload: async (job) => {
      calls += 1;
      if (calls === 1) {
        job.resume.uploadId = 'up';
        job.resume.parts = [{ partNumber: 1, etag: 'e' }];
        return { ok: false, message: 'Advantage Cloud is full for this gym.', retryable: false };
      }
      resumedParts = job.resume.parts?.length ?? 0;
      return { ok: true, path: 'x' };
    },
  });
  queue.add([file('x')]);
  await queue.whenIdle();
  assert.equal(calls, 1);
  assert.equal(queue.snapshot()[0]!.status, 'failed');
  assert.equal(queue.snapshot()[0]!.message, 'Advantage Cloud is full for this gym.');
  assert.match(queueSummaryLine(summarizeQueue(queue.snapshot())), /1 failed\. Tap Retry\./);
  queue.retryFailed();
  await queue.whenIdle();
  assert.equal(calls, 2);
  assert.equal(resumedParts, 1);
  assert.equal(queue.snapshot()[0]!.status, 'done');
});

test('retryable failures stop after the automatic tries and wait for Retry', async () => {
  let calls = 0;
  const queue = createCloudUploadQueue({
    sleep: instant,
    fileAttempts: 2,
    upload: async () => {
      calls += 1;
      return { ok: false, message: 'Advantage Cloud could not be reached.', retryable: true };
    },
  });
  queue.add([file('x')]);
  await queue.whenIdle();
  assert.equal(calls, 2);
  assert.equal(queue.snapshot()[0]!.status, 'failed');
});

test('cancel aborts a running upload and skips a queued one; the server upload is closed', async () => {
  const aborted: string[] = [];
  const queue = createCloudUploadQueue({
    concurrency: 1,
    sleep: instant,
    abort: async (resume) => void aborted.push(resume.uploadId ?? ''),
    upload: (job) =>
      new Promise<CloudUploadResult>((resolve) => {
        job.resume.uploadId = `up-${job.name}`;
        job.signal.addEventListener('abort', () => resolve({ ok: false, message: 'Canceled.', canceled: true }));
      }),
  });
  const [a, b] = queue.add([file('a'), file('b')]);
  await new Promise((r) => setTimeout(r, 0));
  queue.cancel(b!);
  assert.equal(queue.snapshot()[1]!.status, 'canceled');
  queue.cancel(a!);
  await queue.whenIdle();
  assert.equal(queue.snapshot()[0]!.status, 'canceled');
  const summary = summarizeQueue(queue.snapshot());
  assert.equal(summary.canceled, 2);
  assert.equal(summary.totalBytes, 0, 'canceled files leave the byte total');
  // A cancel during a backoff wait also closes the open multipart upload.
  const sleeping = createCloudUploadQueue({
    abort: async (resume) => void aborted.push(resume.uploadId ?? ''),
    upload: async (job) => {
      job.resume.key = 'k';
      job.resume.uploadId = 'up-wait';
      return { ok: false, message: 'gateway', retryable: true };
    },
    sleep: (_ms, signal) =>
      new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new UploadCanceledError()))),
  });
  const [c] = sleeping.add([file('c')]);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sleeping.snapshot()[0]!.status, 'retrying');
  sleeping.cancel(c!);
  await sleeping.whenIdle();
  assert.equal(sleeping.snapshot()[0]!.status, 'canceled');
  assert.ok(aborted.includes('up-wait'));
});

test('dedup in a batch: the same content twice uploads once', async () => {
  const uploaded: string[] = [];
  const queue = createCloudUploadQueue({
    concurrency: 1,
    sleep: instant,
    fingerprint: async (blob) => `v1-full-${String(blob.size).padStart(64, '0')}`,
    upload: async (job) => {
      uploaded.push(job.name);
      assert.match(job.fingerprint ?? '', /^v1-full-/);
      return { ok: true, path: job.name };
    },
  });
  queue.add([file('a', 7), file('a-copy', 7), file('b', 9)]);
  await queue.whenIdle();
  assert.deepEqual(uploaded, ['a', 'b']);
  assert.equal(queue.snapshot()[1]!.status, 'duplicate');
  assert.match(queue.snapshot()[1]!.message, /Same file as a/);
});

test('a fingerprint error still uploads, just without dedup', async () => {
  let print: string | undefined = 'unset';
  const queue = createCloudUploadQueue({
    sleep: instant,
    fingerprint: async () => {
      throw new Error('no crypto');
    },
    upload: async (job) => {
      print = job.fingerprint;
      return { ok: true, path: 'x' };
    },
  });
  queue.add([file('x')]);
  await queue.whenIdle();
  assert.equal(print, undefined);
  assert.equal(queue.snapshot()[0]!.status, 'done');
});

test('whenBelow lets an import wait for the queue to drain', async () => {
  const gate = deferred<CloudUploadResult>();
  const queue = createCloudUploadQueue({ sleep: instant, concurrency: 1, upload: () => gate.promise });
  queue.add([file('a'), file('b')]);
  let released = false;
  const waiting = queue.whenBelow(2).then(() => (released = true));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(released, false);
  gate.resolve({ ok: true, path: 'x' });
  await waiting;
  assert.equal(released, true);
  await queue.whenIdle();
  queue.clearFinished();
  assert.equal(queue.snapshot().length, 0);
});
