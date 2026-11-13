/**
 * Bulk upload queue for Advantage Cloud (Media Console gallery and the
 * Advantage Cloud home card). Each file shows its own progress; the batch
 * shows overall progress. Two files go up at a time. A dropped part or a 5xx
 * is retried with backoff inside the upload; a file that still fails gets one
 * more automatic try (resuming its multipart upload), then a Retry button.
 * Cancel aborts the request and the server multipart upload.
 *
 * Before any bytes go up the file is fingerprinted. A file this gym already
 * has in Cloud comes back as "Already uploaded" and sends nothing.
 *
 * No React or browser globals here, so the rules run under node --test.
 */

import { backoffDelay, defaultSleep, isCanceled } from './cloudUploadRetry.ts';
import type { CloudUploadResult, CloudUploadResume } from './advantageCloudMedia.ts';

export const CLOUD_QUEUE_CONCURRENCY = 2;
/** Automatic tries per file. Each try already retries its own requests. */
export const CLOUD_QUEUE_FILE_ATTEMPTS = 2;

export type CloudQueuePurpose = 'gallery' | 'daily-video';

export type CloudQueueStatus =
  | 'queued'
  | 'checking'
  | 'uploading'
  | 'retrying'
  | 'done'
  | 'duplicate'
  | 'failed'
  | 'canceled';

export type CloudQueueItem = {
  id: string;
  name: string;
  size: number;
  purpose: CloudQueuePurpose;
  dateKey: string;
  status: CloudQueueStatus;
  /** Bytes confirmed sent (or skipped as a duplicate). */
  sent: number;
  /** Tries started, automatic and manual. */
  attempts: number;
  message: string;
  lane?: 'pending' | 'approved';
  path?: string;
};

export type CloudQueueInput = {
  file: Blob;
  name: string;
  mime: string;
  purpose: CloudQueuePurpose;
  dateKey: string;
};

export type CloudQueueUpload = (job: {
  file: Blob;
  name: string;
  mime: string;
  purpose: CloudQueuePurpose;
  dateKey: string;
  fingerprint?: string;
  resume: CloudUploadResume;
  signal: AbortSignal;
  onProgress: (sent: number, total: number) => void;
}) => Promise<CloudUploadResult>;

export type CloudQueueOptions = {
  upload: CloudQueueUpload;
  /** Content fingerprint. Omit to upload without dedup. A throw uploads without dedup. */
  fingerprint?: (file: Blob) => Promise<string>;
  concurrency?: number;
  fileAttempts?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  baseDelayMs?: number;
  /** Closes a server multipart upload left open by a cancel during a backoff wait. */
  abort?: (resume: CloudUploadResume) => Promise<void>;
};

type Job = {
  input: CloudQueueInput;
  resume: CloudUploadResume;
  controller: AbortController | null;
  fingerprint?: string;
};

export type CloudQueueSummary = {
  total: number;
  finished: number;
  done: number;
  duplicate: number;
  failed: number;
  canceled: number;
  active: number;
  waitingApproval: number;
  sentBytes: number;
  totalBytes: number;
  /** 0..1 over bytes, counting duplicates as sent. */
  fraction: number;
};

const FINISHED: ReadonlySet<CloudQueueStatus> = new Set(['done', 'duplicate', 'failed', 'canceled']);

export function queueItemFinished(item: Pick<CloudQueueItem, 'status'>): boolean {
  return FINISHED.has(item.status);
}

export function summarizeQueue(items: readonly CloudQueueItem[]): CloudQueueSummary {
  const summary: CloudQueueSummary = {
    total: items.length,
    finished: 0,
    done: 0,
    duplicate: 0,
    failed: 0,
    canceled: 0,
    active: 0,
    waitingApproval: 0,
    sentBytes: 0,
    totalBytes: 0,
    fraction: 0,
  };
  for (const item of items) {
    if (item.status === 'canceled') {
      summary.canceled += 1;
      summary.finished += 1;
      continue;
    }
    summary.totalBytes += item.size;
    summary.sentBytes += Math.min(item.size, item.sent);
    if (queueItemFinished(item)) summary.finished += 1;
    else summary.active += 1;
    if (item.status === 'done') summary.done += 1;
    if (item.status === 'duplicate') summary.duplicate += 1;
    if (item.status === 'failed') summary.failed += 1;
    if ((item.status === 'done' || item.status === 'duplicate') && item.lane === 'pending') summary.waitingApproval += 1;
  }
  summary.fraction = summary.totalBytes > 0 ? summary.sentBytes / summary.totalBytes : summary.total ? 1 : 0;
  return summary;
}

