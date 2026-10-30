import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { cardPagePlugin } from './src/server/cardPagePlugin.ts';
import { halfOffPagePlugin } from './src/server/halfOffPagePlugin.ts';
import { paidChunkPlugin } from './src/server/paidChunkPlugin.ts';
import { whitePurchaseApiPlugin } from './src/server/devApiPlugin.ts';

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
        display: 'standalone',
        display_override: ['standalone', 'fullscreen'],
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
        // index.html used to be precached and served cache-first for every
        // navigation (createHandlerBoundToURL). Returning browsers kept that
        // shell; a fresh profile with no worker saw the new deploy.
        // Navigations now try the network first. Hashed JS/CSS and media stay
        // precached so an offline gym TV can still open the last good build.
        globPatterns: ['**/*.{js,css,ico,png,jpg,svg,woff2,webp,mp3}'],
        globIgnores: [
          '**/branding/**',
          '**/sw.js',
          '**/workbox-*.js',
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
        navigateFallback: null,
        // /card is the lightweight card.html page. Keep it off any app-shell fallback.
        navigateFallbackDenylist: [/^\/api\//, /^\/paid\//, /^\/card\/?(?:$|\?)/, /^\/half-off\/?(?:$|\?)/],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Saved after an authorized fetch. Offline opens use this copy.
            // The browser's token check is the offline gate (D10).
            urlPattern: /\/paid\/.+\.(?:js|css)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'paid-chunks',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
});
