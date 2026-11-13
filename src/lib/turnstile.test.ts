/**
 * /api/config for the restore person check: a failed fetch is not the same as a missing site key.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRestoreCheckConfig, fetchTurnstileSiteKey } from './turnstile.ts';

function respond(status: number, body: unknown): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch;
}

test('a successful config with a site key is available', async () => {
  const config = await fetchRestoreCheckConfig(
    respond(200, { turnstileSiteKey: 'site-key-1', restoreAvailable: true }),
  );
  assert.deepEqual(config, { ok: true, siteKey: 'site-key-1', restoreAvailable: true });
  assert.equal(await fetchTurnstileSiteKey(respond(200, { turnstileSiteKey: 'site-key-1', restoreAvailable: true })), 'site-key-1');
});

test('a successful config with no site key is still ok', async () => {
  const config = await fetchRestoreCheckConfig(respond(200, { restoreAvailable: false, turnstileSiteKey: null }));
  assert.deepEqual(config, { ok: true, siteKey: null, restoreAvailable: false });
});

test('a failed or blocked config request is not treated as a missing key', async () => {
  const failed = await fetchRestoreCheckConfig(respond(500, { error: 'nope' }));
  assert.deepEqual(failed, { ok: false });
  const blocked = await fetchRestoreCheckConfig((async () => {
    throw new Error('network');
  }) as typeof fetch);
  assert.deepEqual(blocked, { ok: false });
  assert.equal(await fetchTurnstileSiteKey(respond(503, {})), null);
});
