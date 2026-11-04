import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

mkdirSync('node_modules/.cache', { recursive: true });
const outfile = resolve('node_modules/.cache/skin-picker-regressions.test.mjs');
await build({
  entryPoints: ['src/components/skinPicker.regression.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  loader: { '.css': 'empty', '.jpg': 'empty', '.png': 'empty', '.webp': 'empty' },
  logLevel: 'silent',
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
