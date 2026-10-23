import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';

// Absolute path: Node's test glob skips a relative file inside node_modules.
mkdirSync('node_modules/.cache', { recursive: true });
const outfile = resolve('node_modules/.cache/entry-forms.test.mjs');
await build({
  entryPoints: ['src/pages/student/entryForms.test.tsx'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  packages: 'external',
  external: ['node:test', 'node:assert', 'node:assert/strict'],
  jsx: 'automatic',
  loader: { '.css': 'empty' },
  logLevel: 'silent',
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
