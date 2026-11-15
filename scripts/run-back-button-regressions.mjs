import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

mkdirSync('.regression-cache', { recursive: true });
const outfile = resolve('.regression-cache/back-button-regressions.test.mjs');
await build({
  entryPoints: ['src/components/BackButton.regressions.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict', 'node:fs', 'node:path'],
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty' },
  plugins: [paidChunksStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
