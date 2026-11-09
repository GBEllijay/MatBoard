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
  'Lesson drafts waiting for Google Drive',
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
  const paidNames = new Set(paidFiles.map((file) => file.split(sep).pop() ?? ''));
  for (const file of entryScripts) {
    const text = readFileSync(file, 'utf8');
    for (const name of paidNames) {
      if (!name) continue;
      assert.equal(
        text.includes(`assets/${name}`),
        false,
        `${name} lives under /paid but ${file} still preloads assets/${name}`,
      );
    }
  }
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

  // Full offline install (owner 2026-11-01): the shell and every static asset
  // the app loads are precached, so a cold offline open works after any gap.
  const precached = new Set(precacheUrls);
  assert.ok(precached.has('index.html'), 'index.html must be precached for the offline app shell');
  assert.ok(precached.has('manifest.webmanifest'));
  for (const url of ['fonts/Inter-Regular.ttf', 'fonts/Inter-Bold.ttf', 'fonts/GreatVibes-Regular.ttf', 'fonts/PatrickHand-Regular.ttf']) {
    assert.ok(precached.has(url), `${url} must be precached`);
  }
  assert.ok(precacheUrls.some((url) => /^assets\/.+\.woff$/.test(url)), 'storefront .woff fallbacks must be precached');
  assert.ok(precacheUrls.some((url) => /^assets\/.+\.woff2$/.test(url)));
  assert.ok(precacheUrls.some((url) => /^assets\/workbox-window.+\.js$/.test(url)), 'registerSW chunk must be precached');
  for (const file of publicFiles) {
    const rel = file.slice(dist.length + 1).split(sep).join('/');
    if (!/\.(?:js|css|png|jpe?g|svg|webp|woff2?|ttf|mp3|ico)$/.test(rel)) continue;
    if (/^(?:sw\.js|workbox-[^/]+\.js|branding\/|card-|half-off)/.test(rel)) continue;
    assert.ok(precached.has(rel), `${rel} is shipped but not precached`);
  }
  // Navigations: network first, precached shell on failure or after 4s. No 24h expiry.
  // "/" is not mapped onto index.html by the precache (that path is cache-first).
  assert.match(sw, /directoryIndex:null/);
  assert.match(sw, /caches\.match\("\/index\.html",\{ignoreSearch:!0\}\)/);
  assert.equal(sw.includes('maxAgeSeconds:86400'), false, 'pages must not expire after 24h');
  assert.equal(/createHandlerBoundToURL/.test(sw), false, 'no cache-first navigation fallback');
  assert.match(sw, /ignoreVary:!0/, 'a saved paid file must match an import that sends no Authorization header');
  assert.match(sw, /has\("authorization"\)/, 'the worker must not cache the authorized prefetch; the page writes that copy once');
  const sounds = publicFiles.filter((file) => file.includes(`${sep}sounds${sep}`) && file.endsWith('.mp3'));
  assert.ok(sounds.length >= 9, `the shipped sound files should all be in the build (saw ${sounds.length})`);
  for (const file of sounds) {
    const rel = file.slice(dist.length + 1).split(sep).join('/');
    assert.ok(precached.has(rel), `${rel} must be precached`);
  }

  // Home-screen install: public manifest, opens fullscreen, icons ship, linked from index.html.
  const manifest = JSON.parse(readFileSync(join(dist, 'manifest.webmanifest'), 'utf8')) as {
    name: string;
    short_name: string;
    display: string;
    display_override: string[];
    start_url: string;
    scope: string;
    icons: { src: string; sizes: string }[];
  };
  assert.equal(manifest.name, 'Advantage');
  assert.equal(manifest.short_name, 'Advantage');
  assert.equal(manifest.display, 'fullscreen');
  assert.deepEqual(manifest.display_override, ['fullscreen', 'standalone']);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  for (const size of ['192x192', '512x512']) assert.ok(manifest.icons.some((icon) => icon.sizes === size), size);
  for (const icon of manifest.icons) assert.ok(statSync(join(dist, icon.src)).size > 0, icon.src);
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest">/);
  assert.match(html, /<meta name="theme-color" content="#0b0d10"/);
});
