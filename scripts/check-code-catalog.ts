/**
 * Check a CODE_CATALOG value on your own machine before you paste it into Cloudflare.
 * Nothing is sent anywhere and nothing is saved.
 *
 *   node --experimental-strip-types scripts/check-code-catalog.ts catalog.json
 *   pbpaste | node --experimental-strip-types scripts/check-code-catalog.ts
 *
 * Optional: also confirm that one code matches, using the same pepper as Cloudflare.
 *   CODE_HASH_PEPPER='…' CHECK_CODE='ABCD-…' node --experimental-strip-types scripts/check-code-catalog.ts catalog.json
 */

import { readFileSync } from 'node:fs';
import { findCode, parseCodeCatalogDetailed } from '../src/server/codeCatalog.ts';
import { keyedHash, normalizeCode } from '../src/server/codeCrypto.ts';

const path = process.argv[2];
const raw = path ? readFileSync(path, 'utf8') : readFileSync(0, 'utf8');
const parsed = parseCodeCatalogDetailed(raw);

console.log(`Records read: ${parsed.records.length}`);
const kinds = new Map<string, number>();
for (const record of parsed.records) kinds.set(record.kind, (kinds.get(record.kind) ?? 0) + 1);
for (const [kind, count] of kinds) console.log(`  ${kind}: ${count}`);
if (parsed.rejected) console.log(`Rows skipped (bad kind or hash): ${parsed.rejected}`);
if (!parsed.readable) console.log('Could not read this value. Paste the JSON the generator printed.');

const pepper = process.env.CODE_HASH_PEPPER?.trim() ?? '';
const code = process.env.CHECK_CODE ?? '';
if (pepper && code) {
  const hash = await keyedHash(normalizeCode(code), pepper, 'code');
  const match = findCode(parsed.records, hash);
  console.log(match ? `CHECK_CODE matches a ${match.kind} record.` : 'CHECK_CODE does not match any record with this pepper.');
}

process.exit(parsed.records.length > 0 && parsed.readable ? 0 : 1);
