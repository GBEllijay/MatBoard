import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { build } from 'vite';

const root = fileURLToPath(new URL('../..', import.meta.url));

const MARKERS = [
  'Program director seat. Media Console is open on this browser.',
  'Photo interval presets',
  'That file is not a picture this board can keep.',
  'This lesson could not be opened.',
  'Advantage - Coach Unlimited',
  'No class photo was submitted with this plan.',
  // Unlocked /media hub menu (MediaEditionHub.tsx).
  'Advantage Media Edition menu',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}

test('paid screen code is outside the precache and the public bundle', { timeout: 180_000 }, async () => {
  await build({ configFile: join(root, 'vite.config.ts'), logLevel: 'error' });
  const dist = join(root, 'dist');
  const paidRoot = join(dist, 'paid') + sep;
  const files = walk(dist);
  const paidFiles = files.filter((file) => file.startsWith(paidRoot));
  const publicFiles = files.filter((file) => !file.startsWith(paidRoot));
  assert.ok(paidFiles.some((file) => file.endsWith('.js')));
  for (const marker of MARKERS) {
    assert.ok(
      paidFiles.some((file) => readFileSync(file, 'utf8').includes(marker)),
      `missing from paid chunks: ${marker}`,
    );
    for (const file of publicFiles) {
      if (!file.endsWith('.js') && !file.endsWith('.css') && !file.endsWith('.html') && !file.endsWith('.map')) continue;
      const text = readFileSync(file, 'utf8');
      assert.equal(text.includes(marker), false, `${marker} leaked into ${file}`);
    }
  }

  const entryScripts = publicFiles.filter((file) => file.endsWith('.js') && file.includes(`${sep}assets${sep}`));
  assert.ok(entryScripts.some((file) => /import\(\s*["'][^"']*\/paid\//.test(readFileSync(file, 'utf8'))));
  for (const file of entryScripts) {
    const text = readFileSync(file, 'utf8');
    assert.equal(/from["'][^"']*\/paid\//.test(text), false, file);
    assert.equal(text.includes('import"../paid/') || text.includes("import'../paid/"), false, file);
  }
  assert.ok(
    entryScripts.some((file) => readFileSync(file, 'utf8').includes('OneDrive sign-in needs a browser.')),
    'OneDrive sign-in must stay in the public bundle',
  );
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  assert.equal(html.includes('/paid/'), false);

  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  const precacheUrls = [...sw.matchAll(/url:"([^"]+)"/g)].map((match) => match[1]);
  assert.ok(precacheUrls.length > 5);
  for (const url of precacheUrls) assert.equal(url.includes('paid/'), false, url);
  assert.match(sw, /paid-chunks/);
});
