import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import { buildRosterBackup, type BackupStudent, type RosterBackup } from '../lib/rosterBackup.ts';
import type { D1Database } from './d1.ts';
import { handleGymCloud, streamFrom, type GymCloudEnv, type GymMediaBucket, type R2MultipartUpload } from './gymCloud.ts';
import { handleGymRoster, rosterRole } from './gymRoster.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-04T08:00:00.000Z');

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

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

  deletes = 0;
  async delete(keys: string | string[]) {
    const list = Array.isArray(keys) ? keys : [keys];
    this.deletes += list.length;
    for (const key of list) this.objects.delete(key);
  }

  async list(options?: { prefix?: string; cursor?: string; limit?: number }) {
    const prefix = options?.prefix ?? '';
    const keys = [...this.objects.keys()].filter((key) => key.startsWith(prefix)).sort();
    const start = options?.cursor ? Math.max(0, keys.indexOf(options.cursor) + 1) : 0;
    const limit = options?.limit ?? keys.length;
    const slice = keys.slice(start, start + limit);
    const truncated = start + limit < keys.length;
    return {
      objects: slice.map((key) => {
        const row = this.objects.get(key)!;
        return { key, size: row.bytes.byteLength, httpMetadata: { contentType: row.type } };
      }),
      truncated,
      cursor: truncated ? slice[slice.length - 1] : undefined,
    };
  }

  async createMultipartUpload(key: string, options?: { httpMetadata?: { contentType?: string } }): Promise<R2MultipartUpload> {
    const uploadId = `up-${this.seq}`;
    this.seq += 1;
    this.uploads.set(uploadId, {
      key,
      parts: new Map(),
      type: options?.httpMetadata?.contentType || 'application/octet-stream',
    });
    return this.resumeMultipartUpload(key, uploadId);
  }

  resumeMultipartUpload(key: string, uploadId: string): R2MultipartUpload {
    const row = this.uploads.get(uploadId);
    if (!row || row.key !== key) throw new Error('missing upload');
    return {
      key,
      uploadId,
      uploadPart: async (partNumber: number, value: ArrayBuffer | Uint8Array) => {
        const bytes = value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
        row.parts.set(partNumber, bytes);
        return { partNumber, etag: `etag-${partNumber}-${bytes.byteLength}` };
      },
      complete: async (parts) => {
        const chunks = parts.map((part) => {
          const bytes = row.parts.get(part.partNumber);
          if (!bytes) throw new Error('missing part');
          return bytes;
        });
        const size = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
        this.objects.set(key, { bytes, type: row.type });
        this.uploads.delete(uploadId);
      },
      abort: async () => {
        this.uploads.delete(uploadId);
      },
    };
  }
}

