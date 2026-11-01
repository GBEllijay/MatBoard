import { generateKeyPairSync } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

/**
 * Offline / install regressions. These need the real service worker, so they run
 * against a production build (`vite preview`), never the dev server.
 *
 * A throwaway ES256 signing key is made in memory for each run. It is handed to
 * the preview server's /api through the environment and to the tests the same
 * way. It is never written to disk or printed. No real keys are involved.
 *
 * Run: npm run test:e2e:offline   (builds first)
 */
if (!process.env.MB_OFFLINE_E2E_SIGNING_KEY) {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = privateKey.export({ format: 'jwk' });
  process.env.MB_OFFLINE_E2E_SIGNING_KEY = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d });
}

export const OFFLINE_UPSTREAM_PORT = 4191;

export default defineConfig({
  testDir: 'e2e-offline',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'allow',
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${OFFLINE_UPSTREAM_PORT} --strictPort`,
    url: `http://127.0.0.1:${OFFLINE_UPSTREAM_PORT}/version.json`,
    reuseExistingServer: false,
    env: {
      ENTITLEMENT_SIGNING_KEY: process.env.MB_OFFLINE_E2E_SIGNING_KEY,
      ENTITLEMENT_KEY_ID: 'k1',
      // Keep the throwaway run away from any real Stripe, email or code settings.
      STRIPE_SECRET_KEY: '',
      RESEND_API_KEY: '',
      CODE_HASH_PEPPER: '',
      OWNER_TEST_SECRET: '',
    },
  },
});
