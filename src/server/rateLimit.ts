import { keyedHash } from './codeCrypto.ts';
import { RATE_LIMIT_ERROR } from './paywallDecisions.ts';

export const REDEEM_LIMIT = 20;
export const OWNER_TEST_LIMIT = 8;
export const ENTITLEMENT_LIMIT = 30;
export const CONFIRM_LIMIT = 20;
export const RATE_WINDOW_MS = 10 * 60 * 1000;

type Bucket = {
  windowStart: number;
  count: number;
};

const memory = new Map<string, Bucket>();

export function resetRateLimitsForTests(): void {
  memory.clear();
}

export function clientIp(request: Request): string {
  const cf = request.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  return 'local';
}

export async function rateBucket(scope: string, ip: string, pepper: string): Promise<string> {
  const blind = await keyedHash(ip || 'local', pepper || 'rate-only', 'ip');
  return `${scope}:${blind}`;
}

/**
 * In-isolate counter, plus a KV key when a store is bound. KV writes can race,
 * so the cap is best-effort across isolates. A Cloudflare WAF rule on /api/*
 * is the stronger edge limit and is an owner dashboard step, not this build.
 */
export async function allowAttempt(
  bucket: string,
  limit: number,
  now = Date.now(),
  kv?: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<unknown> } | null,
): Promise<boolean> {
  const windowStart = Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
  const local = memory.get(bucket);
  const localCount = local && local.windowStart === windowStart ? local.count : 0;
  if (localCount >= limit) return false;
  memory.set(bucket, { windowStart, count: localCount + 1 });
  if (!kv) return true;
  const key = `rate:${bucket}:${windowStart}`;
  try {
    const stored = Number((await kv.get(key)) ?? 0);
    if (stored >= limit) return false;
    await kv.put(key, String(stored + 1));
  } catch {
    /* The in-isolate counter still applies. */
  }
  return true;
}

export function rateLimitedResponse(): Response {
  return new Response(JSON.stringify({ ok: false, error: RATE_LIMIT_ERROR }), {
    status: 429,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '600',
    },
  });
}