export function queueStatusLabel(item: CloudQueueItem): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting';
    case 'checking':
      return 'Checking';
    case 'uploading':
      return item.size > 0 ? `${Math.floor((Math.min(item.sent, item.size) / item.size) * 100)}%` : 'Uploading';
    case 'retrying':
      return 'Retrying…';
    case 'done':
      return item.lane === 'pending' ? 'Uploaded · waiting for approval' : 'Uploaded';
    case 'duplicate':
      return 'Already uploaded';
    case 'failed':
      return 'Failed';
    case 'canceled':
      return 'Canceled';
  }
}

export function queueSummaryLine(summary: CloudQueueSummary): string {
  if (!summary.total) return '';
  const counted = summary.total - summary.canceled;
  if (summary.active) {
    return `Uploading to Advantage Cloud: ${summary.finished - summary.canceled} of ${counted} finished.`;
  }
  const parts = [`${summary.done} uploaded to Advantage Cloud.`];
  if (summary.duplicate) parts.push(`${summary.duplicate} already uploaded, skipped.`);
  if (summary.waitingApproval) parts.push(`${summary.waitingApproval} wait for approval in Review Inbox.`);
  if (summary.failed) parts.push(`${summary.failed} failed. Tap Retry.`);
  if (summary.canceled) parts.push(`${summary.canceled} canceled.`);
  return parts.join(' ');
}

export type CloudUploadQueue = ReturnType<typeof createCloudUploadQueue>;

