import assert from 'node:assert/strict';
import test from 'node:test';
import { SEAT_ACCEPT_INVALID, SEAT_ACCEPT_UNAVAILABLE, seatAcceptFailure, seatWelcomeLine } from './seatClient.ts';

test('seat invite refusals keep the server reason and words', () => {
  assert.deepEqual(seatAcceptFailure(409, 'This seat is already open on another device. The owner can reset it.'), {
    ok: false,
    reason: 'claimed',
    message: 'This seat is already open on another device. The owner can reset it.',
  });
  assert.equal(seatAcceptFailure(403, 'This seat was revoked.').reason, 'revoked');
  assert.deepEqual(seatAcceptFailure(400, 'This invite has expired. Ask the owner for a new link.'), {
    ok: false,
    reason: 'expired',
    message: 'This invite has expired. Ask the owner for a new link.',
  });
  assert.deepEqual(seatAcceptFailure(400, 'This invite is not valid.'), { ok: false, reason: 'invalid', message: 'This invite is not valid.' });
  assert.equal(seatAcceptFailure(400).message, SEAT_ACCEPT_INVALID);
  // Server setup errors are not shown raw to the instructor.
  assert.deepEqual(seatAcceptFailure(503, 'Entitlement storage is not set up yet. Bind ENTITLEMENTS_DB.'), {
    ok: false,
    reason: 'unavailable',
    message: SEAT_ACCEPT_UNAVAILABLE,
  });
});

test("You're in names the gym and the seat preset", () => {
  assert.equal(
    seatWelcomeLine({ ok: true, seatId: 's1', email: 'paige@example.com', presetId: 'coach', gymName: 'GB Ellijay' }),
    'GB Ellijay added you as Coach. This phone now opens the instructor screens the gym owner picked.',
  );
  assert.match(
    seatWelcomeLine({ ok: true, seatId: 's1', email: 'x', presetId: null, gymName: '' }),
    /^Your academy added you as an instructor\./,
  );
});
