import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

mkdirSync('.regression-cache', { recursive: true });
const outfile = resolve('.regression-cache/student-alerts-regressions.test.mjs');
await build({
  entryPoints: ['src/components/studentAlerts.regressions.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  loader: { '.css': 'empty', '.png': 'dataurl', '.webp': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl' },
  logLevel: 'silent',
  plugins: [paidChunksStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', '--test-timeout=20000', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
