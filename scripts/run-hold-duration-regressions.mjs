import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

mkdirSync('node_modules/.cache', { recursive: true });
const outfile = resolve('node_modules/.cache/hold-duration-regressions.test.mjs');
await build({
  entryPoints: ['src/components/holdDuration.regression.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.jpg': 'empty', '.png': 'empty', '.webp': 'empty' },
  logLevel: 'silent',
  plugins: [paidChunksStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
