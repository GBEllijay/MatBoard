import assert from 'node:assert/strict';
import test from 'node:test';
import { maskEmail } from './maskEmail.ts';

test('maskEmail hides the local part after the first character', () => {
  assert.equal(maskEmail('justin@gmail.com'), 'j***@gmail.com');
  assert.equal(maskEmail('  Buyer@Gym.test '), 'B***@Gym.test');
  assert.equal(maskEmail('a@x.co'), 'a***@x.co');
  assert.equal(maskEmail('not-an-email'), '');
  assert.equal(maskEmail(''), '');
});
