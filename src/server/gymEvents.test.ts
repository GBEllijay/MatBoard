import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import type { D1Database } from './d1.ts';
import { handleGymEvents } from './gymEvents.ts';
import type { GymCloudEnv } from './gymCloud.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-04T15:00:00.000Z');

type Row = {
  id: string;
  licenseId: string;
  seatId: string;
  type: string;
  at: string;
  payload: string;
  recordedAt: number;
};

function memoryDb(): D1Database & { rows: Row[] } {
  const rows: Row[] = [];
  return {
    rows,
    prepare(sql: string) {
      const state = { args: [] as unknown[] };
      const prepared = {
        bind(...args: unknown[]) {
          state.args = args;
          return prepared;
        },
        async run() {
          if (!sql.includes('INSERT')) return { meta: { changes: 0 } };
          const [id, licenseId, seatId, type, at, payload, recordedAt] = state.args as [string, string, string, string, string, string, number];
          if (rows.some((row) => row.id === id)) return { meta: { changes: 0 } };
          rows.push({ id, licenseId, seatId, type, at, payload, recordedAt });
          return { meta: { changes: 1 } };
        },
        async all<T>() {
          if (sql.includes('recorded_at >')) {
            const [licenseId, since, limit] = state.args as [string, number, number];
            const results = rows
              .filter((row) => row.licenseId === licenseId && row.recordedAt > since)
              .sort((a, b) => a.recordedAt - b.recordedAt)
              .slice(0, limit)
              .map((row) => ({ payload: row.payload, recordedAt: row.recordedAt, seatId: row.seatId }));
            return { results: results as T[] };
          }
          const [licenseId, limit] = state.args as [string, number];
          const results = rows
            .filter((row) => row.licenseId === licenseId)
            .slice(0, limit ?? rows.length)
            .map((row) => ({ payload: row.payload }));
          return { results: results as T[] };
        },
        async first<T>() {
          return null as T | null;
        },
      };
      return prepared;
    },
    async exec() {
      return undefined;
    },
  };
}

async function signingSecret(): Promise<string> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk);
}

function event(id: string, type: 'class_taught' | 'promotion', seatId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    type,
    at: '2026-11-04T12:00:00.000Z',
    recordedAt: id.endsWith('2') ? 20 : 10,
    licenseId: 'other-gym',
    actor: { seatId, name: 'Coach' },
    source: 'live',
    v: 1,
    planId: 'plan-1',
    date: '2026-11-04',
    template: 'adult',
    classDesignation: 'GB1',
    minutes: 60,
    instructorSeat: seatId,
    studentId: 'stu-1',
    from: { belt: 'White', stripes: 0 },
    to: { belt: 'Blue', stripes: 0 },
    note: 'private note must not stick',
    ...extra,
  };
}

async function token(secret: string, kind: 'owner' | 'coach' | 'assistant'): Promise<string> {
  const issued = await issueToken(
    secret,
    kind === 'owner'
      ? { licenseId: 'owner-test', grants: ['white', 'student', 'coach', 'pro'], tier: 'pro', src: 'code', deviceId: 'device-owner', now, kind: 'code' }
      : {
          licenseId: 'owner-test',
          grants: ['pro'],
          tier: 'seat',
          src: 'seat',
          deviceId: `device-${kind}`,
          now,
          kind: 'seat',
          gym: 'owner-test',
          sid: `seat-${kind}`,
          preset: kind === 'assistant' ? 'assistant-coach' : 'coach',
        },
  );
  assert.ok(issued);
  return issued;
}

function call(env: GymCloudEnv, method: string, bearer: string, body?: unknown, since = 0): Promise<Response> {
  const headers = new Headers({ authorization: `Bearer ${bearer}` });
  const url = new URL(`/api/gym/events?since=${since}`, 'https://advantagebjjtimer.com');
  const init: RequestInit = body === undefined ? { method, headers } : { method, headers, body: JSON.stringify(body) };
  return handleGymEvents(new Request(url, init), env, () => now);
}

test('push is idempotent, a seat cannot see another seat, and an assistant is refused', async () => {
  const secret = await signingSecret();
  const db = memoryDb();
  const env: GymCloudEnv = { ENTITLEMENT_SIGNING_KEY: secret, ENTITLEMENT_KEY_ID: 'k1', ENTITLEMENTS_DB: db };
  const owner = await token(secret, 'owner');
  const coach = await token(secret, 'coach');
  const assistant = await token(secret, 'assistant');

  const refused = await call(env, 'POST', assistant, { events: [event('c1', 'class_taught', 'seat-assistant')] });
  assert.equal(refused.status, 403);

  const first = await call(env, 'POST', coach, { events: [event('c1', 'class_taught', 'seat-coach'), event('c1', 'class_taught', 'seat-coach')] });
  assert.equal(first.status, 200);
  const pushed = (await first.json()) as { accepted: string[] };
  assert.deepEqual(pushed.accepted, ['c1', 'c1']);
  assert.equal(db.rows.length, 1);
  assert.equal(db.rows[0]?.licenseId, 'owner-test');
  assert.equal(db.rows[0]?.payload.includes('private note'), false);

  const again = await call(env, 'POST', coach, { events: [event('c1', 'class_taught', 'seat-coach')] });
  assert.equal(again.status, 200);
  assert.equal(db.rows.length, 1);

  await call(env, 'POST', owner, { events: [event('p2', 'promotion', 'owner', { recordedAt: 30 })] });
  assert.equal(db.rows.length, 2);

  const seatPull = (await (await call(env, 'GET', coach)).json()) as { events: { id: string; studentId?: string }[]; totals: { classes: number; promotions: number } };
  assert.deepEqual(seatPull.events.map((row) => row.id), ['c1']);
  assert.equal(seatPull.totals.classes, 1);
  assert.equal(seatPull.totals.promotions, 1);

  const ownerPull = (await (await call(env, 'GET', owner, undefined, 15)).json()) as { events: { id: string }[]; cursor: number };
  assert.deepEqual(ownerPull.events.map((row) => row.id), ['p2']);
  assert.equal(ownerPull.cursor, 30);

  const missing = await call({ ...env, ENTITLEMENTS_DB: null }, 'GET', owner);
  assert.equal(missing.status, 503);
});
