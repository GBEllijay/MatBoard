import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

mkdirSync('.regression-cache', { recursive: true });
const outfile = '.regression-cache/clear-competitor-name.test.mjs';
await build({
  entryPoints: ['src/components/clearCompetitorName.test.tsx'],
  bundle: true,
  loader: { '.css': 'empty', '.jpg': 'empty', '.png': 'empty', '.webp': 'empty', '.svg': 'empty', '.woff': 'empty', '.woff2': 'empty' },
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
