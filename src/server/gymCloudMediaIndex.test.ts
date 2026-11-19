/**
 * Networked Media Console folders on the server: the per-license details index
 * (groups/{license}/media-index/{folder}.json). Owner edits go live; seats edit
 * only while the owner's approval switch is off. A device's one-time send
 * through the real handler is idempotent.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { uploadToCloudFolder } from '../lib/advantageCloudFolders.ts';
import { cloudIndexKey } from '../lib/cloudMediaIndex.ts';
import {
  patchCloudMediaIndex,
  planDeviceMigration,
  readCloudMediaIndex,
  runDeviceMigration,
  type MigrationUpload,
} from '../lib/cloudMediaFolders.ts';
import { listCloudFolder } from '../lib/advantageCloudFolders.ts';
import type { StoredPhoto } from '../lib/photoStore.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { MEDIA_INDEX_EDIT_REFUSED, handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket } from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-19T21:30:00.000Z');
const LIC = 'owner-test';
const BASE = `groups/${LIC}/`;

function memoryBucket() {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const bucket = {
    objects,
    async head(name: string) {
      const row = objects.get(name);
      return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
    },
    async get(name: string) {
      const row = objects.get(name);
      return row ? { body: streamFrom(row.bytes), size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
    },
    async put(name: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(name, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
    },
    async delete(names: string | string[]) {
      for (const name of Array.isArray(names) ? names : [names]) objects.delete(name);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix ?? '';
      const keys = [...objects.keys()].filter((item) => item.startsWith(prefix)).sort();
      return {
        objects: keys.map((item) => ({ key: item, size: objects.get(item)!.bytes.byteLength, httpMetadata: { contentType: objects.get(item)!.type } })),
        truncated: false,
      };
    },
    async createMultipartUpload() {
      throw new Error('unused');
    },
    resumeMultipartUpload(name: string, uploadId: string) {
      return { key: name, uploadId, uploadPart: async () => ({ partNumber: 1, etag: 'e' }), complete: async () => undefined, abort: async () => undefined };
    },
  };
  return bucket as unknown as GymMediaBucket & { objects: typeof objects };
}

/** Just enough D1 for the owner's approval switch; every other query reads as empty. Seats on owner-test stay active. */
function approvalDb() {
  let required: number | null = null;
  const db = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const prepared = {
        bind(...values: unknown[]) {
          args = values;
          return prepared;
        },
        async first<T>() {
          if (sql.includes('gallery_approval') && required !== null) return { required } as T;
          return null as T | null;
        },
        async all<T>() {
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO gallery_approval')) required = Number(args[1]);
          return { meta: { changes: 1 } };
        },
      };
      return prepared;
    },
    async exec() {
      return undefined;
    },
  };
  return db as unknown as NonNullable<GymCloudEnv['ENTITLEMENTS_DB']>;
}

async function setup() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const secret = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const bucket = memoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: approvalDb() };
  const fetcher: typeof fetch = async (input, init) =>
    handleGymCloud(new Request(new URL(String(input), 'https://advantagebjjtimer.com'), init), env, () => now);
  const owner = await issueToken(secret, { licenseId: LIC, grants: ['pro'], tier: 'pro', src: 'code', deviceId: 'owner', now, kind: 'code' });
  const seat = async (preset: string) =>
    issueToken(secret, { licenseId: LIC, grants: ['pro'], tier: 'seat', src: 'seat', deviceId: preset, now, kind: 'seat', gym: LIC, sid: `seat-${preset}`, preset });
  const tokens = {
    owner: owner!,
    coach: (await seat('coach'))!,
    instructors: (await seat('instructors'))!,
    assistant: (await seat('assistant-coach'))!,
    director: (await seat('program-director'))!,
  };
  const put = (name: string, type: string, body = 'x') => bucket.objects.set(`${BASE}${name}`, { bytes: new TextEncoder().encode(body), type });
  return { bucket, env, fetcher, tokens, put };
}

function call(fetcher: typeof fetch, token: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  return fetcher(path, { ...init, headers });
}

async function setSwitch(fetcher: typeof fetch, owner: string, required: boolean) {
  const res = await call(fetcher, owner, '/api/gym/cloud', { method: 'POST', body: JSON.stringify({ action: 'gallery-approval', required }) });
  assert.equal(res.status, 200);
}


test('owner reads an empty index, saves details, and every device reads them back', async () => {
  const { fetcher, tokens, bucket } = await setup();
  const empty = await readCloudMediaIndex({ folder: 'pro-shop', token: tokens.owner, fetcher });
  assert.ok(empty && !('error' in empty));
  assert.equal(empty.canEdit, true);
  assert.deepEqual(empty.index.items, {});
  const saved = await patchCloudMediaIndex({
    folder: 'pro-shop',
    token: tokens.owner,
    fetcher,
    patch: { items: { 'pro-shop/gi.jpg': { label: 'Advantage gi $140', buyUrl: 'https://buy.example/gi' } } },
  });
  assert.ok(saved.ok);
  assert.ok(bucket.objects.has(cloudIndexKey(LIC, 'pro-shop')!));
  const fromCoach = await readCloudMediaIndex({ folder: 'pro-shop', token: tokens.coach, fetcher });
  assert.ok(fromCoach && !('error' in fromCoach));
  assert.equal(fromCoach.index.items['pro-shop/gi.jpg'].label, 'Advantage gi $140');
  const bad = await call(fetcher, tokens.owner, '/api/gym/cloud?op=media-index&folder=schedule');
  assert.equal(bad.status, 400);
});

