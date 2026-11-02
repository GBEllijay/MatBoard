/**
 * Gallery bytes for Plus Cloud. The browser never receives a public bucket URL.
 * With no GYM_MEDIA binding this returns unbound so the slideshow can use
 * Drive, OneDrive, or the phone. Sign-in is required before any file bytes.
 */

type R2Object = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
};

type R2Bucket = {
  get(key: string): Promise<R2Object | null>;
};

type Env = { GYM_MEDIA?: R2Bucket };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const bucket = context.env.GYM_MEDIA;
  const url = new URL(context.request.url);
  if (!bucket) return json(503, { ok: false, reason: 'unbound' });
  if (url.searchParams.get('probe') === '1') return json(200, { ok: true, bound: true });

  const auth = context.request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.trim().length < 16) {
    return new Response('Sign in required.', { status: 401, headers: { 'cache-control': 'no-store' } });
  }
  const license = url.searchParams.get('license') ?? '';
  const path = url.searchParams.get('path') ?? '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(license)) return json(400, { ok: false, error: 'Missing license.' });
  if (!path.startsWith('gallery/approved/') || path.includes('..')) {
    return json(404, { ok: false, error: 'That file is not in the approved gallery.' });
  }
  const object = await bucket.get(`groups/${license}/${path}`);
  if (!object) return json(404, { ok: false, error: 'Not found.' });
  return new Response(object.body, {
    status: 200,
    headers: {
      'content-type': object.httpMetadata?.contentType || 'application/octet-stream',
      // The browser still sends Authorization. Cloudflare may cache the image
      // on advantagebjjtimer.com so the CSAM Scanning Tool can see it.
      'cache-control': 'private, no-store',
      'cloudflare-cdn-cache-control': 'public, max-age=86400',
      vary: 'authorization',
    },
  });
}
