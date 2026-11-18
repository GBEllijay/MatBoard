import assert from 'node:assert/strict';
import test from 'node:test';
import { inviteAlreadySetUp, inviteRefusalOf, type LoginResult } from './emailLogin.ts';

test('invite refusal reasons from the server are kept; anything else is dropped', () => {
  for (const reason of ['invalid', 'revoked', 'expired', 'replaced', 'email', 'claimed', 'has-password']) {
    assert.equal(inviteRefusalOf(reason), reason);
  }
  assert.equal(inviteRefusalOf('nope'), undefined);
  assert.equal(inviteRefusalOf(409), undefined);
});

test('only "has a password" switches the invite screen to Sign in; "open on another device" does not', () => {
  const fail = (status: number, reason?: Extract<LoginResult, { ok: false }>['reason']): LoginResult => ({
    ok: false,
    status,
    error: 'x',
    ...(reason ? { reason } : {}),
  });
  assert.equal(inviteAlreadySetUp(fail(409, 'has-password')), true);
  assert.equal(inviteAlreadySetUp(fail(409, 'claimed')), false);
  assert.equal(inviteAlreadySetUp(fail(409)), true, 'older server: bare 409 still means already set up');
  assert.equal(inviteAlreadySetUp(fail(403, 'revoked')), false);
});

test('the Account invite screen shows the server reason and offers the email code for a claimed seat', async () => {
  const { readFileSync } = await import('node:fs');
  const account = readFileSync(new URL('../pages/Account.tsx', import.meta.url), 'utf8');
  assert.match(account, /inviteRefusal === 'claimed'[\s\S]{0,200}pick\('code'\)[\s\S]{0,80}Get an email code instead/);
  const restore = readFileSync(new URL('../pages/RestoreAccess.tsx', import.meta.url), 'utf8');
  assert.match(restore, /seatOnly \?[\s\S]{0,120}to="\/account\?tab=code"/);
});
