import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

// Bundle inside node_modules/.cache so external packages (react, happy-dom) resolve.
mkdirSync('node_modules/.cache', { recursive: true });
const outfile = resolve('node_modules/.cache/image-rights.regressions.test.mjs');
await build({
  entryPoints: ['src/components/imageRightsConfirm.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  logLevel: 'silent',
  loader: { '.css': 'empty' },
  plugins: [paidChunksStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
