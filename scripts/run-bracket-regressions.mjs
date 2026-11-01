import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { paidChunksStub } from './paidChunksStub.mjs';

/** Self-hosted skin fonts are CSS side effects; node cannot load them, and these tests do not need them. */
const skinFontsStub = {
  name: 'skin-fonts-stub',
  setup(b) {
    b.onResolve({ filter: /^@fontsource\// }, (args) => ({ path: args.path, namespace: 'skin-font' }));
    b.onLoad({ filter: /.*/, namespace: 'skin-font' }, () => ({ contents: '', loader: 'js' }));
  },
};

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
  // The polished skin chunks (reached through MatchDisplay) carry background art and fonts.
  loader: { '.jpg': 'empty', '.png': 'empty', '.webp': 'empty' },
  logLevel: 'silent',
  plugins: [paidChunksStub, skinFontsStub],
});

const result = spawnSync(process.execPath, ['--test', '--test-force-exit', outfile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