function fakeDb(input: {
  grants?: { licenseId: string; product: string; source: string; sourceRef: string | null; status: string; endsAt: string | null; revokedAt: string | null }[];
  seat?: { status: string; revokedAt: string | null } | null;
}): D1Database {
  return {
    prepare(sql: string) {
      const prepared = {
        bind() {
          return prepared;
        },
        async all<T>() {
          return { results: (sql.includes('FROM grants') ? input.grants ?? [] : []) as T[] };
        },
        async first<T>() {
          return (sql.includes('FROM seats') ? (input.seat ?? null) : null) as T | null;
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
      return prepared;
    },
    async exec() {
      return undefined;
    },
  };
}

async function token(secret: string, input: Parameters<typeof issueToken>[1]): Promise<string> {
  const issued = await issueToken(secret, input);
  assert.ok(issued);
  return issued;
}

function ownerToken(secret: string, licenseId = 'owner-test'): Promise<string> {
  return token(secret, { licenseId, grants: ['white', 'student', 'coach', 'pro'], tier: 'pro', src: 'code', deviceId: 'device-owner', now, kind: 'code' });
}

function seatToken(secret: string, sid: string, preset: string | null, licenseId = 'owner-test'): Promise<string> {
  return token(secret, {
    licenseId,
    grants: ['pro'],
    tier: 'seat',
    src: 'seat',
    deviceId: `device-${sid}`,
    now,
    kind: 'seat',
    gym: licenseId,
    sid,
    preset,
  } as Parameters<typeof issueToken>[1]);
}

function call(env: GymCloudEnv, path: string, bearer: string, body?: unknown): Promise<Response> {
  const headers = new Headers({ authorization: `Bearer ${bearer}` });
  const init: RequestInit = body === undefined ? { headers } : { method: 'POST', headers, body: JSON.stringify(body) };
  return handleGymRoster(new Request(new URL(path, 'https://advantagebjjtimer.com'), init), env, () => now);
}

function student(id: string, name: string, extra: Partial<BackupStudent> = {}): BackupStudent {
  return { id, name, belt: 'Blue', division: '', gym: '', photo: '', lastPromotion: '', note: '', checkedIn: false, ...extra };
}

function backup(students: BackupStudent[], notes: Record<string, string> = {}): RosterBackup {
  return buildRosterBackup(
    { roster: { version: 1, students, ready: {}, gamePlans: {}, competitionPlans: {} }, cardFile: { cards: {} }, privateNotes: notes, inbox: [] },
    { scope: 'coach-private', now },
  );
}

type StateBody = { role: { canApprove: boolean; isOwner: boolean }; trustMode: boolean; master: RosterBackup | null; pending: { id: string; status: string }[] };

async function state(env: GymCloudEnv, bearer: string): Promise<{ status: number; body: StateBody }> {
  const response = await call(env, '/api/gym/roster?op=state', bearer);
  return { status: response.status, body: (await response.json()) as StateBody };
}

function setup() {
  const bucket = new MemoryBucket();
  return { bucket, env: (secret: string): GymCloudEnv => ({ GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1' }) };
}

test('roster roles: owner, Coach and Instructors only; assistant, program director, and custom seats refused', () => {
  assert.deepEqual(rosterRole({ kind: 'owner', preset: null, plusCloud: true }), { canRead: true, canSubmit: true, canApprove: true, isOwner: true });
  assert.deepEqual(rosterRole({ kind: 'seat', preset: 'instructors', plusCloud: true }), { canRead: true, canSubmit: true, canApprove: true, isOwner: false });
  assert.deepEqual(rosterRole({ kind: 'seat', preset: 'coach', plusCloud: true }), { canRead: true, canSubmit: true, canApprove: false, isOwner: false });
  for (const preset of ['assistant-coach', 'program-director', null, 'custom']) {
    assert.equal(rosterRole({ kind: 'seat', preset, plusCloud: true }).canRead, false, String(preset));
  }
  assert.equal(rosterRole({ kind: 'owner', preset: null, plusCloud: false }).canRead, false);
});

test('a coach seat submits pending; the head approves; the master never carries private notes or photos', async () => {
  const secret = await signingSecret();
  const { bucket, env: makeEnv } = setup();
  const env = makeEnv(secret);
  const owner = await ownerToken(secret);
  const coach = await seatToken(secret, 'seat-coach', 'coach');
  const instructor = await seatToken(secret, 'seat-inst', 'instructors');

  const sent = await call(env, '/api/gym/roster?op=submit', coach, {
    backup: { ...backup([student('c1', 'Cy', { photo: 'data:image/png;base64,FACE' })], { c1: 'Private: c' }) },
  });
  assert.equal(sent.status, 200);
  const sentBody = (await sent.json()) as { pending: boolean; id: string };
  assert.equal(sentBody.pending, true);
  for (const [key, row] of bucket.objects) {
    assert.doesNotMatch(new TextDecoder().decode(row.bytes), /Private:|FACE/, key);
  }

  const coachState = await state(env, coach);
  assert.equal(coachState.body.master, null);
  assert.equal(coachState.body.pending.length, 1, 'coach sees its own submission');

  // The coach cannot approve, even its own.
  const selfDecide = await call(env, '/api/gym/roster?op=decide', coach, { id: sentBody.id, decision: 'approve' });
  assert.equal(selfDecide.status, 403);

  const approved = await call(env, '/api/gym/roster?op=decide', instructor, { id: sentBody.id, decision: 'approve' });
  assert.equal(approved.status, 200);
  const master = (await state(env, owner)).body.master;
  assert.deepEqual(master?.roster.students.map((row) => row.name), ['Cy']);
  assert.equal(master?.privateNotes, undefined);
  assert.equal(master?.roster.students[0].photo ?? '', '');

  const again = await call(env, '/api/gym/roster?op=decide', owner, { id: sentBody.id, decision: 'reject' });
  assert.equal(again.status, 409, 'decided once');
  assert.equal(bucket.deletes, 0);
});

test('an instructor cannot approve its own submission; reject leaves the master alone', async () => {
  const secret = await signingSecret();
  const { bucket, env: makeEnv } = setup();
  const env = makeEnv(secret);
  const owner = await ownerToken(secret);
  const instructor = await seatToken(secret, 'seat-inst', 'instructors');
  const sent = (await (await call(env, '/api/gym/roster?op=submit', instructor, { backup: backup([student('i1', 'Ike')]) })).json()) as { id: string };
  assert.equal((await call(env, '/api/gym/roster?op=decide', instructor, { id: sent.id, decision: 'approve' })).status, 403);
  assert.equal((await call(env, '/api/gym/roster?op=decide', owner, { id: sent.id, decision: 'reject' })).status, 200);
  assert.equal((await state(env, owner)).body.master, null);
  assert.equal(bucket.deletes, 0);
});

test('the owner applies at once; trust mode is off by default, owner-only, and skips pending for seats', async () => {
  const secret = await signingSecret();
  const { env: makeEnv } = setup();
  const env = makeEnv(secret);
  const owner = await ownerToken(secret);
  const coach = await seatToken(secret, 'seat-coach', 'coach');
  const instructor = await seatToken(secret, 'seat-inst', 'instructors');

  const direct = (await (await call(env, '/api/gym/roster?op=submit', owner, { backup: backup([student('o1', 'Oli')]) })).json()) as { applied: boolean };
  assert.equal(direct.applied, true);
  assert.equal((await state(env, owner)).body.trustMode, false);

  assert.equal((await call(env, '/api/gym/roster?op=trust', instructor, { on: true })).status, 403);
  assert.equal((await call(env, '/api/gym/roster?op=trust', coach, { on: true })).status, 403);
  assert.equal((await call(env, '/api/gym/roster?op=trust', owner, { on: true })).status, 200);
  assert.equal((await state(env, coach)).body.trustMode, true);

  const trusted = (await (await call(env, '/api/gym/roster?op=submit', coach, { backup: backup([student('c1', 'Cy')]) })).json()) as { applied: boolean };
  assert.equal(trusted.applied, true);
  assert.deepEqual((await state(env, owner)).body.master?.roster.students.map((row) => row.name).sort(), ['Cy', 'Oli']);

  // Merges only add: an empty submission never removes students.
  await call(env, '/api/gym/roster?op=submit', owner, { backup: backup([]) });
  assert.equal((await state(env, owner)).body.master?.roster.students.length, 2);
});

test('assistant coach, program director, and custom seats are refused by the server', async () => {
  const secret = await signingSecret();
  const { env: makeEnv } = setup();
  const env = makeEnv(secret);
  for (const preset of ['assistant-coach', 'program-director', null]) {
    const seat = await seatToken(secret, `seat-${preset ?? 'custom'}`, preset);
    assert.equal((await state(env, seat)).status, 403, String(preset));
    assert.equal((await call(env, '/api/gym/roster?op=submit', seat, { backup: backup([student('x', 'X')]) })).status, 403);
  }
});

test('a revoked seat is refused on the server', async () => {
  const secret = await signingSecret();
  const bucket = new MemoryBucket();
  const grants = [{ licenseId: 'lic-code', product: 'advantage-pro', source: 'code', sourceRef: 'code:1', status: 'active', endsAt: null, revokedAt: null }];
  const live: GymCloudEnv = { GYM_MEDIA: bucket, ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: fakeDb({ grants, seat: { status: 'claimed', revokedAt: null } }) };
  const revoked: GymCloudEnv = { ...live, ENTITLEMENTS_DB: fakeDb({ grants, seat: { status: 'claimed', revokedAt: '2026-11-01T00:00:00.000Z' } }) };
  const coach = await seatToken(secret, 'seat-real', 'coach', 'lic-code');
  assert.equal((await state(live, coach)).status, 200);
  assert.equal((await state(revoked, coach)).status, 403);
  assert.equal((await call(revoked, '/api/gym/roster?op=submit', coach, { backup: backup([student('x', 'X')]) })).status, 403);
  assert.equal((await call(revoked, '/api/gym/roster?op=private', coach)).status, 403);
});

test('private notes: each author reads only their own, the owner reads all, students and sync never do', async () => {
  const secret = await signingSecret();
  const { bucket, env: makeEnv } = setup();
  const env = makeEnv(secret);
  const owner = await ownerToken(secret);
  const coach = await seatToken(secret, 'seat-coach', 'coach');
  const instructor = await seatToken(secret, 'seat-inst', 'instructors');
  const assistant = await seatToken(secret, 'seat-asst', 'assistant-coach');

  assert.equal((await call(env, '/api/gym/roster?op=private', coach, { notes: { c1: 'Coach secret' } })).status, 200);
  assert.equal((await call(env, '/api/gym/roster?op=private', owner, { notes: { o1: 'Owner secret' } })).status, 200);
  // Fill only: a second write never replaces a note.
  const again = (await (await call(env, '/api/gym/roster?op=private', coach, { notes: { c1: 'Changed' } })).json()) as { added: number };
  assert.equal(again.added, 0);

  const coachRead = (await (await call(env, '/api/gym/roster?op=private', coach)).json()) as { notes: Record<string, Record<string, string>> };
  assert.deepEqual(Object.keys(coachRead.notes), ['seat-seat-coach']);
  assert.equal(coachRead.notes['seat-seat-coach'].c1, 'Coach secret');

  const instRead = (await (await call(env, '/api/gym/roster?op=private', instructor)).json()) as { notes: Record<string, Record<string, string>> };
  assert.deepEqual(instRead.notes, { 'seat-seat-inst': {} });

  const ownerRead = (await (await call(env, '/api/gym/roster?op=private', owner)).json()) as { notes: Record<string, Record<string, string>> };
  assert.equal(ownerRead.notes.owner.o1, 'Owner secret');
  assert.equal(ownerRead.notes['seat-seat-coach'].c1, 'Coach secret');

  assert.equal((await call(env, '/api/gym/roster?op=private', assistant)).status, 403);

  // Private notes sent inside a roster submit are dropped, and never appear in state.
  await call(env, '/api/gym/roster?op=submit', owner, { backup: backup([student('o1', 'Oli')], { o1: 'Sneaky private' }) });
  const shared = JSON.stringify((await state(env, owner)).body);
  assert.doesNotMatch(shared, /Sneaky private|Owner secret|Coach secret/);

  // The generic gym cloud file route cannot read roster keys.
  for (const path of ['roster/master.json', 'roster/private/owner.json', '../roster/private/owner.json']) {
    const response = await handleGymCloud(
      new Request(new URL(`/api/gym/cloud?op=file&path=${encodeURIComponent(path)}`, 'https://advantagebjjtimer.com'), { headers: { authorization: `Bearer ${owner}` } }),
      env,
      () => now,
    );
    assert.notEqual(response.status, 200, path);
  }
  assert.equal(bucket.deletes, 0);
});

test('requests without Plus Cloud or without a bucket are refused', async () => {
  const secret = await signingSecret();
  const stripe = await token(secret, { licenseId: 'lic-stripe', grants: ['white', 'student', 'coach', 'pro'], tier: 'pro', src: 'stripe', deviceId: 'd', now, kind: 'pro' });
  const { env: makeEnv } = setup();
  assert.equal((await state(makeEnv(secret), stripe)).status, 403);
  const unbound = await handleGymRoster(new Request('https://advantagebjjtimer.com/api/gym/roster?op=state'), {}, () => now);
  assert.equal(unbound.status, 503);
  const signedOut = await handleGymRoster(new Request('https://advantagebjjtimer.com/api/gym/roster?op=state'), makeEnv(secret), () => now);
  assert.equal(signedOut.status, 401);
});
