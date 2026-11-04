import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

const skinFontsStub = {
  name: 'skin-fonts-stub',
  setup(b) {
    b.onResolve({ filter: /^@fontsource\// }, (args) => ({ path: args.path, namespace: 'skin-font' }));
    b.onLoad({ filter: /.*/, namespace: 'skin-font' }, () => ({ contents: '', loader: 'js' }));
  },
};

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
  plugins: [paidChunksStub, skinFontsStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
