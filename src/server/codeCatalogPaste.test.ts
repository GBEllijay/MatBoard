import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { codeCatalogStatus, loadCodeCatalog, parseCodeCatalog, parseCodeCatalogDetailed } from './codeCatalog.ts';
import { handleCodeRedeem } from './codeRedeem.ts';
import { handlePublicConfig } from './publicConfig.ts';
import { resetRateLimitsForTests } from './rateLimit.ts';

const pepper = 'made-up-test-pepper-not-real';
let ip = 10;

function generate(kind: string, withPepper = pepper): { code: string; record: string; arrayLine: string } {
  const out = execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/generate-unlock-codes.ts', '--kind', kind], {
    env: { ...process.env, CODE_HASH_PEPPER: withPepper },
    encoding: 'utf8',
  });
  const lines = out.split('\n');
  const code = lines[lines.indexOf('Code (show once, do not commit):') + 1]!.trim();
  const record = lines[lines.indexOf('Catalog record:') + 1]!.trim();
  const arrayLine = lines.find((line) => line.startsWith('[{'))!.trim();
  return { code, record, arrayLine };
}

async function redeem(catalog: string, code: string, envPepper = pepper) {
  ip += 1;
  const response = await handleCodeRedeem(
    new Request('http://localhost/api/codes/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${ip}` },
      body: JSON.stringify({ code }),
    }),
    { CODE_HASH_PEPPER: envPepper, CODE_CATALOG: catalog },
  );
  return { status: response.status, body: (await response.json()) as { ok?: boolean; grants?: string[] } };
}

test('generator output round-trips to a successful redeem in every paste shape the owner might use', async () => {
  resetRateLimitsForTests();
  const pro = generate('alpha-pro');
  const coach = generate('alpha-coach');
  const shapes: Record<string, string> = {
    'array line the generator prints': pro.arrayLine,
    'single record, pasted as the docs said': pro.record,
    'two records, one per line': `${pro.record}\n${coach.record}`,
    'two records, comma separated without brackets': `${pro.record},\n${coach.record}`,
    'array, pretty printed': JSON.stringify([JSON.parse(pro.record), JSON.parse(coach.record)], null, 2),
    'array wrapped in single quotes': `'[${pro.record}]'`,
    'array wrapped in double quotes': `"[${pro.record}]"`,
    'JSON string literal': JSON.stringify(`[${pro.record}]`),
    'leading and trailing whitespace': `\n\n   [${pro.record}]  \n`,
    'CODE_CATALOG= prefix': `CODE_CATALOG=[${pro.record}]`,
    'curly quotes from a notes app': `[${pro.record}]`.replaceAll('"', '\u201c'),
    'labelled generator block pasted whole': `Catalog record:\n${pro.record}\n`,
    'object with a codes array': JSON.stringify({ codes: [JSON.parse(pro.record)] }),
    'trailing newline with CRLF lines': `${pro.record}\r\n${coach.record}\r\n`,
  };
  for (const [name, catalog] of Object.entries(shapes)) {
    for (const typed of [pro.code, pro.code.toLowerCase(), pro.code.replaceAll('-', ' '), ` ${pro.code.replaceAll('-', '')} `]) {
      const result = await redeem(catalog, typed);
      assert.equal(result.status, 200, `${name} should redeem "${typed === pro.code ? 'as printed' : 'variant'}"`);
      assert.deepEqual(result.body.grants, ['pro', 'student'], name);
    }
  }
  const both = await redeem(`${pro.record}\n${coach.record}`, coach.code);
  assert.deepEqual(both.body.grants, ['coach']);
});

test('a wrong code, a wrong pepper, and an empty catalog still fail with the generic answer', async () => {
  resetRateLimitsForTests();
  const pro = generate('alpha-pro');
  assert.equal((await redeem(pro.record, 'FAKE-CODE-0000')).status, 400);
  assert.equal((await redeem(pro.record, pro.code, 'a-different-pepper')).status, 400);
  assert.equal((await redeem('', pro.code)).status, 400);
  assert.equal((await redeem('not json at all', pro.code)).status, 400);
  const other = generate('alpha-pro', 'a-different-pepper');
  assert.equal((await redeem(other.record, other.code)).status, 400, 'generator pepper must match the Cloudflare pepper');
});

test('bad rows are skipped and counted, good rows still load, and uppercase hashes are accepted', () => {
  const hash = 'ab'.repeat(32);
  const parsed = parseCodeCatalogDetailed(
    JSON.stringify([
      { id: 'good', hash: hash.toUpperCase(), kind: ' Alpha-Pro ' },
      { id: 'bad-kind', hash, kind: 'platinum' },
      { id: 'bad-hash', hash: 'xyz', kind: 'owner' },
    ]),
  );
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0]?.hash, hash);
  assert.equal(parsed.records[0]?.kind, 'alpha-pro');
  assert.equal(parsed.rejected, 2);
  assert.deepEqual(parseCodeCatalog(undefined), []);
  assert.equal(parseCodeCatalogDetailed('garbage').readable, false);
  const duplicate = JSON.stringify({ id: 'dup', hash, kind: 'owner' });
  assert.equal(parseCodeCatalog(`${duplicate}\n${duplicate}`).length, 1);
});

