import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { createAppShellHandler, createAppShellNavigation } from './src/server/appShellSw.ts';
import { cardPagePlugin } from './src/server/cardPagePlugin.ts';
import { halfOffPagePlugin } from './src/server/halfOffPagePlugin.ts';
import { paidChunkPlugin } from './src/server/paidChunkPlugin.ts';
import { ONETIME_FAIL_OPEN_DAYS, ONETIME_TOKEN_DAYS } from './src/server/paywallDecisions.ts';
import { whitePurchaseApiPlugin } from './src/server/devApiPlugin.ts';

const appShellNavigation = createAppShellNavigation();
const appShellHandler = createAppShellHandler();
/** Saved paid files may sit this long. Matches the longest offline window already issued (30-day token + 90-day fail-open). Opening them still depends on the pass. */
const PAID_CHUNK_CACHE_MAX_AGE_SECONDS = (ONETIME_TOKEN_DAYS + ONETIME_FAIL_OPEN_DAYS) * 24 * 60 * 60;

/** Build id written into the app and into /version.json (Cache-Control: no-store). */
function matboardBuildStamp(): Plugin {
  const builtAt = new Date().toISOString();
  const raw = process.env.CF_PAGES_COMMIT_SHA || process.env.GITHUB_SHA || process.env.COMMIT_REF || 'local';
  const stamp = { version: raw.slice(0, 7), builtAt };
  const json = JSON.stringify(stamp);
  return {
    name: 'matboard-build-stamp',
    config() {
      return { define: { __MATBOARD_BUILD__: json } };
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/version.json') {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(json);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: json });
    },
  };
}

export default defineConfig({
  plugins: [
    matboardBuildStamp(),
    whitePurchaseApiPlugin(),
    cardPagePlugin(),
    halfOffPagePlugin(),
    react(),
    paidChunkPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.png', 'favicon.svg', 'advantage-icon.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'home-mat-tatami.png', 'sounds/parou-stop-gaming-mic.mp3', 'sounds/parou-stop.mp3', 'sounds/parou.mp3'],
      manifest: {
        name: 'Advantage',
        short_name: 'Advantage',
        description: "Gym match scoreboard, round timer, and Gym Owner and Instructor's Console.",
        theme_color: '#0b0d10',
        background_color: '#0b0d10',
        // Home-screen app opens fullscreen: no Android status bar or battery
        // row. Browsers without fullscreen app mode fall back to standalone.
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Full offline install (owner 2026-11-01). Everything the app shell
        // needs is precached when the service worker installs: index.html, the
        // hashed JS/CSS chunks, icons, images, sounds, and the decorative fonts
        // (fonts/*.ttf, the .woff fallbacks). The precache is keyed by content
        // revision, so it stays until the next deploy replaces it.
        //
        // Navigations still go to the network first (a fresh deploy shows up
        // right away online). Only when the network fails or takes longer than
        // 4s does the worker answer with the precached index.html for that
        // app route. /api, /paid, /card and /half-off never get the app shell.
        globPatterns: ['index.html', '**/*.{js,css,ico,png,jpg,jpeg,svg,woff,woff2,ttf,otf,webp,mp3,wav,ogg,webmanifest}'],
        globIgnores: [
          '**/branding/**',
          // Only the root worker files. The workbox-window chunk in /assets is
          // loaded by registerSW and must be precached like any other chunk.
          'sw.js',
          'workbox-*.js',
          '**/version.json',
          '**/card.html',
          '**/card-logo.*',
          '**/card-qr.*',
          '**/half-off.html',
          '**/half-off/**',
          // Token-checked screens. Precaching them would ship the code with no grant check.
          'paid/**',
          '**/paid/**',
        ],
        // Biggest app chunk is ~1.7 MB; keep headroom so nothing is silently skipped.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Workbox's own fallback route is cache-first. appShellHandler below is
        // network-first and uses the precached shell only when the network fails.
        navigateFallback: null,
        // Do not map "/" onto the precached index.html. That match is cache-first,
        // so the home screen would ignore the network until the next worker.
        directoryIndex: null,
        navigateFallbackDenylist: [/^\/api\//, /^\/paid\//, /^\/card\/?(?:$|\?)/, /^\/half-off\/?(?:$|\?)/],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Saved after an authorized fetch. Offline opens use this copy.
            // The browser's token check is the offline gate (D10).
            // The prefetch itself sends Authorization. This route must not also
            // store that response: a second write races the page's cache.put and
            // can drop the file before an offline import reads it.
            urlPattern: ({ request, url }: { request: { headers?: { has?: (name: string) => boolean } }; url: { pathname: string } }) =>
              request.headers?.has?.('authorization') !== true && /\/paid\/.+\.(?:js|css)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'paid-chunks',
              // The server answers paid files with Vary: Authorization, Cookie for
              // shared HTTP caches. A screen's own import carries neither header, so
              // a copy saved by the authorized prefetch would never match offline.
              // Cache Storage is this browser's own; the token check in
              // preparePaidImport still decides whether the import may run.
              matchOptions: { ignoreVary: true },
              expiration: { maxEntries: 40, maxAgeSeconds: PAID_CHUNK_CACHE_MAX_AGE_SECONDS },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // App routes (every path the SPA serves through /* /index.html).
            // Fresh from the network when it answers within 4s; otherwise the
            // precached index.html of this deploy, which always matches the
            // precached JS/CSS. No per-URL HTML copy is kept, so an old page can
            // never point at chunks a newer deploy has already cleaned up.
            // /api and /paid are excluded. /card and /half-off are separate pages.
            urlPattern: appShellNavigation,
            handler: appShellHandler,
          },
          {
            // /card and /half-off are their own small pages. Last good copy offline.
            urlPattern: ({ request, url }) => request.mode === 'navigate' && /^\/(?:card|half-off)(?:\/|\.html)?$/.test(url.pathname),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
