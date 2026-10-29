import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { planPaidBundle, rewriteRelativeUrls } from './paidChunkBundle.ts';

test('only chunks reachable from the paid screens move under /paid', () => {
  const plan = planPaidBundle([
    {
      fileName: 'assets/index.js',
      name: 'index',
      isEntry: true,
      imports: ['assets/react.js'],
      dynamicImports: ['assets/pro-console.js', 'assets/media-console.js'],
    },
    { fileName: 'assets/react.js', name: 'react', isEntry: false, imports: [], dynamicImports: [] },
    {
      fileName: 'assets/pro-console.js',
      name: 'pro-console',
      isEntry: false,
      imports: ['assets/index.js', 'assets/react.js', 'assets/pro-only.js'],
      dynamicImports: [],
    },
    { fileName: 'assets/pro-only.js', name: 'pro-only', isEntry: false, imports: ['assets/react.js'], dynamicImports: [] },
    {
      fileName: 'assets/media-console.js',
      name: 'media-console',
      isEntry: false,
      imports: ['assets/pro-only.js'],
      dynamicImports: [],
    },
    { fileName: 'assets/lesson-cloud.js', name: 'lesson-cloud', isEntry: false, imports: [], dynamicImports: [] },
    {
      fileName: 'assets/coach-unlimited.js',
      name: 'coach-unlimited',
      isEntry: false,
      imports: ['assets/shared-paid.js'],
      dynamicImports: [],
    },
    { fileName: 'assets/shared-paid.js', name: 'shared-paid', isEntry: false, imports: [], dynamicImports: [] },
  ]);

  assert.equal(plan.moves.get('assets/pro-console.js'), 'paid/pro-console.js');
  assert.equal(plan.moves.get('assets/pro-only.js'), 'paid/pro-only.js');
  assert.equal(plan.moves.get('assets/shared-paid.js'), 'paid/shared-paid.js');
  assert.equal(plan.moves.has('assets/react.js'), false);
  assert.equal(plan.moves.has('assets/index.js'), false, 'the app entry stays public when paid screens import it');
  assert.ok(plan.filesForChunk['pro-console'].includes('/paid/pro-only.js'));
  assert.ok(plan.filesForChunk['media-console'].includes('/paid/pro-only.js'));
  assert.deepEqual(plan.manifestFiles['pro-only.js'], ['pro-console', 'media-console']);
  assert.ok(plan.filesForChunk['lesson-cloud'].includes('/paid/lesson-cloud.js'));
  assert.equal(plan.filesForChunk['coach-unlimited'].includes('/paid/react.js'), false);
});

test('relative imports follow a chunk when it moves to /paid', () => {
  const map = new Map<string, string>([
    ['assets/index.js', 'assets/index.js'],
    ['assets/pro-console-abc.js', 'paid/pro-console-abc.js'],
    ['assets/react.js', 'assets/react.js'],
  ]);
  const entry = rewriteRelativeUrls('import"./pro-console-abc.js";import"./react.js";', 'assets/index.js', 'assets/index.js', map);
  assert.equal(entry, 'import"../paid/pro-console-abc.js";import"./react.js";');
  const paid = rewriteRelativeUrls('import"./react.js";const label="./not-a-file";', 'assets/pro-console-abc.js', 'paid/pro-console-abc.js', map);
  assert.equal(paid, 'import"../assets/react.js";const label="./not-a-file";');
});

test('the service worker names the paid cache and ignores the paid directory', () => {
  const vite = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8');
  const cache = readFileSync(new URL('../lib/paidChunkCache.ts', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../../public/_routes.json', import.meta.url), 'utf8');
  assert.match(vite, /cacheName: 'paid-chunks'/);
  assert.match(vite, /'paid\/\*\*'/);
  assert.match(cache, /PAID_CHUNK_CACHE/);
  assert.match(routes, /\/paid\/\*/);
  const screen = readFileSync(new URL('../components/PaidScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /Try again/);
  assert.match(screen, /Refresh access/);
  assert.match(screen, /Restore access/);
  assert.match(screen, /Enter a code/);
  assert.match(screen, /role="status"/);
});
