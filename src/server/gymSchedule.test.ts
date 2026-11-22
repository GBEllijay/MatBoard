import assert from 'node:assert/strict';
import test from 'node:test';
import type { PrivateJwk } from '../lib/entitlementToken.ts';
import { sampleWeekClasses } from '../lib/gymCalendar.ts';
import { STUDENT_LICENSE_PRESET } from '../lib/studentLicensePool.ts';
import { handleGymSchedule, type GymScheduleEnv } from './gymSchedule.ts';
import { sqliteD1 } from './sqliteD1.ts';
import { issueToken } from './tokenIssue.ts';

const now = new Date('2026-11-21T20:00:00.000-05:00');
const GYM = 'gym-riverside-preview';

async function signingSecret(): Promise<{ secret: string; kid: string }> {
  const key = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { secret: JSON.stringify((await crypto.subtle.exportKey('jwk', key.privateKey)) as PrivateJwk), kid: 'k1' };
}

async function fixture() {
  const { secret, kid } = await signingSecret();
  const db = sqliteD1();
  const env: GymScheduleEnv = {
    ENTITLEMENTS_DB: db,
    ENTITLEMENT_SIGNING_KEY: secret,
    ENTITLEMENT_KEY_ID: kid,
  };
  const ownerToken = await issueToken(
    secret,
    {
      licenseId: GYM,
      grants: ['white', 'student', 'coach', 'pro'],
      tier: 'pro',
      src: 'stripe',
      deviceId: 'owner-phone',
      now,
      kind: 'pro',
    },
    kid,
  );
  const studentToken = await issueToken(
    secret,
    {
      licenseId: 'student-license-1',
      grants: ['student'],
      tier: 'student',
      src: 'free',
      deviceId: 'student-phone',
      now,
      kind: 'onetime',
      gym: GYM,
      preset: STUDENT_LICENSE_PRESET,
    },
    kid,
  );
  assert.ok(ownerToken);
  assert.ok(studentToken);
  return { env, db, ownerToken: ownerToken!, studentToken: studentToken! };
}

function request(url: string, init: RequestInit = {}) {
  return new Request(`https://advantagebjjtimer.com${url}`, init);
}

async function read(response: Response) {
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test('publish and pull a gym schedule; students can read it', async () => {
  const f = await fixture();
  const schedule = {
    version: 1,
    title: 'Riverside Academy',
    qrUrl: '',
    notes: '',
    template: 'week',
    castEnabled: true,
    classes: sampleWeekClasses(),
    specials: [],
  };
  const published = await read(
    await handleGymSchedule(
      request('/api/gym/schedule', {
        method: 'POST',
        headers: { authorization: `Bearer ${f.ownerToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'publish', schedule }),
      }),
      f.env,
      () => now,
    ),
  );
  assert.equal(published.status, 200);
  assert.equal(published.body.ok, true);
  assert.equal(published.body.available, true);

  const pulled = await read(
    await handleGymSchedule(request('/api/gym/schedule?view=schedule', { headers: { authorization: `Bearer ${f.studentToken}` } }), f.env, () => now),
  );
  assert.equal(pulled.status, 200);
  assert.equal((pulled.body.schedule as { title?: string } | null)?.title, 'Riverside Academy');
  assert.equal((pulled.body.schedule as { castEnabled?: boolean } | null)?.castEnabled, false);
});

test('a student can mark I plan to attend; the instructor sees the expected list without emails', async () => {
  const f = await fixture();
  const rsvp = await read(
    await handleGymSchedule(
      request('/api/gym/schedule', {
        method: 'POST',
        headers: { authorization: `Bearer ${f.studentToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'rsvp',
          slotId: 'slot-pm',
          date: '2026-11-23',
          studentId: 'stu-jordan-preview',
          displayName: 'Jordan Lee <jordan@example.com>',
          status: 'planned',
        }),
      }),
      f.env,
      () => now,
    ),
  );
  assert.equal(rsvp.status, 200, JSON.stringify(rsvp.body));
  assert.equal((rsvp.body.rsvp as { displayName?: string })?.displayName, 'Jordan Lee');

  const list = await read(
    await handleGymSchedule(
      request('/api/gym/schedule?view=rsvps&date=2026-11-23&slotId=slot-pm', { headers: { authorization: `Bearer ${f.ownerToken}` } }),
      f.env,
      () => now,
    ),
  );
  assert.equal(list.status, 200);
  const rows = list.body.rsvps as { displayName: string; studentId: string }[];
  assert.equal(rows[0]?.displayName, 'Jordan Lee');
  assert.equal(rows[0]?.studentId, 'stu-jordan-preview');
  assert.equal(JSON.stringify(list.body).includes('@'), false);
});

test('GET reports available:false when the schedule table is missing', async () => {
  const f = await fixture();
  await f.db.exec('DROP TABLE gym_schedule');
  const pulled = await read(
    await handleGymSchedule(request('/api/gym/schedule?view=schedule', { headers: { authorization: `Bearer ${f.ownerToken}` } }), f.env, () => now),
  );
  assert.equal(pulled.status, 200);
  assert.equal(pulled.body.available, false);
});

test('students cannot publish the class schedule', async () => {
  const f = await fixture();
  const published = await read(
    await handleGymSchedule(
      request('/api/gym/schedule', {
        method: 'POST',
        headers: { authorization: `Bearer ${f.studentToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'publish', schedule: { version: 1, classes: [], specials: [] } }),
      }),
      f.env,
      () => now,
    ),
  );
  assert.equal(published.status, 403);
});
