/**
 * Retry rules for Advantage Cloud uploads.
 * A dropped connection or a Cloudflare 5xx (the 504s seen at the Atlanta edge)
 * is retried with backoff. A clear refusal (full, too large, wrong type, no
 * access) is not: sending the same bytes again would get the same answer.
 */

export type RetryOptions = {
  /** Total tries per request, including the first. 1 means no retry. */
  attempts?: number;
  /** First wait in ms. Doubles each retry. */
  baseDelayMs?: number;
  /** Longest single wait in ms. */
  maxDelayMs?: number;
  /** Tests pass a fake clock. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Tests pass a fixed value. 0..1. */
  random?: () => number;
};

export const CLOUD_RETRY_ATTEMPTS = 4;
export const CLOUD_RETRY_BASE_MS = 1000;
export const CLOUD_RETRY_MAX_MS = 15_000;

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export function retryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

/** Exponential backoff with ±25% jitter so two parallel files do not retry in lockstep. */
export function backoffDelay(
  attempt: number,
  base = CLOUD_RETRY_BASE_MS,
  max = CLOUD_RETRY_MAX_MS,
  random: () => number = Math.random,
): number {
  const raw = Math.min(max, base * 2 ** Math.max(0, attempt - 1));
  const jitter = 0.75 + random() * 0.5;
  return Math.max(0, Math.round(Math.min(max, raw * jitter)));
}

export class UploadCanceledError extends Error {
  constructor() {
    super('Canceled.');
    this.name = 'UploadCanceledError';
  }
}

export function isCanceled(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (error instanceof UploadCanceledError) return true;
  return error instanceof Error && error.name === 'AbortError';
}

export function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadCanceledError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadCanceledError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * One request with retry. Resolves with the last response (which may be a
 * non-retryable error, or a retryable one after the last try). Throws only for
 * a cancel, or a network error on the last try.
 */
export async function fetchWithRetry(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
  options: RetryOptions & { signal?: AbortSignal; onRetry?: (attempt: number, delayMs: number) => void } = {},
): Promise<Response> {
  const attempts = Math.max(1, Math.floor(options.attempts ?? 1));
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (options.signal?.aborted) throw new UploadCanceledError();
    try {
      const response = await fetcher(url, options.signal ? { ...init, signal: options.signal } : init);
      if (!retryableStatus(response.status) || attempt === attempts) return response;
      lastError = null;
    } catch (error) {
      if (isCanceled(error, options.signal)) throw new UploadCanceledError();
      lastError = error;
      if (attempt === attempts) throw error;
    }
    const delay = backoffDelay(attempt, options.baseDelayMs, options.maxDelayMs, options.random);
    options.onRetry?.(attempt, delay);
    await sleep(delay, options.signal);
  }
  throw lastError ?? new Error('Advantage Cloud could not be reached.');
}
