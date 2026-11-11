import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  CLASS_PHOTO_CLOUD_STAY,
  CLASS_PHOTO_CLOUD_UPLOADED,
  CLASS_PHOTO_PROMOTIONS_SAVED_PHONE,
  CLASS_PHOTO_PROMOTIONS_STAY,
  classPhotoResultNote,
  classPhotoStayCopy,
} from './classPhotoPromotions.ts';
import { publishGymFile } from './gymPublish.ts';
import { galleryUploadLane } from './advantageCloudMedia.ts';
import { type PrivateJwk } from './entitlementToken.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from '../server/gymCloud.ts';
import { issueToken } from '../server/tokenIssue.ts';

const now = new Date('2026-11-10T18:00:00.000Z');

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  uploads = new Map<string, { key: string; parts: Map<number, Uint8Array>; type: string }>();
  seq = 1;

  async head(key: string) {
    const row = this.objects.get(key);
    if (!row) return null;
    return { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
  }

  async get(key: string) {
    const row = this.objects.get(key);
    if (!row) return null;
    return { body: streamFrom(row.bytes), size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
  }

  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? '';
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = options?.cursor ? Math.max(0, keys.indexOf(options.cursor) + 1) : 0;
    const limit = options?.limit ?? keys.length;
    const slice = keys.slice(start, start + limit);
    return {
      objects: slice.map((key) => {
        const row = this.objects.get(key)!;
        return { key, size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
      }),
      truncated: start + limit < keys.length,
      cursor: start + limit < keys.length ? slice[slice.length - 1] : undefined,
    };
  }

  async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2MultipartUpload> {
    const uploadId = `up-${this.seq}`;
    this.seq += 1;
    this.uploads.set(uploadId, { key, parts: new Map(), type: options?.httpMetadata?.contentType || 'application/octet-stream' });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    const row = this.uploads.get(uploadId);
    if (!row || row.key !== key) throw new Error('missing upload');
    return {
      key,
      uploadId,
      uploadPart: async (partNumber, value) => {
        const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
        row.parts.set(partNumber, bytes);
        return { partNumber, etag: `etag-${partNumber}` };
      },
      complete: async () => undefined,
      abort: async () => {
        this.uploads.delete(uploadId);
      },
    };
  }
}

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

function cloudFetcher(env: GymCloudEnv): typeof fetch {
  return async (input, init) => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return handleGymCloud(new Request(raw, init), env, () => now);
  };
}

test('the photo copy switches to Advantage Cloud only when Cloud is on', () => {
  assert.match(CLASS_PHOTO_PROMOTIONS_STAY, /Advantage does not host them/);
  assert.match(CLASS_PHOTO_PROMOTIONS_SAVED_PHONE, /Saved on this phone/);
  assert.equal(classPhotoStayCopy(false), CLASS_PHOTO_PROMOTIONS_STAY);
  assert.match(classPhotoStayCopy(true), /Uploaded to Advantage Cloud/);
  assert.match(CLASS_PHOTO_CLOUD_STAY, /Approved/);
  assert.match(CLASS_PHOTO_CLOUD_STAY, /Pending/);
  assert.equal(
    classPhotoResultNote({ cloud: true, lane: 'approved', failed: false, needsDrive: false }),
    `${CLASS_PHOTO_CLOUD_UPLOADED} Approved.`,
  );
  assert.equal(
    classPhotoResultNote({ cloud: true, lane: 'pending', failed: false, needsDrive: false }),
    `${CLASS_PHOTO_CLOUD_UPLOADED} Pending.`,
  );
  assert.equal(
    classPhotoResultNote({ cloud: false, lane: null, failed: false, needsDrive: true }),
    CLASS_PHOTO_PROMOTIONS_SAVED_PHONE,
  );
  const ui = readFileSync(new URL('../components/ClassPhotoPromotions.tsx', import.meta.url), 'utf8');
  assert.match(ui, /classPhotoStayCopy\(cloudOn, approvalRequired\)/);
  assert.match(ui, /classPhotoResultNote/);
  const notice = readFileSync(new URL('../components/GalleryPendingNotice.tsx', import.meta.url), 'utf8');
  assert.match(notice, /cloudGalleryPendingCount/);
  assert.match(notice, /data-gallery-pending-badge/);
  const review = readFileSync(new URL('../components/GalleryReviewQueue.tsx', import.meta.url), 'utf8');
  assert.match(review, /gallery-approve/);
  assert.match(review, /gallery-reject/);
  const pro = readFileSync(new URL('../pages/Pro.tsx', import.meta.url), 'utf8');
  const plus = readFileSync(new URL('../pages/ProPlusCloud.tsx', import.meta.url), 'utf8');
  assert.match(pro, /GalleryPendingBadge/);
  assert.match(plus, /GalleryPendingBadge/);
});

test('an owner with Cloud on puts a daily photo in gallery/approved and does not approve it', async () => {
  assert.equal(galleryUploadLane({ kind: 'owner' }), 'approved');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'coach' }), 'pending');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'instructors' }), 'pending');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'assistant-coach' }), null);
  assert.equal(galleryUploadLane({ kind: 'owner', approvalRequired: false }), 'approved');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'coach', approvalRequired: true }), 'pending');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'coach', approvalRequired: false }), 'approved');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'instructors', approvalRequired: false }), 'approved');
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'assistant-coach', approvalRequired: false }), null);
  assert.equal(galleryUploadLane({ kind: 'seat', preset: 'program-director', approvalRequired: false }), null);
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const owner = await issueToken(secret, {
    licenseId: 'lic-owner',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  assert.ok(owner);
  const published = await publishGymFile({
    purpose: 'gallery',
    role: 'owner',
    kind: 'photo',
    dateKey: '2026-11-10',
    fileName: 'class photo.jpg',
    bytes: new Blob([Uint8Array.from([1, 2, 3, 4])], { type: 'image/jpeg' }),
    mime: 'image/jpeg',
    approvalRequired: true,
    cloudToken: owner,
    cloudFetcher: cloudFetcher(env),
  });
  assert.equal(published.home, 'advantage-cloud');
  assert.equal(published.failed, false);
  assert.equal(published.route.ok && published.route.lane, 'approved');
  assert.equal(published.route.ok && published.route.path, 'gallery/approved/2026-11-10/class-photo.jpg');
  assert.equal(bucket.objects.has('groups/lic-owner/gallery/approved/2026-11-10/class-photo.jpg'), true);
  assert.equal([...bucket.objects.keys()].some((key) => key.includes('/gallery/pending/')), false);
  assert.equal(
    classPhotoResultNote({ cloud: true, lane: 'approved', failed: false, needsDrive: false }),
    'Uploaded to Advantage Cloud. Approved.',
  );
});

test('without Cloud the same photo stays on the phone path', async () => {
  const published = await publishGymFile({
    purpose: 'gallery',
    role: 'owner',
    kind: 'photo',
    dateKey: '2026-11-10',
    fileName: 'class photo.jpg',
    bytes: new Blob([Uint8Array.from([1])], { type: 'image/jpeg' }),
    mime: 'image/jpeg',
    approvalRequired: true,
    cloudToken: '',
  });
  assert.equal(published.home, 'phone');
  assert.equal(published.route.ok && published.route.path, 'gallery/pending/2026-11-10/class-photo.jpg');
});
