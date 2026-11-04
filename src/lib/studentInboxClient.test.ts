import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachRankUpdate } from './coachRankUpdate.ts';
import { deliverRankUpdate } from './studentInboxClient.ts';

function packet() {
  const built = buildCoachRankUpdate({
    studentId: 'stu-alex',
    belt: 'Blue',
    stripeCount: 2,
    promotionDate: '2026-11-03',
    now: 50,
    updateId: 'rank-nov3',
  });
  if (!built.ok) throw new Error(built.error);
  return built.packet;
}

test('rank delivery saves a file when Advantage Cloud is not connected', async () => {
  let writes = 0;
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('probe=1')) {
      return new Response(JSON.stringify({ ok: false, reason: 'unbound' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    writes += 1;
    return new Response('no', { status: 500 });
  }) as typeof fetch;
  const delivery = await deliverRankUpdate(packet(), {
    fetchImpl,
    token: 'header.body.signature',
    license: 'license01',
  });
  assert.equal(delivery.mode, 'file');
  assert.equal(writes, 0);
  if (delivery.mode === 'file') {
    assert.match(delivery.reason, /not connected/);
    assert.match(delivery.name, /^advantage-handoff-coach-rank-update-rank-nov3-/);
    assert.match(delivery.json, /"kind":"coach-rank-update"/);
  }
});

test('rank delivery uses the cloud inbox when the bucket answers', async () => {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('probe=1')) {
      return new Response(JSON.stringify({ ok: true, bound: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    assert.equal(init?.method, 'POST');
    const auth = new Headers(init?.headers).get('authorization') ?? '';
    assert.match(auth, /^Bearer /);
    return new Response(JSON.stringify({ ok: true, studentPass: 'one.two.three' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  const delivery = await deliverRankUpdate(packet(), {
    fetchImpl,
    token: 'header.body.signature',
    license: 'license01',
  });
  assert.deepEqual(delivery, { mode: 'cloud', studentPass: 'one.two.three' });
});

test('rank delivery saves a file when this phone has no cloud sign-in', async () => {
  const delivery = await deliverRankUpdate(packet(), {
    token: '',
    license: '',
    fetchImpl: (async () => {
      throw new Error('cloud should not be called');
    }) as typeof fetch,
  });
  assert.equal(delivery.mode, 'file');
});
