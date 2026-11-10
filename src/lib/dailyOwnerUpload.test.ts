import assert from 'node:assert/strict';
import test from 'node:test';
import { type PrivateJwk } from './entitlementToken.ts';
import {
  CLOUD_PHOTO_CLOUD_NOTE,
  CLOUD_PHOTO_DRIVE_NOTE,
  CLOUD_PHOTO_PHONE_NOTE,
  isDailyPhoto,
  isDailyVideo,
  uploadDailyMediaFile,
} from './dailyOwnerUpload.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket } from '../server/gymCloud.ts';
import { issueToken } from '../server/tokenIssue.ts';

test('a photo uses the gallery publish path and does not claim Advantage Cloud stored it', async () => {
  assert.equal(isDailyPhoto(new File(['x'], 'class.jpg', { type: 'image/jpeg' })), true);
  assert.equal(isDailyVideo(new File(['x'], 'class.jpg', { type: 'image/jpeg' })), false);
  assert.equal(isDailyVideo(new File(['x'], 'class.mp4', { type: 'video/mp4' })), true);
  const photo = await uploadDailyMediaFile(new File(['pixels'], 'class.jpg', { type: 'image/jpeg' }), '2026-11-10');
  assert.equal(photo.cloud, false);
  assert.equal(photo.message, CLOUD_PHOTO_PHONE_NOTE);
  assert.match(photo.message, /did not store this photo/);
  assert.doesNotMatch(photo.message, /Uploaded to Advantage Cloud/);
  assert.notEqual(photo.message, CLOUD_PHOTO_DRIVE_NOTE);
});

test('a Cloud owner photo is approved and a coach photo waits in pending', async () => {
  const now = new Date('2026-11-10T18:00:00.000Z');
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const secret = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const bucket: GymMediaBucket = {
    objects,
    async head(name) {
      const row = objects.get(name);
      return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
    },
    async get(name) {
      const row = objects.get(name);
      return row ? { body: streamFrom(row.bytes), size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
    },
    async put(name, value, options) {
      const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
      objects.set(name, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
    },
    async delete(name) {
      objects.delete(name);
    },
    async list(options) {
      const prefix = options?.prefix ?? '';
      const keys = [...objects.keys()].filter((item) => item.startsWith(prefix)).sort();
      return { objects: keys.map((item) => ({ key: item, size: objects.get(item)!.bytes.byteLength, httpMetadata: { contentType: objects.get(item)!.type } })), truncated: false };
    },
    async createMultipartUpload() {
      throw new Error('unused');
    },
    resumeMultipartUpload(name, uploadId) {
      return { key: name, uploadId, uploadPart: async () => ({ partNumber: 1, etag: 'e' }), complete: async () => undefined, abort: async () => undefined };
    },
  } as GymMediaBucket;
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const fetcher: typeof fetch = async (input, init) => handleGymCloud(new Request(String(input), init), env, () => now);
  const owner = await issueToken(secret, {
    licenseId: 'lic-owner',
    grants: ['pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'owner',
    now,
    kind: 'code',
  });
  assert.ok(owner);
  const photo = await uploadDailyMediaFile(new File(['pixels'], 'class.jpg', { type: 'image/jpeg' }), '2026-11-10', {
    role: 'owner',
    token: owner,
    fetcher,
  });
  assert.equal(photo.ok, true);
  assert.equal(photo.cloud, true);
  assert.equal(photo.message, `${CLOUD_PHOTO_CLOUD_NOTE} Approved.`);
  assert.equal(objects.has('groups/lic-owner/gallery/approved/2026-11-10/class.jpg'), true);
  const coachToken = await issueToken(secret, {
    licenseId: 'owner-test',
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: 'coach',
    now,
    kind: 'seat',
    gym: 'owner-test',
    sid: 'seat-coach',
    preset: 'coach',
  });
  assert.ok(coachToken);
  const coach = await uploadDailyMediaFile(new File(['pixels'], 'staff.jpg', { type: 'image/jpeg' }), '2026-11-10', {
    role: 'coach',
    token: coachToken,
    fetcher,
  });
  assert.equal(coach.cloud, true);
  assert.equal(coach.message, `${CLOUD_PHOTO_CLOUD_NOTE} Pending.`);
  assert.equal(objects.has('groups/owner-test/gallery/pending/2026-11-10/staff.jpg'), true);
});

test('a file that is neither a photo nor a video is refused', async () => {
  const other = await uploadDailyMediaFile(new File(['{}'], 'notes.json', { type: 'application/json' }), '2026-11-10');
  assert.equal(other.ok, false);
  assert.equal(other.cloud, false);
  assert.match(other.message, /not a photo or a video/);
});
