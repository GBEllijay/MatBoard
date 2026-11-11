/**
 * Gallery bytes for Plus Cloud. The browser never receives a public bucket URL.
 * With no GYM_MEDIA binding this returns unbound so the slideshow can use
 * Drive, OneDrive, or the phone. Sign-in is required before any file bytes:
 * the Bearer pass must be a valid signed pass (same check as /api/gym/cloud)
 * and its license must be the license being read.
 */

import { readGymCloudActor, type GymCloudEnv } from '../../../src/server/gymCloud.ts';

type R2Object = {
  body: ReadableStream;
  httpMetadata?: { contentType?: string };
};

type R2Bucket = {
  get(key: string): Promise<R2Object | null>;
};

type Env = Omit<GymCloudEnv, 'GYM_MEDIA'> & { GYM_MEDIA?: R2Bucket };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function signInRequired(): Response {
  return new Response('Sign in required.', { status: 401, headers: { 'cache-control': 'no-store' } });
}

export async function handleGymMedia(request: Request, env: Env, now: () => Date = () => new Date()): Promise<Response> {
  const bucket = env.GYM_MEDIA;
  const url = new URL(request.url);
  if (!bucket) return json(503, { ok: false, reason: 'unbound' });
  if (url.searchParams.get('probe') === '1') return json(200, { ok: true, bound: true });

  const auth = request.headers.get('authorization') ?? '';
  if (!auth.startsWith('Bearer ') || auth.trim().length < 16) return signInRequired();
  // Verify the signed pass, its expiry, and (for seats) that the seat is still active.
  const actor = await readGymCloudActor(request, env as GymCloudEnv, now());
  if (actor instanceof Response) return actor.status === 401 ? signInRequired() : actor;

  const license = url.searchParams.get('license') ?? '';
  const path = url.searchParams.get('path') ?? '';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(license)) return json(400, { ok: false, error: 'Missing license.' });
  // A valid pass for one academy never opens another academy's gallery.
  if (actor.licenseId !== license) return json(403, { ok: false, error: 'This sign-in is for a different academy.' });
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

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  return handleGymMedia(context.request, context.env);
}
