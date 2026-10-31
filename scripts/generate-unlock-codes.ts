/**
 * Print a fresh unlock code and its peppered hash.
 * The code is written only to this process's stdout. Nothing is saved.
 *
 *   CODE_HASH_PEPPER='…' node --experimental-strip-types scripts/generate-unlock-codes.ts --kind owner
 *
 * Kinds: owner, alpha-coach, alpha-pro, alpha-student, free-white, alpha-media
 */

import { keyedHash, normalizeCode } from '../src/server/codeCrypto.ts';
import { CODE_KINDS, type CodeKind } from '../src/server/codeCatalog.ts';

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? '') : '';
}

const kind = arg('--kind') as CodeKind;
if (!(CODE_KINDS as readonly string[]).includes(kind)) {
  console.error(`Pass --kind ${CODE_KINDS.join('|')}`);
  process.exit(1);
}

const pepper = process.env.CODE_HASH_PEPPER?.trim() ?? '';
if (!pepper) {
  console.error('Set CODE_HASH_PEPPER in the environment. Do not commit it.');
  process.exit(1);
}

const bytes = new Uint8Array(18);
crypto.getRandomValues(bytes);
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code = '';
for (const byte of bytes) code += alphabet[byte % alphabet.length];
const grouped = code.match(/.{1,4}/g)?.join('-') ?? code;
const hash = await keyedHash(normalizeCode(grouped), pepper, 'code');
const record = { id: `${kind}-${hash.slice(0, 8)}`, hash, kind };

console.log('Code (show once, do not commit):');
console.log(grouped);
console.log('');
console.log('Catalog record:');
console.log(JSON.stringify(record));
console.log('');
console.log('CODE_CATALOG value if this is your only code (a JSON array):');
console.log(JSON.stringify([record]));
console.log('For more codes, put every record inside one [ ], separated by commas.');
console.log('Check a catalog before you paste it: node --experimental-strip-types scripts/check-code-catalog.ts catalog.json');
console.log('');
console.log(`KV key: code:${hash}`);
