/**
 * GET /paid/* — spike result and the Phase 4 gate.
 *
 * Cloudflare Pages (docs checked 2026-10-29): a path in `_routes.json` `include`
 * invokes a Function before static serving. `functions/paid/[[path]].ts` matches
 * `/paid` and `/paid/*`. `env.ASSETS.fetch` reads the built file without skipping
 * this check. This handler returns those bytes only after the ES256 token
 * verifies and the token's grant covers that file. A missing or rejected token
 * never calls ASSETS for the chunk.
 */

import { verifyToken, type PublicJwk } from '../lib/entitlementToken.ts';
import {
  isPaidChunkId,
  PAID_CHUNK_COOKIE,
  paidChunkGrant,
  paidTokenFresh,
  type PaidChunkId,
} from '../lib/paidChunkAccess.ts';
import { signingMaterial } from './tokenIssue.ts';

export type PaidAssets = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type PaidChunkEnv = {
  ENTITLEMENT_SIGNING_KEY?: string;
  ENTITLEMENT_KEY_ID?: string;
};

export type PaidManifest = {
  files: Record<string, PaidChunkId[]>;
};

function text(status: number, message: string, extra: HeadersInit = {}): Response {
  return new Response(message, {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra,
    },
  });
}

/** Basename under /paid, or null when the path is not a single script or stylesheet. */
export function paidAssetName(pathname: string): string | null {
  if (!pathname.startsWith('/paid/')) return null;
  const rest = pathname.slice('/paid/'.length);
  if (!rest || rest.includes('/') || rest.includes('\\') || rest.includes('..')) return null;
  if (!/^[A-Za-z0-9._-]+\.(?:js|css)$/.test(rest)) return null;
  return rest;
}

export function readPaidRequestToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const bearer = /^Bearer\s+(\S+)$/.exec(header.trim());
  if (bearer?.[1]) return bearer[1];
  const cookie = request.headers.get('cookie') ?? '';
  for (const part of cookie.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    if (part.slice(0, eq).trim() !== PAID_CHUNK_COOKIE) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return '';
}

export function parsePaidManifest(raw: unknown): PaidManifest | null {
  if (!raw || typeof raw !== 'object') return null;
  const files = (raw as { files?: unknown }).files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) return null;
  const parsed: Record<string, PaidChunkId[]> = {};
  for (const [name, ids] of Object.entries(files)) {
    if (!/^[A-Za-z0-9._-]+\.(?:js|css)$/.test(name)) return null;
    if (!Array.isArray(ids) || ids.length === 0) return null;
    const chunks: PaidChunkId[] = [];
    for (const id of ids) {
      if (typeof id !== 'string' || !isPaidChunkId(id)) return null;
      chunks.push(id);
    }
    parsed[name] = chunks;
  }
  return { files: parsed };
}

async function loadManifest(assets: PaidAssets, origin: string): Promise<PaidManifest | null> {
  let response: Response;
  try {
    response = await assets.fetch(new Request(`${origin}/paid/manifest.json`));
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return parsePaidManifest(await response.json());
  } catch {
    return null;
  }
}

function contentType(file: string): string {
  return file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
}

export async function handlePaidChunk(
  request: Request,
  env: PaidChunkEnv,
  assets: PaidAssets,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return text(405, 'Method not allowed.', { allow: 'GET, HEAD' });
  }
  const url = new URL(request.url);
  const file = paidAssetName(url.pathname);
  if (!file) return text(404, 'Not found.');

  const material = signingMaterial(env.ENTITLEMENT_SIGNING_KEY, env.ENTITLEMENT_KEY_ID);
  if (!material) return text(503, 'Entitlement signing is not set up yet. Set ENTITLEMENT_SIGNING_KEY.');

  const manifest = await loadManifest(assets, url.origin);
  if (!manifest) return text(503, 'Paid screen manifest is missing.');
  const chunks = manifest.files[file];
  if (!chunks?.length) return text(404, 'Not found.');

  const token = readPaidRequestToken(request);
  if (!token) return text(401, 'Access token required.');
  const keys: { kid: string; jwk: PublicJwk }[] = [{ kid: material.kid, jwk: material.publicJwk }];
  const claims = await verifyToken(token, keys);
  const nowMs = now().getTime();
  if (!claims || !paidTokenFresh(claims, nowMs)) return text(401, 'Access token was not accepted.');
  const allowed = chunks.some((chunk) => paidChunkGrant(claims, chunk, nowMs));
  if (!allowed) return text(403, 'This access does not include that screen.');

  const assetUrl = new URL(`/paid/${file}`, url.origin);
  const asset = await assets.fetch(new Request(assetUrl, { method: request.method }));
  if (!asset.ok) return text(404, 'Not found.');
  const headers = new Headers();
  headers.set('content-type', contentType(file));
  headers.set('cache-control', 'private, no-store');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('vary', 'Authorization, Cookie');
  const length = asset.headers.get('content-length');
  if (length) headers.set('content-length', length);
  if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
  return new Response(asset.body, { status: 200, headers });
}