test('approval ON: a seat reads but cannot change details or events; approval OFF: it can', async () => {
  const { fetcher, tokens } = await setup();
  await setSwitch(fetcher, tokens.owner, true);
  const read = await readCloudMediaIndex({ folder: 'events', token: tokens.coach, fetcher });
  assert.ok(read && !('error' in read));
  assert.equal(read.canEdit, false);
  const refused = await patchCloudMediaIndex({ folder: 'events', token: tokens.coach, fetcher, patch: { events: { upsert: [{ id: 'ev1', title: 'Open mat' }] } } });
  assert.deepEqual(refused, { ok: false, message: MEDIA_INDEX_EDIT_REFUSED });
  await setSwitch(fetcher, tokens.owner, false);
  const allowed = await patchCloudMediaIndex({ folder: 'events', token: tokens.coach, fetcher, patch: { events: { upsert: [{ id: 'ev1', title: 'Open mat' }] } } });
  assert.ok(allowed.ok);
  assert.equal(allowed.index.events[0].title, 'Open mat');
});

test('the index file never shows up as a file in the Cloud folders', async () => {
  const { fetcher, tokens, put } = await setup();
  put('events/flyer.png', 'image/png');
  await patchCloudMediaIndex({ folder: 'events', token: tokens.owner, fetcher, patch: { items: { 'events/flyer.png': { label: 'Flyer' } } } });
  const listed = await listCloudFolder({ folder: 'events', token: tokens.owner, fetcher });
  assert.ok(listed && !('error' in listed));
  assert.deepEqual(listed.items.map((item) => item.path), ['events/flyer.png']);
});

function shopRow(id: string, label: string, buyUrl: string): StoredPhoto {
  return {
    id, label, sortOrder: 0, addedAt: 1, folderId: 'shop', playEnabled: true, mime: 'image/jpeg',
    blob: new Blob([`card-${id}`]), buyUrl, startsSlide: true, qrLinks: [], driveFileId: null,
    caption: '', schedule: 'always', showDate: '', techniqueClipId: '', loopSec: 0,
  };
}

test('one-time send through the real Cloud: Pro Shop cards arrive with details, and a second run uploads nothing', async () => {
  const { fetcher, tokens, bucket } = await setup();
  const rows = [shopRow('dev-1111-aaaa', 'Advantage gi $140', 'https://buy.example/gi'), shopRow('dev-2222-bbbb', 'Rash guard $45', 'https://buy.example/rash')];
  let uploads = 0;
  const upload: MigrationUpload = async ({ folder, file, dateKey }) => {
    uploads += 1;
    return uploadToCloudFolder({ folder: folder === 'gallery' ? 'gallery' : folder, file, dateKey, token: tokens.owner, fetcher });
  };
  const patch = (change: Parameters<typeof patchCloudMediaIndex>[0]['patch']) => patchCloudMediaIndex({ folder: 'pro-shop', patch: change, token: tokens.owner, fetcher });
  const snapshot = async () => {
    const listing = await listCloudFolder({ folder: 'pro-shop', token: tokens.owner, fetcher });
    const index = await readCloudMediaIndex({ folder: 'pro-shop', token: tokens.owner, fetcher });
    assert.ok(listing && !('error' in listing) && index && !('error' in index));
    return { listed: new Set(listing.items.map((item) => item.path)), index: index.index };
  };
  const first = await snapshot();
  const plan = planDeviceMigration({ rows, folderId: 'shop', index: first.index, listedPaths: first.listed, dateKey: '2026-11-19' });
  const summary = await runDeviceMigration({ plan, folderId: 'shop', dateKey: '2026-11-19', upload, patch });
  assert.equal(summary.sent, 2);
  const after = await snapshot();
  assert.equal(after.listed.size, 2);
  const labels = Object.values(after.index.items).map((row) => `${row.label} ${row.buyUrl}`).sort();
  assert.deepEqual(labels, ['Advantage gi $140 https://buy.example/gi', 'Rash guard $45 https://buy.example/rash']);
  const again = planDeviceMigration({ rows, folderId: 'shop', index: after.index, listedPaths: after.listed, dateKey: '2026-11-19' });
  await runDeviceMigration({ plan: again, folderId: 'shop', dateKey: '2026-11-19', upload, patch });
  assert.equal(uploads, 2);
  assert.equal([...bucket.objects.keys()].filter((key) => key.startsWith(`${BASE}pro-shop/`)).length, 2);
});