export function createCloudUploadQueue(options: CloudQueueOptions) {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? CLOUD_QUEUE_CONCURRENCY));
  const fileAttempts = Math.max(1, Math.floor(options.fileAttempts ?? CLOUD_QUEUE_FILE_ATTEMPTS));
  const sleep = options.sleep ?? defaultSleep;
  let items: CloudQueueItem[] = [];
  const jobs = new Map<string, Job>();
  /** Kept after a job lets go of its bytes, so a later twin in the batch is still caught. */
  const prints = new Map<string, string>();
  const listeners = new Set<() => void>();
  const idleWaiters: (() => void)[] = [];
  let running = 0;
  let nextId = 1;

  const emit = () => {
    for (const listener of listeners) listener();
    if (running === 0 && !items.some((item) => item.status === 'queued')) {
      for (const resolve of idleWaiters.splice(0)) resolve();
    }
  };

  const patch = (id: string, change: Partial<CloudQueueItem>) => {
    let changed = false;
    items = items.map((item) => {
      if (item.id !== id) return item;
      changed = true;
      return { ...item, ...change };
    });
    if (changed) emit();
  };

  const get = (id: string) => items.find((item) => item.id === id);

  /** Another live item with the same content already claimed it. */
  const twinOf = (id: string, fingerprint: string): CloudQueueItem | undefined =>
    items.find((item) => {
      if (item.id === id || item.status === 'failed' || item.status === 'canceled') return false;
      return prints.get(item.id) === fingerprint;
    });

  const run = async (id: string) => {
    const job = jobs.get(id);
    if (!job) return;
    const controller = new AbortController();
    job.controller = controller;
    const signal = controller.signal;
    try {
      if (!job.fingerprint && options.fingerprint) {
        patch(id, { status: 'checking', message: '' });
        try {
          job.fingerprint = await options.fingerprint(job.input.file);
        } catch {
          job.fingerprint = undefined;
        }
        if (signal.aborted) throw new Error('canceled');
        const twin = job.fingerprint ? twinOf(id, job.fingerprint) : undefined;
        if (job.fingerprint && !twin) prints.set(id, job.fingerprint);
        if (twin) {
          jobs.delete(id);
          patch(id, { status: 'duplicate', sent: job.input.file.size, message: `Same file as ${twin.name} in this list.` });
          return;
        }
      }
      for (let attempt = 1; ; attempt += 1) {
        const current = get(id);
        patch(id, { status: 'uploading', attempts: (current?.attempts ?? 0) + 1, message: '' });
        const result = await options.upload({
          file: job.input.file,
          name: job.input.name,
          mime: job.input.mime,
          purpose: job.input.purpose,
          dateKey: job.input.dateKey,
          fingerprint: job.fingerprint,
          resume: job.resume,
          signal,
          onProgress: (sent) => {
            if (!signal.aborted) patch(id, { sent });
          },
        });
        if (result.ok) {
          // A finished file is never retried, so let go of its bytes now.
          jobs.delete(id);
          patch(id, {
            status: result.duplicate ? 'duplicate' : 'done',
            sent: job.input.file.size,
            path: result.path,
            lane: result.lane,
            message: result.duplicate ? 'Already in this gym’s Advantage Cloud.' : '',
          });
          return;
        }
        if (result.canceled || signal.aborted) {
          patch(id, { status: 'canceled', message: '' });
          return;
        }
        if (!result.retryable || attempt >= fileAttempts) {
          patch(id, { status: 'failed', message: result.message });
          return;
        }
        patch(id, { status: 'retrying', message: result.message });
        await sleep(backoffDelay(attempt, options.baseDelayMs, undefined, options.random), signal);
      }
    } catch (error) {
      if (isCanceled(error, signal) || signal.aborted) {
        if (job.resume.uploadId && options.abort) await options.abort(job.resume).catch(() => undefined);
        job.resume = {};
        patch(id, { status: 'canceled', message: '' });
      }
      else patch(id, { status: 'failed', message: error instanceof Error ? error.message : 'That upload stopped.' });
    } finally {
      job.controller = null;
    }
  };

  const pump = () => {
    while (running < concurrency) {
      const next = items.find((item) => item.status === 'queued');
      if (!next) break;
      running += 1;
      // Claim it before the async work so the loop does not start it twice.
      items = items.map((item) => (item.id === next.id ? { ...item, status: 'checking' as const } : item));
      void run(next.id).finally(() => {
        running -= 1;
        pump();
        emit();
      });
    }
    emit();
  };

  return {
    add(inputs: readonly CloudQueueInput[]): string[] {
      const ids: string[] = [];
      for (const input of inputs) {
        const id = `u${nextId}`;
        nextId += 1;
        jobs.set(id, { input, resume: {}, controller: null });
        items = [
          ...items,
          {
            id,
            name: input.name,
            size: input.file.size,
            purpose: input.purpose,
            dateKey: input.dateKey,
            status: 'queued',
            sent: 0,
            attempts: 0,
            message: '',
          },
        ];
        ids.push(id);
      }
      pump();
      return ids;
    },
    cancel(id: string) {
      const item = get(id);
      if (!item || queueItemFinished(item)) return;
      const job = jobs.get(id);
      if (job?.controller) job.controller.abort();
      else patch(id, { status: 'canceled' });
    },
    cancelAll() {
      for (const item of items) if (!queueItemFinished(item)) this.cancel(item.id);
    },
    /** Manual retry. A multipart upload resumes from its last good part. */
    retry(id: string) {
      const item = get(id);
      if (!item || (item.status !== 'failed' && item.status !== 'canceled')) return;
      const job = jobs.get(id);
      if (job && item.status === 'canceled') job.resume = {};
      patch(id, { status: 'queued', message: '', sent: item.status === 'canceled' ? 0 : item.sent });
      pump();
    },
    retryFailed() {
      for (const item of items) if (item.status === 'failed') this.retry(item.id);
    },
    /** Drops finished rows and their file references. */
    clearFinished() {
      const keep = items.filter((item) => !queueItemFinished(item));
      for (const item of items) {
        if (!queueItemFinished(item)) continue;
        jobs.delete(item.id);
        prints.delete(item.id);
      }
      items = keep;
      emit();
    },
    snapshot(): readonly CloudQueueItem[] {
      return items;
    },
    /** Rows not finished yet. Imports use this to wait before reading more files into memory. */
    pendingCount(): number {
      return items.filter((item) => !queueItemFinished(item)).length;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Resolves when nothing is queued or running. */
    whenIdle(): Promise<void> {
      if (running === 0 && !items.some((item) => item.status === 'queued')) return Promise.resolve();
      return new Promise((resolve) => idleWaiters.push(resolve));
    },
    /** Resolves when fewer than `limit` rows are unfinished. */
    async whenBelow(limit: number): Promise<void> {
      while (this.pendingCount() >= limit) {
        await new Promise<void>((resolve) => {
          const off = this.subscribe(() => {
            if (this.pendingCount() < limit) {
              off();
              resolve();
            }
          });
        });
      }
    },
  };
}
