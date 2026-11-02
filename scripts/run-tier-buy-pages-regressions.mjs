import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

mkdirSync('node_modules/.cache', { recursive: true });
const outfile = resolve('node_modules/.cache/tier-buy-pages.test.mjs');
await build({
  entryPoints: ['src/pages/tierBuyPages.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  // Styles are not under test here; the CSS is checked in src/lib/tierBuyPages.test.ts.
  loader: { '.css': 'empty' },
  logLevel: 'silent',
  plugins: [paidChunksStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
