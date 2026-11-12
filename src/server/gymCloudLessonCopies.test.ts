import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fetchCloudLessonPlan,
  resetMyCloudLessonPlan,
  saveCloudLessonTemplate,
  uploadAdvantageCloudFile,
} from '../lib/advantageCloudMedia.ts';
import { type PrivateJwk } from '../lib/entitlementToken.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-12T15:00:00.000Z');
const DAY = '2026-11-12';
const TEMPLATE_KEY = 'groups/owner-test/lessons/current/2026-W46/2026-11-12.json';
const seatKey = (seat: string) => `groups/owner-test/lessons/instructors/${seat}/2026-W46/2026-11-12.json`;

class MemoryBucket implements GymMediaBucket {
  objects = new Map<string, { bytes: Uint8Array; type: string }>();
  async head(key: string) {
    const row = this.objects.get(key);
    return row ? { size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
  }
  async get(key: string) {
    const row = this.objects.get(key);
    return row ? { body: streamFrom(row.bytes), size: row.bytes.byteLength, httpMetadata: { contentType: row.type } } : null;
  }
  async put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }) {
    const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
    this.objects.set(key, { bytes, type: options?.httpMetadata?.contentType || 'application/octet-stream' });
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
  async list(options?: { prefix?: string }) {
    const prefix = options?.prefix ?? '';
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    return {
      objects: keys.map((key) => ({ key, size: this.objects.get(key)!.bytes.byteLength, httpMetadata: { contentType: this.objects.get(key)!.type } })),
      truncated: false,
    };
  }
  async createMultipartUpload(): Promise<R2MultipartUpload> {
    throw new Error('lesson plans are small');
  }
  resumeMultipartUpload(): R2MultipartUpload {
    throw new Error('lesson plans are small');
  }
  text(key: string): string | null {
    const row = this.objects.get(key);
    return row ? new TextDecoder().decode(row.bytes) : null;
  }
}