test('a malformed per-code KV record no longer throws', async () => {
  const hash = 'cd'.repeat(32);
  const kv = {
    async get(key: string) {
      return key === 'code:bad' ? '{not json' : JSON.stringify({ id: 'kv', hash, kind: 'alpha-coach' });
    },
    async put() {},
    async list() {
      return { keys: [{ name: 'code:bad' }, { name: 'code:good' }] };
    },
  };
  const records = await loadCodeCatalog(undefined, kv);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.kind, 'alpha-coach');
});

test('/api/config reports code setup as counts only, never hashes or ids', async () => {
  const pro = generate('alpha-pro');
  const coach = generate('alpha-coach');
  const catalog = `${pro.record}\n${coach.record}\n{"id":"bad","hash":"nope","kind":"owner"}`;
  const response = handlePublicConfig(new Request('http://localhost/api/config'), { CODE_HASH_PEPPER: pepper, CODE_CATALOG: catalog }, null);
  const text = await response.text();
  const body = JSON.parse(text) as { codes: Record<string, unknown> };
  assert.deepEqual(body.codes, { pepperSet: true, catalogSet: true, catalogLoaded: true, entries: 2, rejected: 1, kinds: { owner: 0, 'alpha-coach': 1, 'alpha-pro': 1, 'alpha-student': 0, 'free-white': 0, 'alpha-media': 0 }, duplicates: 0, problem: null });
  const hash = (JSON.parse(pro.record) as { hash: string }).hash;
  const id = (JSON.parse(pro.record) as { id: string }).id;
  assert.equal(text.includes(hash), false);
  assert.equal(text.includes(hash.slice(0, 8)), false);
  assert.equal(text.includes(id), false);
  assert.equal(text.includes(pepper), false);
  assert.equal(text.includes(pro.code), false);

  const empty = (await handlePublicConfig(new Request('http://localhost/api/config'), {}, null).json()) as { codes: unknown };
  assert.deepEqual(empty.codes, { pepperSet: false, catalogSet: false, catalogLoaded: false, entries: 0, rejected: 0, kinds: { owner: 0, 'alpha-coach': 0, 'alpha-pro': 0, 'alpha-student': 0, 'free-white': 0, 'alpha-media': 0 }, duplicates: 0, problem: null });
  assert.deepEqual(codeCatalogStatus('garbage'), { catalogSet: true, catalogLoaded: false, entries: 0, rejected: 1, kinds: { owner: 0, 'alpha-coach': 0, 'alpha-pro': 0, 'alpha-student': 0, 'free-white': 0, 'alpha-media': 0 }, duplicates: 0, problem: 'not-json' });
  assert.equal(codeCatalogStatus(pro.code).problem, 'looks-like-a-plain-code');
  assert.equal(codeCatalogStatus(`code:${hash}`).problem, 'hash-without-record');
  assert.equal(codeCatalogStatus(hash).problem, 'hash-without-record');
  assert.equal(codeCatalogStatus(JSON.stringify([{ hash, kind: 'gold' }])).problem, 'bad-kind');
  assert.equal(codeCatalogStatus(JSON.stringify([{ hash: hash.slice(0, 40), kind: 'owner' }])).problem, 'bad-hash');
  const reported = JSON.stringify(codeCatalogStatus(pro.code));
  assert.equal(reported.includes(pro.code), false);
});

test('/api/config counts usable records by kind so a missing or expired owner row is visible', () => {
  const owner = generate('owner');
  const pro = generate('alpha-pro');
  const white = generate('free-white');
  const ownerRow = JSON.parse(owner.record) as Record<string, unknown>;
  const expiredOwner = JSON.stringify({ ...JSON.parse(generate('owner').record), expiresAt: '2020-01-01T00:00:00.000Z' });
  const retiredPro = JSON.stringify({ ...JSON.parse(generate('alpha-pro').record), retired: true });
  const status = codeCatalogStatus([owner.record, JSON.stringify(ownerRow), pro.record, white.record, expiredOwner, retiredPro].join('\n'));
  assert.equal(status.entries, 5);
  assert.equal(status.duplicates, 1);
  assert.deepEqual(status.kinds, { owner: 1, 'alpha-coach': 0, 'alpha-pro': 1, 'alpha-student': 0, 'free-white': 1, 'alpha-media': 0 });
  const text = JSON.stringify(status);
  for (const row of [owner, pro, white]) {
    assert.equal(text.includes(row.code), false);
    assert.equal(text.includes((JSON.parse(row.record) as { hash: string }).hash.slice(0, 8)), false);
  }
});

test('the catalog checker script reads a one-per-line paste and confirms a matching code', () => {
  const pro = generate('alpha-pro');
  const run = (input: string, code: string) =>
    execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', 'scripts/check-code-catalog.ts'], {
      input,
      env: { ...process.env, CODE_HASH_PEPPER: pepper, CHECK_CODE: code },
      encoding: 'utf8',
    });
  const out = run(`${pro.record}\n`, pro.code);
  assert.match(out, /Records read: 1/);
  assert.match(out, /CHECK_CODE matches a alpha-pro record/);
  assert.equal(out.includes(pro.code), false);
  assert.equal(out.includes((JSON.parse(pro.record) as { hash: string }).hash), false);
});
