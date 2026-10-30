import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

mkdirSync('.regression-cache', { recursive: true });
const outfile = '.regression-cache/bracket-regressions.test.mjs';
await build({
  entryPoints: ['src/components/bracketRegressions.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  logLevel: 'silent',
  plugins: [paidChunksStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