async function setup() {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const secret = JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
  const bucket = new MemoryBucket();
  const env: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' };
  const seat = async (sid: string, preset: string) => {
    const issued = await issueToken(secret, {
      licenseId: 'owner-test',
      grants: ['pro'],
      tier: 'seat',
      src: 'seat',
      deviceId: `device-${sid}`,
      now,
      kind: 'seat',
      gym: 'owner-test',
      sid,
      preset,
    });
    assert.ok(issued);
    return issued;
  };
  const owner = await issueToken(secret, {
    licenseId: 'owner-test',
    grants: ['white', 'student', 'coach', 'pro'],
    tier: 'pro',
    src: 'code',
    deviceId: 'device-owner',
    now,
    kind: 'code',
  });
  assert.ok(owner);
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), 'https://advantagebjjtimer.com'), init);
    return handleGymCloud(request, env, () => now);
  }) as typeof fetch;
  const call = (path: string, init: RequestInit, bearer: string) => {
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${bearer}`);
    return handleGymCloud(new Request(new URL(path, 'https://advantagebjjtimer.com'), { ...init, headers }), env, () => now);
  };
  return {
    bucket,
    env,
    owner,
    fetcher,
    call,
    alice: await seat('seat-alice', 'instructors'),
    bruno: await seat('seat-bruno', 'instructors'),
    coach: await seat('seat-coach', 'coach'),
    assistant: await seat('seat-assist', 'assistant-coach'),
  };
}

const plan = (title: string) => JSON.stringify({ version: 1, id: 'plan-1', lessonTitle: title, techniques: [] });

function saveMine(ctx: Awaited<ReturnType<typeof setup>>, token: string, title: string) {
  return uploadAdvantageCloudFile({
    purpose: 'lesson',
    dateKey: DAY,
    file: new Blob([plan(title)], { type: 'application/json' }),
    fileName: `${DAY}.json`,
    mime: 'application/json',
    token,
    fetcher: ctx.fetcher,
  });
}

test('two instructors editing the same day each get their own copy, and the gym template is unchanged', async () => {
  const ctx = await setup();
  const template = await saveCloudLessonTemplate({ dateKey: DAY, json: plan('Template: armbar'), token: ctx.owner, fetcher: ctx.fetcher });
  assert.equal(template.ok, true);
  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('Template: armbar'));

  // Both seats open the day: no copy yet, so the template is what opens.
  const first = await fetchCloudLessonPlan({ dateKey: DAY, token: ctx.alice, fetcher: ctx.fetcher });
  assert.ok(first);
  assert.equal(first.mine.exists, false);
  assert.equal(first.template.exists, true);
  assert.equal((first.template.plan as { lessonTitle: string }).lessonTitle, 'Template: armbar');
  assert.equal(first.canEditTemplate, false);

  const a = await saveMine(ctx, ctx.alice, 'Alice: armbar + sweep');
  const b = await saveMine(ctx, ctx.bruno, 'Bruno: armbar drills');
  assert.ok(a.ok && b.ok);
  if (a.ok) assert.equal(a.path, 'lessons/instructors/seat-alice/2026-W46/2026-11-12.json');
  if (b.ok) assert.equal(b.path, 'lessons/instructors/seat-bruno/2026-W46/2026-11-12.json');
  // Later save from Alice does not touch Bruno's copy.
  assert.equal((await saveMine(ctx, ctx.alice, 'Alice v2')).ok, true);

  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('Template: armbar'), 'template never overwritten by edits');
  assert.equal(ctx.bucket.text(seatKey('seat-alice')), plan('Alice v2'));
  assert.equal(ctx.bucket.text(seatKey('seat-bruno')), plan('Bruno: armbar drills'));

  const aliceRead = await fetchCloudLessonPlan({ dateKey: DAY, token: ctx.alice, fetcher: ctx.fetcher });
  const brunoRead = await fetchCloudLessonPlan({ dateKey: DAY, token: ctx.bruno, fetcher: ctx.fetcher });
  assert.equal((aliceRead?.mine.plan as { lessonTitle: string }).lessonTitle, 'Alice v2');
  assert.equal((brunoRead?.mine.plan as { lessonTitle: string }).lessonTitle, 'Bruno: armbar drills');

  // The owner's own edits are a copy too.
  assert.equal((await saveMine(ctx, ctx.owner, 'Owner teaching')).ok, true);
  assert.equal(ctx.bucket.text(seatKey('owner')), plan('Owner teaching'));
  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('Template: armbar'));

});

test('only the owner or a Coach seat can update the template; a direct PUT to the template key is refused', async () => {
  const ctx = await setup();
  await saveCloudLessonTemplate({ dateKey: DAY, json: plan('Original'), token: ctx.owner, fetcher: ctx.fetcher });

  const refused = await saveCloudLessonTemplate({ dateKey: DAY, json: plan('Hijack'), token: ctx.alice, fetcher: ctx.fetcher });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.message, /Only the owner or a Coach seat/);
  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('Original'));

  // An older build could try to PUT straight to the template key.
  const put = await ctx.call(`/api/gym/cloud?op=put&key=${encodeURIComponent(TEMPLATE_KEY)}`, { method: 'PUT', body: plan('Stale'), headers: { 'content-type': 'application/json' } }, ctx.alice);
  assert.equal(put.status, 403);
  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('Original'));

  // A seat cannot write another seat's copy.
  const other = await ctx.call(`/api/gym/cloud?op=put&key=${encodeURIComponent(seatKey('seat-bruno'))}`, { method: 'PUT', body: plan('Not mine'), headers: { 'content-type': 'application/json' } }, ctx.alice);
  assert.equal(other.status, 403);
  assert.equal(ctx.bucket.objects.has(seatKey("seat-bruno")), false);

  // A start with no planTarget (older build) lands in the seat's own copy, never the template.
  const legacy = await ctx.call('/api/gym/cloud', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'start', purpose: 'lesson', dateKey: DAY, fileName: 'x.json', size: 4, mime: 'application/json' }),
  }, ctx.alice);
  assert.equal(legacy.status, 200);
  assert.equal(((await legacy.json()) as { path: string }).path, 'lessons/instructors/seat-alice/2026-W46/2026-11-12.json');

  // Coach seat may update the template.
  const coachRead = await fetchCloudLessonPlan({ dateKey: DAY, token: ctx.coach, fetcher: ctx.fetcher });
  assert.equal(coachRead?.canEditTemplate, true);
  assert.equal((await saveCloudLessonTemplate({ dateKey: DAY, json: plan('Coach update'), token: ctx.coach, fetcher: ctx.fetcher })).ok, true);
  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('Coach update'));

  // Assistant coaches read the template but cannot save lesson plans.
  assert.equal((await saveMine(ctx, ctx.assistant, 'nope')).ok, false);
  const assistantRead = await fetchCloudLessonPlan({ dateKey: DAY, token: ctx.assistant, fetcher: ctx.fetcher });
  assert.equal(assistantRead?.template.exists, true);
  assert.equal(assistantRead?.canEditTemplate, false);
});

test('reading copies: a seat reads only its own; the owner reads every copy; the lesson list tags each row', async () => {
  const ctx = await setup();
  await saveCloudLessonTemplate({ dateKey: DAY, json: plan('T'), token: ctx.owner, fetcher: ctx.fetcher });
  await saveMine(ctx, ctx.alice, 'A');
  await saveMine(ctx, ctx.bruno, 'B');
  const path = (seat: string) => encodeURIComponent(`lessons/instructors/${seat}/2026-W46/2026-11-12.json`);
  assert.equal((await ctx.call(`/api/gym/cloud?op=file&path=${path('seat-bruno')}`, {}, ctx.alice)).status, 403);
  const own = await ctx.call(`/api/gym/cloud?op=file&path=${path('seat-alice')}`, {}, ctx.alice);
  assert.equal(own.status, 200);
  assert.equal(await own.text(), plan('A'));
  assert.equal((await ctx.call(`/api/gym/cloud?op=file&path=${path('seat-bruno')}`, {}, ctx.owner)).status, 200);

  const listed = (await (await ctx.call(`/api/gym/cloud?op=list&purpose=lesson&date=${DAY}`, {}, ctx.alice)).json()) as {
    files: { path: string; lessonPlan?: string }[];
  };
  assert.deepEqual(
    listed.files.map((row) => [row.lessonPlan, row.path]),
    [
      ['mine', 'lessons/instructors/seat-alice/2026-W46/2026-11-12.json'],
      ['template', 'lessons/current/2026-W46/2026-11-12.json'],
    ],
  );
});

test('back to template drops only my copy; the template and other copies stay', async () => {
  const ctx = await setup();
  await saveCloudLessonTemplate({ dateKey: DAY, json: plan('T'), token: ctx.owner, fetcher: ctx.fetcher });
  await saveMine(ctx, ctx.alice, 'A');
  await saveMine(ctx, ctx.bruno, 'B');
  const reset = await resetMyCloudLessonPlan({ dateKey: DAY, token: ctx.alice, fetcher: ctx.fetcher });
  assert.equal(reset.ok, true);
  assert.equal(ctx.bucket.objects.has(seatKey('seat-alice')), false);
  assert.equal(ctx.bucket.text(seatKey('seat-bruno')), plan('B'));
  assert.equal(ctx.bucket.text(TEMPLATE_KEY), plan('T'));
  const reopened = await fetchCloudLessonPlan({ dateKey: DAY, token: ctx.alice, fetcher: ctx.fetcher });
  assert.equal(reopened?.mine.exists, false);
  assert.equal(reopened?.template.exists, true);
  // Assistants have no upload, so they cannot reset either.
  assert.equal((await resetMyCloudLessonPlan({ dateKey: DAY, token: ctx.assistant, fetcher: ctx.fetcher })).ok, false);
});
