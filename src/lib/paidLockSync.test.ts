import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// Paid screens (#321) and the owner-test relock fix (#322) touch the same lock paths.
// paidChunkCache.ts imports a Vite virtual module, so node cannot load it. These checks
// keep the wiring in place: every lock or clear that closes Pro also drops the cached
// paid screens, and the owner-test door drops still happen.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');

function body(source: string, name: string): string {
  const match = new RegExp(`export (async )?function ${name}\\(`).exec(source);
  const start = match ? match.index : -1;
  assert.ok(start >= 0, `${name} exists`);
  const open = source.indexOf('{', source.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  throw new Error(`${name} has no body`);
}

test('Lock Pro drops the owner-test Pro doors and clears the cached paid screens', () => {
  const pro = read('src/lib/proUnlock.ts');
  const lock = body(pro, 'lockPro');
  assert.match(lock, /dropOwnerTestDoors\(/);
  assert.match(lock, /'seat'/);
  assert.match(lock, /writeFlag\(false\)/);
  assert.match(lock, /syncPaidScreens\(false\)/);
  assert.match(pro, /mod\.clearPaidChunkCache\(\)/);
});

test('clearing the entitlement token clears the paid chunk cache', () => {
  const ent = read('src/lib/entitlement.ts');
  assert.match(body(ent, 'clearEntitlementToken'), /clearPaidChunkCache\(\)/);
});

test('Clear test unlock removes only an owner-test token, through the path that clears paid screens', () => {
  const ent = read('src/lib/entitlement.ts');
  const clear = body(ent, 'clearOwnerTestToken');
  assert.match(clear, /OWNER_TEST_LICENSE_ID/);
  assert.match(clear, /clearEntitlementToken\(\)/);
  const client = read('src/lib/codeRedeemClient.ts');
  const unlock = body(client, 'clearOwnerTestUnlock');
  assert.match(unlock, /clearOwnerTestGrant\(\)/);
  assert.match(unlock, /clearOwnerTestToken\(\)/);
});

test('a fresh server token still refreshes the paid chunk cache', () => {
  const ent = read('src/lib/entitlement.ts');
  assert.match(body(ent, 'acceptServerToken'), /syncPaidChunkCache\(claims, token\)/);
});
